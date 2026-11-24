/**
 * 방송 중 캐릭터 미리 만들기 (생성 도우미)
 *
 *   npm run live -- [--video <영상ID 또는 URL>] [--every 5] [--until 20:40] [--concurrency 3]
 *
 * 수집시작.cmd 가 영상 주소와 함께 자동으로 켠다 (생성시작.cmd 로 따로 켤 수도 있음). N분마다(기본 5분):
 *   1) 참여자 정리 (--video 영상의 댓글만. 생략하면 마지막으로 수집한 영상. #캐릭터제외·운영진 반영)
 *      방송 전에 켜 두면 리허설 영상 참여자가 섞이지 않도록 --video 를 꼭 넘긴다.
 *   2) 아직 캐릭터가 없는 사람만 생성 (실패 건은 3회까지 다시 시도)
 * 한 회차가 5분보다 오래 걸리면 끝나자마자 다음 회차를 시작한다.
 * --until 시각이 지나면 마지막 회차를 한 번 더 돌고 끝난다. 없으면 Ctrl+C 로 끝낸다.
 * 이미지 상한(MAX_IMAGES)에 닿으면 멈춘다.
 * 이미 다른 생성 도우미가 돌고 있으면(heartbeat 90초 이내) 중복 생성을 막으려고 바로 끝난다.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { adminClient, getSetting, setSettings } from "../src/lib/supabase";
import { parseVideoId } from "../src/lib/youtube";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const everyMs = Number(arg("every") ?? 5) * 60_000;
const concurrency = arg("concurrency") ?? "3";
const until = parseUntil(arg("until"));
const videoId = parseVideo(arg("video"));

function parseVideo(s?: string): string | null {
  if (!s) return null;
  try {
    return parseVideoId(s);
  } catch (e) {
    console.error(String((e as Error).message));
    process.exit(2);
  }
}

/** "20:40" → 오늘 그 시각 (이 PC 시간 기준) */
function parseUntil(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) {
    console.error(`--until 형식이 올바르지 않습니다: ${s} (예: 20:40)`);
    process.exit(2);
  }
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

const db = adminClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });
const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log(`\n[${now()}] 종료 요청을 받았습니다. 지금 회차를 마치고 멈춥니다. (한 번 더 누르면 즉시 종료)`);
});

/** 하위 스크립트 실행 (환경변수는 그대로 물려줌). 종료 코드를 돌려준다. */
function run(script: string, args: string[] = []): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCli, join("scripts", script), ...args], { stdio: "inherit", env: process.env });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function round(n: number): Promise<"ok" | "cap" | "error"> {
  console.log(`\n========== [${now()}] ${n}회차 ==========`);
  await setSettings(db, { generator_status: "running", generator_round: String(n), generator_last_run: new Date().toISOString() }).catch(() => {});

  const p = await run("build-participants.ts", videoId ? ["--video", videoId] : []);
  if (p !== 0) {
    console.error(`[${now()}] 참여자 정리에 실패했습니다 (코드 ${p}). 다음 회차에 다시 시도합니다.`);
    return "error";
  }
  const g = await run("generate-characters.ts", ["--concurrency", concurrency, "--retry-failed", "--max-attempts", "3"]);
  if (g === 4) return "cap";
  if (g !== 0) {
    console.error(`[${now()}] 생성 중 오류가 있었습니다 (코드 ${g}). 다음 회차에 다시 시도합니다.`);
    return "error";
  }
  return "ok";
}

const HEARTBEAT_MS = 30_000;

/** 다른 생성 도우미가 살아 있으면 true (두 개가 같은 사람을 동시에 만들면 비용이 두 번 든다) */
async function anotherRunning(): Promise<boolean> {
  const [status, beat] = await Promise.all([getSetting(db, "generator_status"), getSetting(db, "generator_heartbeat")]);
  const alive = status === "running" || status === "idle";
  return alive && !!beat && Date.now() - Date.parse(beat) < HEARTBEAT_MS * 3;
}

async function main() {
  if (!process.argv.includes("--force") && (await anotherRunning())) {
    console.error(`[${now()}] 다른 생성 도우미가 이미 돌고 있습니다. 이 창은 닫아도 됩니다. (그래도 켜려면 --force)`);
    process.exit(2);
  }
  const beat = () => setSettings(db, { generator_heartbeat: new Date().toISOString() }).catch(() => {});
  await beat();
  setInterval(beat, HEARTBEAT_MS).unref();

  console.log(`[${now()}] 생성 도우미 시작: ${everyMs / 60_000}분마다, 동시 ${concurrency}건${until ? `, ${until.toLocaleTimeString("ko-KR", { hour12: false })}까지` : ""}`);
  console.log(`  대상 영상: ${videoId ?? "마지막으로 수집한 영상"}`);
  let n = 0;
  let lastRound = false;
  while (true) {
    const started = Date.now();
    n++;
    if (until && Date.now() >= until.getTime()) {
      lastRound = true;
      // 수집기도 같은 시각에 멈추므로, 마감 직전 댓글이 저장될 때까지 잠깐 기다린 뒤 마지막 회차를 돈다
      if (n > 1) {
        console.log(`[${now()}] 마감 시각입니다. 마지막 댓글이 저장되도록 20초 기다린 뒤 마지막 회차를 시작합니다.`);
        await sleep(20_000);
      }
    }
    const r = await round(n);
    if (r === "cap") {
      console.log(`[${now()}] 이미지 상한에 도달해 생성 도우미를 멈춥니다.`);
      await setSettings(db, { generator_status: "stopped: cap" }).catch(() => {});
      return;
    }
    if (lastRound) {
      console.log(`\n[${now()}] 마감 시각이 지나 마지막 회차를 마쳤습니다.`);
      break;
    }
    if (stopping) break;

    const wait = Math.max(0, everyMs - (Date.now() - started));
    const nextAt = new Date(Date.now() + wait).toLocaleTimeString("ko-KR", { hour12: false });
    console.log(`[${now()}] 다음 회차: ${nextAt}  (/admin 에서 새 카드를 검수하세요)`);
    await setSettings(db, { generator_status: "idle", generator_last_run: new Date().toISOString() }).catch(() => {});
    // 기다리는 동안에도 Ctrl+C 나 마감 시각에 바로 반응하도록 잘게 나눠 잔다
    const until2 = Date.now() + wait;
    while (Date.now() < until2 && !stopping) {
      if (until && Date.now() >= until.getTime()) break;
      await sleep(Math.min(1000, until2 - Date.now()));
    }
    if (stopping) break;
  }
  await setSettings(db, { generator_status: "finished", generator_last_run: new Date().toISOString() }).catch(() => {});
  console.log(`[${now()}] 생성 도우미를 마쳤습니다. 다음: /admin 에서 남은 카드 승인 → 공개 ON`);
}

main().catch(async (e) => {
  console.error(e);
  await setSettings(db, { generator_status: `crashed: ${String(e?.message ?? e)}`.slice(0, 200) }).catch(() => {});
  process.exit(1);
});
