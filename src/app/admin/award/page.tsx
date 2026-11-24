import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isAdmin } from "@/lib/auth";
import { adminClient, getSetting, publicImageUrl } from "@/lib/supabase";
import { AWARD_KEY, parsePicks } from "@/lib/award";
import { SUGGEST_KEY, parseSuggestions } from "@/lib/award-ai";
import { containsPII, containsProfanity } from "@/lib/filters";
import { cleanNickname } from "@/lib/style";
import { LoginForm } from "../login-form";
import { AwardPicker, type AwardComment } from "./award-picker";

export const metadata: Metadata = { title: "베스트 댓글 시상", robots: { index: false, follow: false } };
// AI 추천 서버 액션이 LLM 응답을 기다리므로 넉넉히
export const maxDuration = 120;

export default function AwardAdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <img src="/brand/logo.png" alt="" width={48} height={48} className="size-12" />
        <h1 className="flex flex-col">
          <span className="text-3xl font-black leading-tight text-green">🏆 베스트 댓글 시상</span>
          <span className="text-sm italic text-sage">Best comment award</span>
        </h1>
        <Link href="/admin" className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm">← 관리 화면</Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-sage">불러오는 중…</p>}>
        <AwardGate />
      </Suspense>
    </main>
  );
}

async function AwardGate() {
  if (!(await isAdmin())) return <LoginForm />;
  const db = adminClient();
  const [videoId, picksRaw, suggestRaw] = await Promise.all([
    getSetting(db, "collector_video_id"),
    getSetting(db, AWARD_KEY),
    getSetting(db, SUGGEST_KEY),
  ]);
  const picks = parsePicks(picksRaw);
  const suggestions = parseSuggestions(suggestRaw);

  // 이번 방송(마지막으로 수집한 영상) 댓글. 최근 것부터 최대 5000건
  let q = db.from("chat_messages").select("id, channel_id, display_name, message, published_at, author_role");
  if (videoId) q = q.eq("video_id", videoId);
  const [msgRes, partRes, charRes] = await Promise.all([
    q.order("published_at", { ascending: false }).range(0, 4999),
    db.from("participants").select("channel_id, excluded, excluded_reason").eq("excluded", true),
    db.from("characters").select("channel_id, name, thumb_path, status"),
  ]);
  // 추천·선정된 댓글이 위 5000건 밖에 있어도 보이게 따로 불러온다
  const wanted = [...picks, ...suggestions.map((s) => s.id)];
  const extraRes = wanted.length
    ? await db.from("chat_messages").select("id, channel_id, display_name, message, published_at, author_role").in("id", wanted)
    : { data: [], error: null };
  const err = msgRes.error ?? partRes.error ?? charRes.error ?? extraRes.error;
  if (err) return <p className="mt-6 rounded-lg border border-coral bg-coral/15 p-4 text-coral">DB 오류: {err.message}</p>;

  const excluded = new Map((partRes.data ?? []).map((p) => [p.channel_id as string, p.excluded_reason as string | null]));
  const chars = new Map((charRes.data ?? []).map((c) => [c.channel_id as string, c]));
  const rows = [...(msgRes.data ?? [])];
  const have = new Set(rows.map((m) => m.id));
  for (const m of extraRes.data ?? []) if (!have.has(m.id)) rows.push(m);
  const comments: AwardComment[] = rows.map((m) => {
    const c = chars.get(m.channel_id as string);
    const text = m.message as string;
    return {
      id: m.id as string,
      channelId: m.channel_id as string,
      displayName: cleanNickname(m.display_name as string),
      message: text,
      publishedAt: m.published_at as string,
      staff: m.author_role !== "viewer",
      excludedReason: excluded.get(m.channel_id as string) ?? null,
      unsafe: containsPII(text) || containsProfanity(text),
      characterName: c && c.status !== "hidden" ? ((c.name as string | null) ?? null) : null,
      thumbUrl: c && c.status !== "hidden" ? publicImageUrl(c.thumb_path as string | null) : null,
    };
  });

  return <AwardPicker comments={comments} initialPicks={picks} suggestions={suggestions} videoId={videoId} />;
}
