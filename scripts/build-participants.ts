/**
 * 참여자 정리 (PRD 6-2)
 *
 *   npm run participants [-- --video <영상ID 또는 URL>[,<영상ID>...]] [--dry-run]
 *
 * chat_messages 를 채널 ID 로 묶고, 개인정보·욕설 댓글을 거르고, #캐릭터제외 · 운영진을 제외 표시한다.
 * - 대상 방송: --video 로 지정. 생략하면 마지막으로 수집한 영상(collector_video_id)만 쓴다.
 *   리허설 댓글이 본방송과 섞이지 않는다. 방송이 끊겨 영상 ID 가 둘이 되면 쉼표로 둘 다 넣는다.
 * - 이번 대상에 없는 기존 참여자(예: 리허설 참여자)는 제외(not_in_video)로 바꾸고 캐릭터를 숨긴다.
 * - 이미 만든 캐릭터가 있는 참여자가 제외되면 그 캐릭터는 hidden 으로 바꾼다.
 * STAFF_CHANNEL_IDS (쉼표 구분) 에 운영진 채널 ID 를 넣으면 제외된다. 채널 소유자·모더레이터도 기본 제외.
 * 모더레이터를 포함하려면 EXCLUDE_MODERATORS=false.
 */
import { adminClient, getSetting } from "../src/lib/supabase";
import { buildParticipants, type ChatMessage } from "../src/lib/participants";
import { parseVideoId } from "../src/lib/youtube";

const dryRun = process.argv.includes("--dry-run");
const db = adminClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function targetVideoIds(): Promise<string[]> {
  const given = arg("video");
  if (given) return given.split(",").map((s) => parseVideoId(s.trim())).filter(Boolean);
  const last = await getSetting(db, "collector_video_id");
  if (!last) throw new Error("대상 영상을 알 수 없습니다. --video <영상ID> 로 지정하세요.");
  return [last];
}

async function fetchMessages(videoIds: string[]): Promise<ChatMessage[]> {
  const all: ChatMessage[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db
      .from("chat_messages")
      .select("id, channel_id, display_name, message, published_at, author_role")
      .in("video_id", videoIds)
      .order("published_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    all.push(...(data as ChatMessage[]));
    if (!data || data.length < size) break;
  }
  return all;
}

async function main() {
  const videoIds = await targetVideoIds();
  console.log(`대상 영상: ${videoIds.join(", ")}`);
  const messages = await fetchMessages(videoIds);
  const staff = new Set((process.env.STAFF_CHANNEL_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const participants = buildParticipants(messages, {
    staffChannelIds: staff,
    excludeModerators: process.env.EXCLUDE_MODERATORS !== "false",
  });

  // 관리 페이지에서 수동 제외한 사람은 다시 정리해도 제외 상태를 유지한다
  const { data: existing, error: existingErr } = await db.from("participants").select("channel_id, excluded, excluded_reason");
  if (existingErr) throw existingErr;
  const manualIds = new Set((existing ?? []).filter((m) => m.excluded_reason === "manual").map((m) => m.channel_id as string));
  for (const p of participants) {
    if (manualIds.has(p.channel_id)) {
      p.excluded = true;
      p.excluded_reason = "manual";
    }
  }
  // 이번 방송에 댓글이 없는 기존 참여자 (리허설 등)
  const currentIds = new Set(participants.map((p) => p.channel_id));
  const staleIds = (existing ?? [])
    .filter((m) => !currentIds.has(m.channel_id as string) && m.excluded_reason !== "not_in_video" && m.excluded_reason !== "manual")
    .map((m) => m.channel_id as string);

  const included = participants.filter((p) => !p.excluded);
  const reasons = participants.reduce<Record<string, number>>((acc, p) => {
    if (p.excluded_reason) acc[p.excluded_reason] = (acc[p.excluded_reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`댓글 ${messages.length}건 → 참여자 ${participants.length}명 (생성 대상 ${included.length}명)`);
  console.log("제외:", reasons);
  if (staleIds.length) console.log(`이번 방송에 없는 기존 참여자 ${staleIds.length}명은 제외(not_in_video)로 바꿉니다.`);

  if (dryRun) {
    for (const p of participants.slice(0, 15)) {
      console.log(`- ${p.display_name} (${p.comment_count}건)${p.excluded ? ` [제외: ${p.excluded_reason}]` : ""}: ${p.top_comments[0] ?? ""}`);
    }
    return;
  }

  const now = new Date().toISOString();
  for (let i = 0; i < participants.length; i += 500) {
    const chunk = participants.slice(i, i + 500).map((p) => ({ ...p, updated_at: now }));
    const { error } = await db.from("participants").upsert(chunk, { onConflict: "channel_id" });
    if (error) throw error;
  }
  for (let i = 0; i < staleIds.length; i += 500) {
    const { error } = await db
      .from("participants")
      .update({ excluded: true, excluded_reason: "not_in_video", updated_at: now })
      .in("channel_id", staleIds.slice(i, i + 500));
    if (error) throw error;
  }

  const excludedIds = [...participants.filter((p) => p.excluded).map((p) => p.channel_id), ...staleIds];
  let hidden = 0;
  for (let i = 0; i < excludedIds.length; i += 500) {
    const { data, error } = await db
      .from("characters")
      .update({ status: "hidden", updated_at: now })
      .in("channel_id", excludedIds.slice(i, i + 500))
      .neq("status", "hidden")
      .select("channel_id");
    if (error) throw error;
    hidden += data?.length ?? 0;
  }
  if (hidden) console.log(`제외된 참여자의 캐릭터 ${hidden}개를 숨김 처리했습니다.`);
  console.log("participants 테이블을 갱신했습니다. 다음 단계: npm run generate");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
