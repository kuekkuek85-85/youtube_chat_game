-- 유튜브 댓글 → 캐릭터 선물상자 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
-- (이 파일이 바뀌면 다시 통째로 실행하면 됩니다. 기존 데이터는 지우지 않습니다.)

-- 1) 수집한 라이브 채팅 원본 (3회 행사 후 삭제 대상)
create table if not exists chat_messages (
  id            text primary key,              -- 유튜브 메시지 ID (중복 방지 키)
  channel_id    text not null,                 -- 작성자 채널 ID
  display_name  text not null,
  message       text not null,
  published_at  timestamptz not null,
  author_role   text not null default 'viewer' -- owner | moderator | viewer
);
create index if not exists chat_messages_channel_idx on chat_messages (channel_id);
-- 어느 방송(영상)의 댓글인지. 리허설·본방송 댓글이 섞이지 않게 참여자 정리 때 이 값으로 거른다.
alter table chat_messages add column if not exists video_id text;
create index if not exists chat_messages_video_idx on chat_messages (video_id);

-- 2) 참여자 (채널 ID 기준으로 묶음)
create table if not exists participants (
  channel_id      text primary key,
  display_name    text not null,
  comment_count   int  not null default 0,
  top_comments    jsonb not null default '[]'::jsonb,  -- 필터를 통과한 대표 댓글 1~3개
  keywords        jsonb not null default '[]'::jsonb,
  excluded        boolean not null default false,
  excluded_reason text,
  updated_at      timestamptz not null default now()
);

-- 3) 캐릭터
create table if not exists characters (
  id            uuid primary key default gen_random_uuid(),
  channel_id    text not null unique references participants (channel_id) on delete cascade,
  display_name  text not null,          -- 검색용 (공개 페이지에 표시)
  name          text,                   -- 예: 승엽핑
  personality   text,
  look          jsonb,                  -- 외형 키워드 3개
  quote         text,                   -- 오늘의 한마디
  comment       text,                   -- 원래 댓글 1개
  image_path    text,                   -- Storage 경로 (1024px)
  thumb_path    text,                   -- Storage 경로 (256px, 갤러리용)
  status        text not null default 'queued'
                check (status in ('queued','done','failed','approved','hidden')),
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists characters_status_idx on characters (status);

-- 4) 설정 (public_open, 수집 상태, 이미지 생성 누적 수 등)
create table if not exists settings (
  key   text primary key,
  value text not null
);
insert into settings (key, value) values ('public_open', 'false') on conflict (key) do nothing;
insert into settings (key, value) values ('images_generated', '0') on conflict (key) do nothing;

-- RLS: 서비스 롤 키(스크립트·관리자 서버)만 쓰기 가능. 공개 키(anon)는 승인 + 공개 ON 인 캐릭터만 읽기.
alter table chat_messages enable row level security;
alter table participants  enable row level security;
alter table characters    enable row level security;
alter table settings      enable row level security;

create or replace function is_public_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true' from settings where key = 'public_open'), false);
$$;
grant execute on function is_public_open() to anon, authenticated;

-- 제외된 참여자(#캐릭터제외 등)의 캐릭터는 실수로 승인돼도 공개되지 않게 DB 에서 한 번 더 막는다
create or replace function character_is_public(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_public_open()
     and not exists (select 1 from participants p where p.channel_id = cid and p.excluded);
$$;
grant execute on function character_is_public(text) to anon, authenticated;

drop policy if exists "public reads approved characters" on characters;
create policy "public reads approved characters" on characters
  for select to anon, authenticated
  using (status = 'approved' and character_is_public(channel_id));

-- 이미지 생성 상한: 동시에 여러 건이 와도 상한 미만일 때만 1 올린다. 올렸으면 새 값, 상한이면 null.
create or replace function reserve_image_slot(cap int) returns int
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  insert into settings (key, value) values ('images_generated', '0') on conflict (key) do nothing;
  update settings set value = (value::int + 1)::text
   where key = 'images_generated' and value::int < cap
   returning value::int into used;
  return used;
end;
$$;
revoke all on function reserve_image_slot(int) from public, anon, authenticated;
grant execute on function reserve_image_slot(int) to service_role;

-- 공개 키로는 필요한 열만 보이게 (오류 메시지 등 내부 열 숨김)
revoke select on characters from anon, authenticated;
grant select (id, display_name, name, personality, look, quote, comment, image_path, thumb_path)
  on characters to anon, authenticated;

-- 5) 이미지 저장소 (공개 버킷. 파일명에 무작위 접미사를 붙여 추측을 어렵게 함)
insert into storage.buckets (id, name, public)
values ('characters', 'characters', true)
on conflict (id) do nothing;
