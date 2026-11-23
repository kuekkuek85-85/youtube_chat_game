# 유튜브 댓글 → 캐릭터 선물상자

「교사 개발자의 날」 2회 공개방송(2026. 11. 24.) 온라인 이벤트.
라이브 댓글을 모아 참여자별 오리지널 "○○핑" 캐릭터를 만들고, 선물상자 페이지(`/gift`)에서 닉네임으로 찾아 가게 합니다.

원칙: **방송 중에 5분마다 미리 만들고, 마무리 때 공개.**

```
[방송 중]  수집시작.cmd 하나로 두 창이 뜸
             댓글 수집기  (npm run collect:forever)   → chat_messages
             생성 도우미  (npm run live)              → 5분마다 참여자 정리 + 새 참여자만 생성 (20:50 마감)
           운영진이 /admin 에서 새 카드를 틈틈이 승인·숨김
[마무리]   마감 시각에 마지막 회차 → 남은 카드 승인 → 공개 ON → 방송 화면에 /gift 시연
[청취자]   /gift 에서 닉네임 검색 → 카드 보기·이미지 저장
```

방송 후에 한꺼번에 만들 수도 있습니다: `npm run participants` → `npm run generate`.

## 구성

| 경로 | 내용 |
|---|---|
| `supabase/schema.sql` | 테이블, RLS, 공개 버킷. SQL Editor 에서 한 번 실행 |
| `scripts/collect-chat.ts` | 댓글 수집기 (pollingIntervalMillis 준수, 메시지 ID 로 중복 방지, 재시도, 이어 받기) |
| `scripts/collect-forever.ps1` | 수집기가 죽으면 10초 뒤 자동 재시작 |
| `scripts/build-participants.ts` | 채널 ID 로 묶기 + 개인정보·욕설 필터 + `#캐릭터제외` + 운영진 제외 |
| `scripts/generate-characters.ts` | 프로필(LLM) → 이미지 큐 (동시 3건, 재시도 2회, 상한 700장) |
| `scripts/live-generate.ts` | 방송 중 생성 도우미: N분마다(기본 5) 참여자 정리 + 새 참여자 생성, `--video`, `--until 20:50`, 중복 실행 방지 |
| `수집시작.cmd` | 더블클릭 실행 파일: 영상 주소만 넣으면 수집기 + 생성 도우미(마감 `GEN_UNTIL`, 기본 20:50)가 함께 켜짐 |
| `생성시작.cmd` | 생성 도우미 창을 실수로 닫았을 때만 다시 켜는 용도 (이미 돌고 있으면 스스로 끝남) |
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

**18:50 — `수집시작.cmd` 더블클릭 → 영상 주소 붙여 넣기 → Enter.** 이것 하나로 끝입니다.
댓글 수집기 창과 **캐릭터 생성 도우미 창**이 함께 뜹니다. 두 창 모두 닫지 마세요.
(같은 동작: `powershell -ExecutionPolicy Bypass -File scripts\collect-forever.ps1 영상주소 -GenerateUntil 20:50`)

- 방송 시작 전이면 "아직 라이브 채팅이 열리지 않았습니다"가 10초마다 나오다가 방송이 열리면 붙습니다.
- 수집기가 죽어도 자동 재시작되고, 저장해 둔 위치(nextPageToken)부터 이어 받습니다.
- 할당량 초과·권한 오류면 재시작하지 않고 멈춥니다 (/admin "수집 상태"에 표시).
- 21:00 이후 채팅이 닫히면 스스로 끝납니다. 직접 끝내려면 Ctrl+C 두 번.
- 노트북 절전 모드를 꺼 두세요.

생성 도우미 (자동으로 켜짐, 마감 20:50 — 바꾸려면 `수집시작.cmd` 의 `GEN_UNTIL`):

- 수집기에 넣은 **그 영상의 댓글만** 씁니다. 방송 전에 켜 둬도 리허설 참여자는 섞이지 않고, 채팅이 없으면 매 회차 "대상 0명"이라 비용이 들지 않습니다.
- 창을 실수로 닫았으면 `생성시작.cmd` 로 다시 켭니다. 이미 하나가 돌고 있으면 중복 생성을 막으려고 새 창은 스스로 끝납니다.
- 5분마다 참여자를 정리하고, 아직 캐릭터가 없는 사람만 만듭니다. 한 회차가 5분보다 길면 끝나자마자 다음 회차를 시작합니다.
- `#캐릭터제외` 를 나중에 남긴 사람은 다음 회차에 제외되고 캐릭터가 숨겨집니다.
- 실패한 건은 다음 회차에 다시 시도합니다 (한 사람당 최대 3회).
- 마감 시각이 지나면 마지막 회차를 한 번 더 돌고 끝납니다.
- 운영진 1명이 /admin "생성 완료" 탭에서 새 카드를 틈틈이 **승인**(이상하면 숨김·재생성)합니다. "이미지 사용량" 칸에 생성 도우미 회차가 보입니다.

**20:50 이후 — 공개:** 생성 도우미 창에 "마지막 회차를 마쳤습니다"가 뜨면 남은 카드 승인 → **공개 ON** → 방송 화면에 `/gift` 띄우고 닉네임 검색 시연.
**베스트 댓글 시상 (2명):** /admin → "🏆 베스트 댓글 시상" (`/admin/award`)에서 **AI 추천 받기**(후보 3개 + 이유, 15~60초, 1센트 미만) → 후보 중 2개를 **선정**(목록에서 직접 검색해 골라도 됨) → "발표 화면 열기"(`/admin/award/show`)를 방송 화면에 띄우고 클릭·스페이스로 한 명씩 공개 (← 로 되돌리기).
같은 사람 두 번, 운영진·모더레이터, 개인정보·욕설 댓글은 고를 수 없습니다. 캐릭터가 있으면 캐릭터 그림이, 없으면 트로피가 나옵니다. 두 화면 모두 운영자 로그인이 필요합니다.

마감 뒤에 채팅한 사람은 방송 후 `npm run participants` → `npm run generate` 로 추가합니다.

방송 중 안내 멘트: *"채팅에 인사 한마디만 남겨도 닉네임으로 '○○핑' 캐릭터를 만들어 드려요! 방송 끝날 때 선물상자 페이지에서 바로 찾아보실 수 있어요. 원하지 않으시면 '#캐릭터제외'를 남겨 주세요."*

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
- 관리자 로그인: 같은 IP 에서 15분 안에 8번 틀리면 15분 잠금. 세션 쿠키는 12시간 뒤 만료되고, `ADMIN_PASSWORD` 를 바꾸면 모든 로그인이 풀림.
- 닉네임에 욕설·개인정보가 있으면 제외(`bad_nickname`). LLM 에는 댓글을 "참고 자료"로 감싸 넘기고(프롬프트 인젝션 방지), 결과는 금지 키워드 + OpenAI 검열 API(무료)를 거친 뒤에만 이미지를 만듦. 걸리면 "실패"로 남아 운영진이 확인.
- 제외된 참여자의 이미지 파일은 저장소에서도 지움 (공개 버킷이라 숨김만으로는 URL 이 남기 때문).
- 시상 화면은 승인된 캐릭터 이미지만 쓰고, 운영진·문제 닉네임·개인정보 댓글은 서버에서 다시 막음.
- 보안 헤더: iframe 삽입 금지(클릭재킹), nosniff, Referrer-Policy. 관리 화면은 `no-store`·`noindex`.

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
