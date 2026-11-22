/**
 * 캐릭터 생성 (PRD 6-3)
 *
 *   npm run generate [-- --limit 20] [--concurrency 3] [--retry-failed] [--only <채널ID>]
 *
 * - 대상: 제외되지 않은 참여자 중 캐릭터가 없거나 queued 인 사람. --retry-failed 면 failed 도 다시.
 * - 동시 3건(기본), 실패 시 2회 재시도. 진행률을 출력한다.
 * - 이미지 생성 누적 수가 MAX_IMAGES(기본 700)를 넘으면 멈춘다.
 * - 스타일 확정용 샘플: --limit 20
 */
import { adminClient, getSetting } from "../src/lib/supabase";
import { CapReachedError, createCharacter, IMAGE_MODEL, IMAGE_QUALITY, MAX_IMAGES, TEXT_MODEL, type ParticipantRow } from "../src/lib/generate";
import { runQueue } from "../src/lib/queue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const limit = arg("limit") ? Number(arg("limit")) : Infinity;
const concurrency = Number(arg("concurrency") ?? 3);
const retryFailed = process.argv.includes("--retry-failed");
const only = arg("only");
// --retry-failed 와 함께: 이 횟수 이상 시도한 실패 건은 건너뛴다 (방송 중 반복 실행 시 같은 실패에 계속 돈 쓰지 않게)
const maxAttempts = arg("max-attempts") ? Number(arg("max-attempts")) : Infinity;

const db = adminClient();

async function main() {
  let q = db.from("participants").select("channel_id, display_name, top_comments, keywords").eq("excluded", false);
  if (only) q = q.eq("channel_id", only);
  const { data: participants, error } = await q.order("comment_count", { ascending: false }).limit(5000);
  if (error) throw error;

  const { data: chars, error: e2 } = await db.from("characters").select("channel_id, status, attempts").limit(5000);
  if (e2) throw e2;
  const charOf = new Map((chars ?? []).map((c) => [c.channel_id as string, c as { status: string; attempts: number }]));

  const targets = (participants as ParticipantRow[])
    .filter((p) => {
      const c = charOf.get(p.channel_id);
      if (only) return true;
      if (!c || c.status === "queued") return true;
      return retryFailed && c.status === "failed" && (c.attempts ?? 0) < maxAttempts;
    })
    .slice(0, limit);

  const used = Number((await getSetting(db, "images_generated")) ?? 0);
  console.log(`모델: 텍스트 ${TEXT_MODEL} / 이미지 ${IMAGE_MODEL} (${IMAGE_QUALITY})`);
  console.log(`대상 ${targets.length}명, 동시 ${concurrency}건. 이미지 사용량 ${used}/${MAX_IMAGES}장`);
  if (used + targets.length > MAX_IMAGES) console.warn(`⚠ 상한을 넘으므로 ${Math.max(0, MAX_IMAGES - used)}장까지만 만들어집니다.`);
  if (!targets.length) return;
  if (used >= MAX_IMAGES) {
    console.log("이미지 생성 상한에 이미 도달했습니다.");
    process.exitCode = 4;
    return;
  }

  let capReached = false;
  const started = Date.now();
  const result = await runQueue(
    targets,
    async (p) => {
      try {
        await createCharacter(db, p);
      } catch (e) {
        if (e instanceof CapReachedError) capReached = true;
        throw e;
      }
    },
    {
      concurrency,
      retries: 2,
      shouldStop: () => capReached,
      onProgress: ({ done, failed, total, item, ok, error }) => {
        const pct = Math.round((done / total) * 100);
        const eta = Math.round(((Date.now() - started) / done) * (total - done) / 1000);
        console.log(
          `[${done}/${total} ${pct}%] ${ok ? "✓" : "✗"} ${item.display_name}${ok ? "" : ` — ${(error as Error)?.message}`}  (실패 ${failed}, 남은 시간 약 ${eta}초)`,
        );
      },
    },
  );

  console.log(`\n완료: 성공 ${result.succeeded.length}, 실패 ${result.failed.length}`);
  if (capReached) {
    console.log("이미지 생성 상한에 도달해 멈췄습니다. MAX_IMAGES 를 확인하세요.");
    process.exitCode = 4; // live-generate 가 반복을 멈추는 신호
  }
  if (result.failed.length) console.log("실패 건은 `npm run generate -- --retry-failed` 로 다시 시도하거나 /admin 에서 재생성하세요.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
