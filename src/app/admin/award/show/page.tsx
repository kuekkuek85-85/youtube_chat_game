import type { Metadata } from "next";
import { Suspense } from "react";
import { isAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { loadWinners } from "@/lib/award";
import { LoginForm } from "../../login-form";
import { AwardStage } from "./award-stage";

export const metadata: Metadata = { title: "베스트 댓글상", robots: { index: false, follow: false } };

// 방송 화면에 띄우는 발표 페이지. 운영자 로그인이 필요하다 (발표 전에 결과가 새지 않게).
export default function AwardShowPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-ink text-paper">
      <Suspense fallback={null}>
        <ShowGate />
      </Suspense>
    </main>
  );
}

async function ShowGate() {
  if (!(await isAdmin())) {
    return (
      <div className="mx-auto w-full max-w-sm px-4 py-16 text-ink">
        <LoginForm />
      </div>
    );
  }
  const result = await loadWinners(adminClient()).then(
    (winners) => ({ winners, error: null }),
    (e: Error) => ({ winners: [], error: e.message }),
  );
  if (result.error) return <p className="m-8 rounded-lg bg-red-100 p-4 text-red-800">DB 오류: {result.error}</p>;
  return <AwardStage winners={result.winners} />;
}
