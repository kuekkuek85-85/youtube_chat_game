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
          <p className="text-4xl font-bold text-green">아직 선정된 베스트 댓글이 없어요</p>
          <p className="mt-3 italic text-sage">/admin/award 에서 2개를 고른 뒤 이 화면을 새로고침하세요.</p>
        </div>
      </div>
    );
  }

  const done = revealed >= winners.length;
  return (
    <div className="relative flex h-dvh flex-col gap-[3vh] overflow-hidden px-[4vw] py-[4vh]">
      {/* 머리: PPT 슬라이드와 같은 구성 (로고 원 · 이모지 제목 · 영어 부제 · 상태 알약) */}
      <header className="flex items-center gap-[2vw]">
        <img src="/brand/logo.png" alt="교사 개발자" className="h-[11vh] w-auto" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(2rem,7vh,5rem)] font-black leading-tight text-green">🏆 베스트 댓글상</h1>
          <p className="text-[clamp(0.9rem,2.4vh,1.5rem)] italic text-sage">Best comment award · 라이브 채팅을 빛내 주신 두 분</p>
        </div>
        <span className="hidden items-center gap-2 rounded-full bg-chip px-[1.6vw] py-[0.8vh] text-[clamp(0.9rem,2.2vh,1.4rem)] font-bold text-paper sm:flex">
          <span aria-hidden className="size-[1.4vh] rounded-full bg-coral shadow-[0_0_10px_#ff5a4e]" /> ON AIR
        </span>
      </header>

      <section className={`mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-[2vw] ${winners.length > 1 ? "md:grid-cols-2" : "max-w-2xl"}`}>
        {winners.map((w, i) =>
          i < revealed ? <WinnerCard key={w.messageId} w={w} rank={i + 1} /> : <ClosedCard key={w.messageId} rank={i + 1} onOpen={next} active={i === revealed} />,
        )}
      </section>

      <footer className="flex items-end justify-between gap-4">
        <p className="text-[clamp(0.9rem,2.4vh,1.5rem)] text-lime">
          {done ? "🎉 축하합니다! 선물상자에서 캐릭터도 찾아보세요" : "🎁 클릭 또는 스페이스로 공개"}
          <span className="block text-[clamp(0.75rem,1.8vh,1.1rem)] italic text-sage">{done ? "Congratulations!" : "Click or press space to reveal · ← to go back"}</span>
        </p>
        <Equalizer />
      </footer>
    </div>
  );
}

function Equalizer() {
  const bars = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.55, 0.85, 0.65, 1, 0.6];
  return (
    <div aria-hidden className="flex h-[6vh] items-end gap-[0.4vw]">
      {bars.map((h, i) => (
        <span key={i} className="eq-bar w-[0.6vw] min-w-1.5 bg-lime" style={{ height: `${h * 100}%`, animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

/** 닫힌 카드 = PPT 의 단계 카드, 지금 열 차례인 카드 = 강조 카드 */
function ClosedCard({ rank, onOpen, active }: { rank: number; onOpen: () => void; active: boolean }) {
  return (
    <button onClick={onOpen} disabled={!active} className={`grid h-full place-items-center p-8 transition ${active ? "card-hi hover:brightness-125" : "card"}`}>
      <div className="flex flex-col items-center text-center">
        <span className={`grid size-[12vh] place-items-center rounded-full text-[6vh] font-black text-ink ${active ? "bg-lime" : "bg-green"}`}>{rank}</span>
        <p className="mt-[2vh] text-[8vh]">🎁</p>
        <p className={`mt-[1vh] text-[clamp(1.4rem,4vh,2.6rem)] font-bold ${active ? "text-lime" : "text-green"}`}>베스트 댓글 {rank}</p>
        <p className="text-[clamp(0.9rem,2.2vh,1.3rem)] italic text-sage">{active ? "Tap to reveal" : "Coming up next"}</p>
      </div>
    </button>
  );
}

function WinnerCard({ w, rank }: { w: StageWinner; rank: number }) {
  return (
    <article className="card-hi award-pop flex h-full min-h-0 flex-col items-center justify-center gap-[2vh] p-[3vh] shadow-[0_0_60px_-15px_rgba(212,255,42,.55)]">
      <p className="rounded-full bg-lime px-5 py-1 text-[clamp(1rem,2.6vh,1.6rem)] font-black text-ink">베스트 댓글 {rank}</p>
      {/* 그림은 남는 높이만큼만 차지한다 (댓글이 길면 그림이 줄어들어 카드를 넘치지 않음) */}
      <div className="flex min-h-[8vh] max-h-[24vh] flex-1 justify-center">
        {w.imageUrl ? (
          <img src={w.imageUrl} alt={w.characterName ?? ""} className="aspect-square h-full rounded-3xl bg-green object-cover" />
        ) : (
          <div className="grid aspect-square h-full place-items-center rounded-full bg-green text-[7vh]">🏆</div>
        )}
      </div>
      <div className="w-full min-w-0 shrink-0 text-center">
        <p className="truncate text-[clamp(1.8rem,5.5vh,4rem)] font-black leading-tight text-green">{w.displayName}</p>
        {w.characterName && <p className="truncate text-[clamp(0.9rem,2.2vh,1.4rem)] italic text-sage">캐릭터 「{w.characterName}」</p>}
      </div>
      {/* 긴 댓글은 5줄까지만 보이고 말줄임표 (전체는 마우스를 올리면 보임) */}
      <blockquote title={w.message} className="w-full shrink-0 rounded-xl bg-lime px-6 py-[2vh] text-center text-[clamp(1rem,3vh,2.2rem)] font-bold leading-snug text-ink">
        <p className="line-clamp-5 break-words">“{w.message}”</p>
      </blockquote>
    </article>
  );
}
