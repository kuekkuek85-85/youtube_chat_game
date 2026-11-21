/**
 * 참여자 정리 (PRD 6-2)
 *
 *   npm run participants [-- --dry-run]
 *
 * chat_messages 를 채널 ID 로 묶고, 개인정보·욕설 댓글을 거르고, #캐릭터제외 · 운영진을 제외 표시한다.
 * 이미 만든 캐릭터가 있는 참여자가 제외되면 그 캐릭터는 hidden 으로 바꾼다.
 * STAFF_CHANNEL_IDS (쉼표 구분) 에 운영진 채널 ID 를 넣으면 제외된다. 채널 소유자·모더레이터도 기본 제외.
 * 모더레이터를 포함하려면 EXCLUDE_MODERATORS=false.
 */
import { adminClient } from "../src/lib/supabase";
import { buildParticipants, type ChatMessage } from "../src/lib/participants";

const dryRun = process.argv.includes("--dry-run");
const db = adminClient();

async function fetchAllMessages(): Promise<ChatMessage[]> {
  const all: ChatMessage[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db
      .from("chat_messages")
      .select("id, channel_id, display_name, message, published_at, author_role")
      .order("published_at", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    all.push(...(data as ChatMessage[]));
    if (!data || data.length < size) break;
  }
  return all;
}

async function main() {
  const messages = await fetchAllMessages();
  const staff = new Set((process.env.STAFF_CHANNEL_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const participants = buildParticipants(messages, {
    staffChannelIds: staff,
    excludeModerators: process.env.EXCLUDE_MODERATORS !== "false",
  });

  // 관리 페이지에서 수동 제외한 사람은 다시 정리해도 제외 상태를 유지한다
  const { data: manual, error: manualErr } = await db.from("participants").select("channel_id").eq("excluded_reason", "manual");
  if (manualErr) throw manualErr;
  const manualIds = new Set((manual ?? []).map((m) => m.channel_id as string));
  for (const p of participants) {
    if (manualIds.has(p.channel_id)) {
      p.excluded = true;
      p.excluded_reason = "manual";
    }
  }

  const included = participants.filter((p) => !p.excluded);
  const reasons = participants.reduce<Record<string, number>>((acc, p) => {
    if (p.excluded_reason) acc[p.excluded_reason] = (acc[p.excluded_reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`댓글 ${messages.length}건 → 참여자 ${participants.length}명 (생성 대상 ${included.length}명)`);
  console.log("제외:", reasons);

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

  const excludedIds = participants.filter((p) => p.excluded).map((p) => p.channel_id);
  if (excludedIds.length) {
    const { data, error } = await db
      .from("characters")
      .update({ status: "hidden", updated_at: now })
      .in("channel_id", excludedIds)
      .neq("status", "hidden")
      .select("channel_id");
    if (error) throw error;
    if (data?.length) console.log(`제외된 참여자의 캐릭터 ${data.length}개를 숨김 처리했습니다.`);
  }
  console.log("participants 테이블을 갱신했습니다. 다음 단계: npm run generate");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
