"use client";

import { useCallback, useEffect, useState } from "react";

export interface StageWinner {
  messageId: string;
  displayName: string;
  message: string;
  characterName: string | null;
  imageUrl: string | null;
}

/** 방송용 발표 화면. 클릭·스페이스·→ 로 한 명씩 공개, ← 로 되돌리기. */
export function AwardStage({ winners }: { winners: StageWinner[] }) {
  const [revealed, setRevealed] = useState(0);
  const next = useCallback(() => setRevealed((n) => Math.min(winners.length, n + 1)), [winners.length]);
  const prev = useCallback(() => setRevealed((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  if (!winners.length) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="font-display text-4xl text-lime">아직 선정된 베스트 댓글이 없어요</p>
          <p className="mt-3 text-paper/70">/admin/award 에서 2개를 고른 뒤 이 화면을 새로고침하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh flex-col items-center gap-[3vh] overflow-hidden px-6 py-[4vh]">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-lime/15" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-green/15" />

      <header className="relative text-center">
        <p className="text-[clamp(1rem,2.4vh,1.6rem)] font-semibold text-lime">교사 개발자의 날 · 2회 공개방송</p>
        <h1 className="font-display mt-1 text-[clamp(2.5rem,7vh,5rem)] leading-tight">🏆 베스트 댓글상</h1>
        <p className="mt-1 text-[clamp(0.9rem,2.2vh,1.4rem)] text-paper/70">라이브 채팅을 빛내 주신 두 분을 소개합니다!</p>
      </header>

      <section className={`relative grid min-h-0 w-full max-w-6xl flex-1 gap-6 ${winners.length > 1 ? "md:grid-cols-2" : "max-w-2xl"}`}>
        {winners.map((w, i) =>
          i < revealed ? <WinnerCard key={w.messageId} w={w} rank={i + 1} /> : <ClosedCard key={w.messageId} rank={i + 1} onOpen={next} active={i === revealed} />,
        )}
      </section>

      <p className="relative text-sm text-paper/40">
        {revealed < winners.length ? "클릭 또는 스페이스로 공개 · ← 되돌리기" : "축하합니다! 🎉"}
      </p>
    </div>
  );
}

function ClosedCard({ rank, onOpen, active }: { rank: number; onOpen: () => void; active: boolean }) {
  return (
    <button
      onClick={onOpen}
      disabled={!active}
      className={`grid h-full place-items-center rounded-[2rem] border-4 border-dashed p-8 transition ${
        active ? "animate-pulse border-lime bg-paper/5 hover:bg-paper/10" : "border-paper/20 bg-paper/5"
      }`}
    >
      <div className="text-center">
        <p className="text-[14vh]">🎁</p>
        <p className="font-display mt-4 text-3xl text-lime">베스트 댓글 {rank}</p>
        <p className="mt-2 text-paper/60">{active ? "눌러서 공개!" : "잠시 뒤 공개"}</p>
      </div>
    </button>
  );
}

function WinnerCard({ w, rank }: { w: StageWinner; rank: number }) {
  return (
    <article className="award-pop flex h-full min-h-0 flex-col items-center justify-center gap-[2vh] rounded-[2rem] bg-paper p-[3vh] text-ink shadow-2xl">
      <p className="rounded-full bg-ink px-5 py-1 font-display text-[clamp(1rem,2.6vh,1.6rem)] text-lime">베스트 댓글 {rank}</p>
      {w.imageUrl ? (
        <img src={w.imageUrl} alt={w.characterName ?? ""} className="aspect-square h-[24vh] rounded-3xl bg-green object-cover" />
      ) : (
        <div className="grid aspect-square h-[18vh] place-items-center rounded-3xl bg-lime text-[10vh]">🏆</div>
      )}
      <div className="text-center">
        <p className="font-display text-[clamp(1.8rem,5.5vh,4rem)] leading-tight">{w.displayName}</p>
        {w.characterName && <p className="text-[clamp(0.9rem,2.2vh,1.4rem)] text-ink/60">캐릭터 「{w.characterName}」</p>}
      </div>
      <blockquote className="w-full rounded-2xl bg-lime/60 px-6 py-[2vh] text-center text-[clamp(1.1rem,3.3vh,2.4rem)] leading-snug">
        “{w.message}”
      </blockquote>
    </article>
  );
}
