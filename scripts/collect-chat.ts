/**
 * 라이브 댓글 수집기 (PRD 6-1)
 *
 *   npm run collect -- <영상ID 또는 URL> [--minutes 150] [--min-interval 5000] [--fresh]
 *
 * - videos.list 로 activeLiveChatId 를 얻고, liveChatMessages.list 를 pollingIntervalMillis 이상 간격으로 부른다.
 * - 메시지 ID 를 PK 로 upsert 해서 중복 저장이 없다.
 * - nextPageToken 을 settings 에 저장하므로, 수집기를 다시 켜면 이어서 받는다. (--fresh 로 처음부터)
 * - 네트워크·5xx 오류는 지수 백오프로 재시도한다. 채팅 종료·할당량 초과는 멈춘다.
 * - 프로세스 자체가 죽는 경우 대비: npm run collect:forever (scripts/collect-forever.ps1) 로 자동 재시작.
 */
import { adminClient, getSetting, setSettings } from "../src/lib/supabase";
import { authMode, getLiveChatId, listChatMessages, minPollIntervalMs, parseVideoId, toRows, YouTubeError } from "../src/lib/youtube";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));

const input = positional[0] ?? process.env.YOUTUBE_VIDEO_ID;
if (!input) {
  console.error("사용법: npm run collect -- <영상ID 또는 URL> [--minutes 150] [--min-interval 5000] [--fresh]");
  process.exit(2);
}
const videoId = parseVideoId(input);
const minutes = Number(arg("minutes") ?? 150);
// 기본값은 최소 5초. --minutes 를 짧게 줘도 할당량을 빨리 쓰지 않게 한다. (더 빠르게는 --min-interval 로 명시)
const minInterval = Number(arg("min-interval") ?? Math.max(5000, minPollIntervalMs(minutes)));
const fresh = process.argv.includes("--fresh");

const db = adminClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log(`\n[${now()}] 종료 요청을 받았습니다. 현재 요청을 마치고 멈춥니다. (한 번 더 누르면 즉시 종료)`);
});

async function countMessages(): Promise<number> {
  const { count, error } = await db.from("chat_messages").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  console.log(`[${now()}] 인증 방식: ${authMode()} / 영상: ${videoId} / 최소 폴링 간격: ${minInterval}ms (${minutes}분 기준)`);
  const callsBudget = Math.ceil((minutes * 60_000) / minInterval);
  console.log(`  예상 사용량: 약 ${callsBudget * 5 + 1} units (하루 기본 10,000 units)`);

  const { liveChatId, title } = await getLiveChatId(videoId);
  console.log(`[${now()}] 라이브 채팅 연결: "${title}"`);

  let pageToken: string | undefined;
  const savedVideo = await getSetting(db, "collector_video_id");
  if (!fresh && savedVideo === videoId) {
    pageToken = (await getSetting(db, "collector_page_token")) || undefined;
    if (pageToken) console.log(`[${now()}] 저장된 위치부터 이어서 수집합니다.`);
  }
  await setSettings(db, {
    collector_video_id: videoId,
    collector_status: "running",
    collector_started_at: new Date().toISOString(),
  });

  let total = await countMessages();
  let backoff = 2000;
  let calls = 0;

  while (!stopping) {
    const started = Date.now();
    try {
      const page = await listChatMessages(liveChatId, pageToken);
      calls++;
      const rows = toRows(page.items ?? []);
      if (rows.length) {
        const { error } = await db.from("chat_messages").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      }
      pageToken = page.nextPageToken ?? pageToken;
      if (rows.length || calls % 12 === 0) total = await countMessages();
      await setSettings(db, {
        collector_page_token: pageToken ?? "",
        collector_last_poll: new Date().toISOString(),
        collector_count: String(total),
        collector_calls: String(calls),
        collector_status: "running",
      });
      if (rows.length) console.log(`[${now()}] +${rows.length}건 (누적 ${total}건)`);
      backoff = 2000;

      if (page.offlineAt) {
        console.log(`[${now()}] 라이브 채팅이 종료되었습니다 (${page.offlineAt}).`);
        break;
      }
      const wait = Math.max(page.pollingIntervalMillis ?? 0, minInterval) - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    } catch (e) {
      if (e instanceof YouTubeError && e.fatal) {
        console.error(`[${now()}] 멈춤: ${e.message}`);
        await setSettings(db, { collector_status: `stopped: ${e.reason}` }).catch(() => {});
        if (e.reason === "liveChatEnded") break;
        process.exitCode = 3; // collect-forever.ps1 은 3 이면 재시작하지 않는다
        return;
      }
      console.error(`[${now()}] 일시 오류, ${backoff / 1000}초 뒤 재시도: ${(e as Error).message}`);
      await setSettings(db, { collector_status: `retrying: ${(e as Error).message}`.slice(0, 200) }).catch(() => {});
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }

  total = await countMessages();
  await setSettings(db, { collector_status: "finished", collector_count: String(total) });
  console.log(`[${now()}] 수집 종료. 누적 ${total}건, API 호출 ${calls}회.`);
}

main().catch(async (e) => {
  console.error(`[${now()}] 치명적 오류:`, e);
  await setSettings(db, { collector_status: `crashed: ${String(e?.message ?? e)}`.slice(0, 200) }).catch(() => {});
  process.exit(1);
});
