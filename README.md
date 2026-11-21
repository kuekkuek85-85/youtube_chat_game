# 유튜브 댓글 → 캐릭터 선물상자

「교사 개발자의 날」 2회 공개방송(2026. 11. 24.) 온라인 이벤트.
라이브 댓글을 모아 참여자별 오리지널 "○○핑" 캐릭터를 만들고, 선물상자 페이지(`/gift`)에서 닉네임으로 찾아 가게 합니다.

원칙: **수집만 실시간, 생성은 방송 후.**

```
[방송 중]  npm run collect            → chat_messages (Supabase)
[방송 후]  npm run participants       → participants (묶기·필터·제외)
           npm run generate           → characters + Storage 이미지
           /admin 에서 검수(승인·숨김·재생성) → 공개 ON
[청취자]   /gift 에서 닉네임 검색 → 카드 보기·이미지 저장
```

## 구성

| 경로 | 내용 |
|---|---|
| `supabase/schema.sql` | 테이블, RLS, 공개 버킷. SQL Editor 에서 한 번 실행 |
| `scripts/collect-chat.ts` | 댓글 수집기 (pollingIntervalMillis 준수, 메시지 ID 로 중복 방지, 재시도, 이어 받기) |
| `scripts/collect-forever.ps1` | 수집기가 죽으면 10초 뒤 자동 재시작 |
| `scripts/build-participants.ts` | 채널 ID 로 묶기 + 개인정보·욕설 필터 + `#캐릭터제외` + 운영진 제외 |
| `scripts/generate-characters.ts` | 프로필(LLM) → 이미지 큐 (동시 3건, 재시도 2회, 상한 400장) |
| `scripts/youtube-oauth.ts` | API 키로 안 될 때만: 채널 관리자 OAuth 리프레시 토큰 발급 |
| `src/lib/style.ts` | **스타일 프롬프트·금지어 고정**. 이미지 프롬프트엔 닉네임·이름을 넣지 않음 |
| `src/lib/filters.ts` | 개인정보 정규식, 욕설 목록, `#캐릭터제외` |
| `src/app/admin` | 운영자 페이지 (비밀번호) |
| `src/app/gift` | 공개 선물상자 페이지 (모바일 우선, 한/영) |

## 처음 설정 (11/21)

1. **Supabase** 프로젝트 생성 → SQL Editor 에 `supabase/schema.sql` 붙여 넣고 실행.
2. `.env.example` 을 `.env.local` 로 복사하고 값 채우기.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: Project Settings → API
   - `YOUTUBE_API_KEY`: Google Cloud Console → YouTube Data API v3 사용 설정 → API 키
   - `OPENAI_API_KEY`, `ADMIN_PASSWORD`(8자 이상)
3. `npm install`
4. 아무 공개 라이브로 시험 수집: `npm run collect -- https://www.youtube.com/watch?v=영상ID --fresh`
5. `npm run dev` → http://localhost:3000/admin 에서 수집 건수 확인.

## 스타일 확정 (11/22)

```powershell
npm run participants
npm run generate -- --limit 20
```

/admin 에서 결과를 보고, 스타일을 바꾸려면 `src/lib/style.ts` 의 `STYLE_PROMPT` 를, 품질·비용은 `.env.local` 의 `OPENAI_IMAGE_QUALITY`(low/medium/high)를 고친 뒤 "전체 재생성"으로 비교합니다.
**단가는 시작 전에 OpenAI 가격표에서 확인하세요.** 상한은 `MAX_IMAGES`(재생성 포함 누적).

## 리허설 (11/23, 교육청 채널 테스트 라이브)

확인할 것:
- [ ] **API 키로 수집되는지.** `403 forbidden/insufficientPermissions` 가 나면 OAuth 로 전환:
  Google Cloud → OAuth 클라이언트 ID(데스크톱 앱) 생성 → `YOUTUBE_CLIENT_ID/SECRET` 입력 → `npm run youtube:oauth` → 방송 채널 계정으로 로그인 → 출력된 `YOUTUBE_REFRESH_TOKEN` 을 `.env.local` 에 추가.
- [ ] **할당량.** `liveChatMessages.list` 는 호출당 5 units, 기본 하루 10,000 units. 수집기는 기본 150분 기준 최소 5초 간격(약 9,000 units)으로 돌아갑니다. 할당량은 태평양 시간 자정, 즉 **한국 시간 17:00에 리셋**됩니다. 11/24 17:00 이후로는 방송과 같은 할당량을 쓰므로, 17:00~18:50 사이의 사전 점검은 짧게 하세요. (11/23 리허설이나 11/24 17:00 이전 테스트는 방송 할당량에 영향 없음)
- [ ] 댓글 100% 수집·중복 0: 테스트 라이브에서 직접 단 댓글 수와 /admin 수집 건수를 비교.
- [ ] 운영진 채널 ID 를 `STAFF_CHANNEL_IDS` 에 등록 (채널 소유자·모더레이터는 자동 제외).

## 방송 당일 (11/24)

18:50, 터미널에서:

```powershell
npm run collect:forever -- https://www.youtube.com/watch?v=영상ID
```

- 방송 시작 전이면 "활성 라이브 채팅이 없습니다"로 10초마다 다시 시도하다가 방송이 열리면 붙습니다.
- 수집기가 죽어도 자동 재시작되고, 저장해 둔 위치(nextPageToken)부터 이어 받습니다.
- 할당량 초과·권한 오류면 재시작하지 않고 멈춥니다 (/admin "수집 상태"에 표시).
- 21:00 이후 채팅이 닫히면 스스로 끝납니다. 직접 끝내려면 Ctrl+C 두 번.
- 노트북 절전 모드를 꺼 두세요.

방송 중 안내 멘트: *"댓글 닉네임과 내용으로 캐릭터를 만들어 선물상자 페이지에 공개합니다. 원하지 않으시면 댓글로 '#캐릭터제외'를 남겨 주세요."*

## 방송 후 (11/25~26)

```powershell
npm run participants -- --dry-run   # 숫자·제외 사유 미리 보기
npm run participants
npm run generate                    # 350명 기준 동시 3건, 진행률·남은 시간 표시
npm run generate -- --retry-failed  # 실패 건 다시
```

참여자 정리는 **마지막으로 수집한 영상의 댓글만** 씁니다. 리허설 댓글이 남아 있어도 섞이지 않고, 리허설에만 있던 참여자는 "이번 방송 댓글 없음"으로 제외됩니다.
다른 영상을 지정하거나, 방송이 끊겨 영상 ID 가 둘이 됐다면: `npm run participants -- --video 영상ID1,영상ID2`

/admin 에서:
1. "생성 완료" 탭에서 카드 확인 → 이상한 건 **숨김** 또는 **재생성**(이미지만 / 전체).
2. 괜찮으면 **생성 완료 전체 승인**.
3. 방송 밖에서 제외 요청을 받으면 "미생성 참여자"·카드에서 **제외** (다시 정리해도 유지됨).
4. **공개 ON** → `/gift` 링크를 유튜브 고정 댓글·인스타에 안내.

놓친 구간이 있으면 유튜브 스튜디오의 채팅 기록을 보고 운영자가 판단해 보완합니다 (자동 가져오기는 없음).

## 배포 (Vercel)

1. 저장소를 Vercel 에 연결 (또는 `vercel deploy`).
2. 환경변수 등록: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `MAX_IMAGES`.
   (YouTube·STAFF 변수는 로컬 스크립트에서만 쓰므로 필요 없음)
3. /admin 의 "재생성"은 서버에서 이미지 생성을 기다립니다(최대 300초 설정).

## 안전 장치

- 공개 페이지는 **anon 키 + RLS**: `status='approved'` 이고 공개 ON 일 때만, 필요한 열만 읽힘.
- 이미지 프롬프트에는 **외형 키워드·성격만** 들어가고 닉네임·캐릭터 이름은 넣지 않음. 기존 작품명·캐릭터 이름(티니핑 시리즈, 포켓몬 등)은 LLM 출력과 프롬프트에서 두 번 걸러냄 (`src/lib/style.ts` 의 `BANNED_TERMS`).
- 개인정보(전화·이메일·주민번호·계좌·오픈채팅)·욕설 댓글은 LLM 에 보내지 않음.
- 이미지 파일명에 무작위 값을 붙여 추측을 어렵게 함 (버킷은 공개).
- 비밀값은 `.env.local`(git 제외)과 Vercel 환경변수에만.

## 보관 기간

3회(12/15) 행사 후 원본 댓글 삭제 — Supabase SQL Editor:

```sql
truncate chat_messages;
update participants set top_comments = '[]', keywords = '[]';
```

캐릭터 페이지는 유지됩니다 (카드의 "원래 댓글" 한 줄은 `characters.comment` 에 남아 있으니, 지우려면 `update characters set comment = null;`).

## 개발

```powershell
npm test          # 필터·금지어·참여자 묶기·큐·YouTube 파싱 단위 테스트
npm run typecheck
npm run lint
npm run build
```
