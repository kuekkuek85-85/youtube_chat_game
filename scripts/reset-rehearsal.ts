/**
 * 리허설 데이터 전체 정리
 *
 *   npm run reset            # 지울 것만 보여 줌 (아무것도 안 지움)
 *   npm run reset -- --yes   # 실제로 지움
 *
 * 지우는 것: 댓글(chat_messages), 참여자(participants), 캐릭터(characters),
 * 저장소 이미지 파일 전부, settings 의 진행 기록(수집·생성 상태, 시상 선정·AI 추천, 로그인 실패 기록).
 * 되돌리는 것: public_open=false, images_generated=0 (이미지 700장 한도를 처음부터 다시 셈).
 * 환경 변수(.env.local)와 DB 구조는 건드리지 않는다.
 *
 * 본방송이 시작된 뒤에 실행하면 본방송 데이터도 지워진다. 그래서 수집기·생성기가 돌고 있으면 멈춘다.
 */
import { adminClient, BUCKET } from "../src/lib/supabase";

const yes = process.argv.includes("--yes");
const db = adminClient();
const KEEP = { public_open: "false", images_generated: "0" };

async function count(table: string): Promise<number> {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return n ?? 0;
}

async function listFiles(): Promise<string[]> {
  const out: string[] = [];
  const page = async (prefix: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw error;
      for (const f of data ?? []) {
        const path = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.id === null) await page(path); // 폴더
        else out.push(path);
      }
      if (!data || data.length < 1000) break;
    }
  };
  await page("");
  return out;
}

async function main() {
  const { data: settings, error } = await db.from("settings").select("key, value");
  if (error) throw error;
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value])) as Record<string, string>;

  // 돌고 있는 수집기·생성기가 있으면 멈춘다 (지우는 사이 다시 채워지거나 본방송을 지우는 일 방지)
  const beat = Date.parse(s.generator_heartbeat ?? "");
  const genAlive = (s.generator_status === "running" || s.generator_status === "idle") && Date.now() - beat < 90_000;
  if (genAlive) {
    console.error("캐릭터 생성기가 아직 돌고 있어요. 생성기 창을 먼저 닫고 1~2분 뒤 다시 실행하세요.");
    process.exit(2);
  }

  const files = await listFiles();
  const [msgs, parts, chars] = await Promise.all([count("chat_messages"), count("participants"), count("characters")]);
  const dropKeys = Object.keys(s).filter((k) => !(k in KEEP));

  console.log("지울 것");
  console.log(`  댓글 ${msgs}건 · 참여자 ${parts}명 · 캐릭터 ${chars}개 · 이미지 파일 ${files.length}개`);
  console.log(`  마지막 수집 영상: ${s.collector_video_id ?? "(없음)"}`);
  console.log(`  설정 기록 ${dropKeys.length}개: ${dropKeys.join(", ") || "(없음)"}`);
  console.log(`  되돌림: 공개 ${s.public_open ?? "-"} → false, 생성 이미지 수 ${s.images_generated ?? "-"} → 0`);

  if (!yes) {
    console.log("\n아무것도 지우지 않았어요. 실제로 지우려면: npm run reset -- --yes");
    return;
  }

  for (let i = 0; i < files.length; i += 500) {
    const { error: e } = await db.storage.from(BUCKET).remove(files.slice(i, i + 500));
    if (e) throw e;
  }
  // characters 는 participants 에 on delete cascade 지만 순서대로 확실히 지운다
  for (const [table, col] of [["characters", "channel_id"], ["participants", "channel_id"], ["chat_messages", "id"]] as const) {
    const { error: e } = await db.from(table).delete().not(col, "is", null);
    if (e) throw e;
  }
  if (dropKeys.length) {
    const { error: e } = await db.from("settings").delete().in("key", dropKeys);
    if (e) throw e;
  }
  const { error: e } = await db.from("settings").upsert(Object.entries(KEEP).map(([key, value]) => ({ key, value })));
  if (e) throw e;

  const after = await Promise.all([count("chat_messages"), count("participants"), count("characters"), listFiles().then((f) => f.length)]);
  console.log(`\n정리 끝: 댓글 ${after[0]} · 참여자 ${after[1]} · 캐릭터 ${after[2]} · 이미지 파일 ${after[3]} · 공개 false · 이미지 수 0`);
}

main().catch((e) => {
  console.error("정리 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
