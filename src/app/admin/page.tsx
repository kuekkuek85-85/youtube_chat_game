import type { Metadata } from "next";
import { Suspense } from "react";
import { isAdmin } from "@/lib/auth";
import { adminClient, publicImageUrl } from "@/lib/supabase";
import { LoginForm } from "./login-form";
import { AdminBoard, type AdminCharacter, type AdminParticipant } from "./admin-board";

export const metadata: Metadata = { title: "선물상자 관리", robots: { index: false, follow: false } };
// 재생성 서버 액션이 이미지 생성을 기다리므로 넉넉히
export const maxDuration = 300;

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3">
        <img src="/brand/logo.png" alt="" width={48} height={48} className="size-12" />
        <h1 className="flex flex-col">
          <span className="text-3xl font-black leading-tight text-green">🎁 선물상자 관리</span>
          <span className="text-sm italic text-sage">Gift box admin</span>
        </h1>
      </div>
      <Suspense fallback={<p className="mt-6 text-sage">불러오는 중…</p>}>
        <AdminGate searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AdminGate({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  if (!(await isAdmin())) return <LoginForm />;
  const sp = await searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "all";
  return <AdminData filter={filter} />;
}

async function AdminData({ filter }: { filter: string }) {
  const db = adminClient();
  const [settingsRes, participantsRes, charactersRes, msgCount] = await Promise.all([
    db.from("settings").select("key, value"),
    db.from("participants").select("channel_id, display_name, comment_count, top_comments, excluded, excluded_reason").order("comment_count", { ascending: false }).range(0, 1999),
    db.from("characters").select("id, channel_id, display_name, name, personality, look, quote, comment, thumb_path, image_path, status, error, attempts, updated_at").range(0, 1999),
    db.from("chat_messages").select("id", { count: "exact", head: true }),
  ]);
  const err = settingsRes.error ?? participantsRes.error ?? charactersRes.error ?? msgCount.error;
  if (err) return <p className="mt-6 rounded-lg border border-coral bg-coral/15 p-4 text-coral">DB 오류: {err.message}. supabase/schema.sql 을 실행했는지 확인하세요.</p>;

  const settings = Object.fromEntries((settingsRes.data ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  const characters: AdminCharacter[] = (charactersRes.data ?? []).map((c) => ({
    ...c,
    look: Array.isArray(c.look) ? c.look : [],
    thumb_url: publicImageUrl(c.thumb_path),
    image_url: publicImageUrl(c.image_path),
  }));
  const participants = (participantsRes.data ?? []) as AdminParticipant[];

  return (
    <AdminBoard
      filter={filter}
      settings={settings}
      messageCount={msgCount.count ?? 0}
      participants={participants}
      characters={characters}
    />
  );
}
