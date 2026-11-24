"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { setAwardPicks, suggestAward } from "../actions";

export interface AwardComment {
  id: string;
  channelId: string;
  displayName: string;
  message: string;
  publishedAt: string;
  staff: boolean;
  excludedReason: string | null;
  unsafe: boolean;
  characterName: string | null;
  thumbUrl: string | null;
}

const MAX = 2;
const BLOCKED_REASONS = new Set(["staff", "moderator", "bad_nickname"]);
const time = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export function AwardPicker({
  comments,
  initialPicks,
  suggestions,
  videoId,
}: {
  comments: AwardComment[];
  initialPicks: string[];
  suggestions: { id: string; reason: string }[];
  videoId: string | null;
}) {
  const [picks, setPicks] = useState<string[]>(initialPicks);
  const [query, setQuery] = useState("");
  const [hideShort, setHideShort] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [thinking, think] = useTransition();

  const byId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const countBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) m.set(c.channelId, (m.get(c.channelId) ?? 0) + 1);
    return m;
  }, [comments]);
  const pickedChannels = new Set(picks.map((id) => byId.get(id)?.channelId).filter(Boolean));

  /** 선정 버튼 상태: null 이면 고를 수 있음, 아니면 못 고르는 이유 */
  const pickBlock = (c: AwardComment): string | null => {
    if (picks.includes(c.id)) return "이미 선정됨";
    if (c.unsafe || c.staff || BLOCKED_REASONS.has(c.excludedReason ?? "")) return "방송에 띄울 수 없는 댓글입니다";
    if (pickedChannels.has(c.channelId)) return "이미 이 사람의 댓글을 골랐어요";
    if (picks.length >= MAX) return "이미 2개를 골랐어요. 하나를 빼고 고르세요";
    return null;
  };

  const askAI = () =>
    think(async () => {
      setNotice(null);
      const r = await suggestAward();
      setNotice(r.ok ? `AI 가 후보 ${r.count}개를 추천했어요. 이 중에서 골라 주세요.` : `AI 추천 실패: ${r.error}`);
    });

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const shown = comments.filter((c) => {
    if (hideShort && c.message.trim().length < 8) return false;
    if (!q) return true;
    return c.message.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q);
  });

  const save = (next: string[]) =>
    start(async () => {
      const prev = picks;
      setPicks(next);
      const r = await setAwardPicks(next);
      if (!r.ok) {
        setPicks(prev);
        setNotice(`저장 실패: ${r.error}`);
      } else setNotice(next.length === MAX ? "베스트 댓글 2개를 모두 골랐어요. 발표 화면을 열어 보세요." : "저장했어요.");
    });

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* 선정 결과 */}
      <section className="card-hi p-5 text-paper">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-2xl text-lime">선정된 베스트 댓글 {picks.length}/{MAX}</h2>
          <Link
            href="/admin/award/show"
            target="_blank"
            className={`ml-auto rounded-full px-4 py-2 font-bold ${picks.length ? "bg-lime text-ink" : "pointer-events-none bg-chip text-paper/50"}`}
          >
            발표 화면 열기 (방송용) ↗
          </Link>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: MAX }, (_, i) => {
            const c = byId.get(picks[i] ?? "");
            return (
              <li key={i} className="flex min-h-24 items-start gap-3 rounded-xl border border-line bg-ink/60 p-3">
                <span className="font-bold text-2xl text-lime">{i + 1}</span>
                {picks[i] ? (
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c?.displayName ?? "(목록에 없는 댓글)"}</p>
                    <p className="mt-1 text-sm text-paper/90">{c?.message ?? picks[i]}</p>
                    <p className="mt-1 text-xs text-paper/60">{c?.characterName ? `캐릭터: ${c.characterName}` : "캐릭터 없음 (발표 화면에 이름·댓글만 나와요)"}</p>
                  </div>
                ) : (
                  <p className="text-sm text-paper/60">아래 목록에서 &quot;선정&quot;을 누르세요.</p>
                )}
                {picks[i] && (
                  <button disabled={pending} onClick={() => save(picks.filter((_, j) => j !== i))} className="rounded-lg border border-paper/30 px-2 py-1 text-xs">
                    빼기
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {picks.length === MAX && (
          <button disabled={pending} onClick={() => save([picks[1], picks[0]])} className="mt-3 text-xs text-paper/70 underline">
            발표 순서 바꾸기 (1 ↔ 2)
          </button>
        )}
      </section>
      {notice && <p className="card-hi px-4 py-2 font-semibold text-lime">{notice}</p>}

      {/* AI 추천 */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-green text-2xl">🤖 AI 추천 후보</h2>
          <p className="text-sm text-sage">AI 가 이번 방송 댓글을 읽고 후보 3개를 골라요. 최종 선정은 직접 하세요.</p>
          <button
            disabled={thinking || pending}
            onClick={askAI}
            className="ml-auto rounded-full bg-lime px-4 py-2 font-bold text-ink disabled:opacity-50"
          >
            {thinking ? "AI 가 댓글을 읽는 중… (최대 1분)" : suggestions.length ? "다시 추천받기" : "AI 추천 받기"}
          </button>
        </div>
        {suggestions.length > 0 ? (
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {suggestions.map((sg, i) => {
              const c = byId.get(sg.id);
              if (!c) return null;
              const why = pickBlock(c);
              const picked = picks.includes(c.id);
              return (
                <li key={sg.id} className={`flex flex-col gap-2 rounded-xl p-4 ${picked ? "card-hi" : "border border-line bg-ink/50"}`}>
                  <p className="text-xs font-semibold text-sage">후보 {i + 1}</p>
                  <p className="font-semibold">{c.displayName}</p>
                  <p className="flex-1 break-words">“{c.message}”</p>
                  {sg.reason && <p className="text-xs text-sage">추천 이유: {sg.reason}</p>}
                  <button
                    disabled={pending || !!why}
                    onClick={() => save([...picks, c.id])}
                    title={why ?? undefined}
                    className="rounded-lg bg-lime px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-30"
                  >
                    {picked ? "선정됨" : "이 댓글 선정"}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-sage">방송이 끝나갈 때(댓글이 충분히 모였을 때) 눌러 주세요. 여러 번 눌러도 됩니다.</p>
        )}
      </section>

      {/* 검색 */}
      <section className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="댓글 내용이나 닉네임으로 찾기"
          className="min-w-64 flex-1 rounded-xl border border-line bg-panel px-4 py-2 text-paper placeholder:text-sage/80"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hideShort} onChange={(e) => setHideShort(e.target.checked)} />
          짧은 댓글(8자 미만) 숨기기
        </label>
        <span className="text-sm text-sage">
          {videoId ? `이번 방송(${videoId})` : "전체"} 댓글 {comments.length.toLocaleString()}건 중 {shown.length.toLocaleString()}건 · 최신순
        </span>
      </section>

      {/* 댓글 목록 */}
      <section className="card flex flex-col divide-y divide-line/50 overflow-hidden">
        {shown.slice(0, 500).map((c) => {
          const picked = picks.includes(c.id);
          const why = pickBlock(c);
          return (
            <div key={c.id} className={`flex items-start gap-3 p-3 ${picked ? "bg-panel-hi" : ""}`}>
              {c.thumbUrl ? (
                <img src={c.thumbUrl} alt="" width={48} height={48} className="size-12 rounded-lg bg-green object-cover" loading="lazy" />
              ) : (
                <div className="size-12 rounded-lg bg-panel" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <b>{c.displayName}</b> <span className="text-sage">· {time(c.publishedAt)} · 이 사람 댓글 {countBy.get(c.channelId)}건</span>
                  {c.staff && <Badge tone="gray">운영진·모더레이터</Badge>}
                  {c.excludedReason && <Badge tone="red">{BLOCKED_REASONS.has(c.excludedReason) ? "시상 불가" : "캐릭터 제외"}</Badge>}
                  {c.unsafe && <Badge tone="red">개인정보·욕설</Badge>}
                </p>
                <p className="mt-0.5 break-words">{c.message}</p>
              </div>
              <button
                disabled={pending || !!why}
                onClick={() => save([...picks, c.id])}
                title={why ?? undefined}
                className="shrink-0 rounded-lg bg-lime px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-30"
              >
                {picked ? "선정됨" : "선정"}
              </button>
            </div>
          );
        })}
        {shown.length > 500 && <p className="p-3 text-sm text-sage">앞의 500건만 보여요. 검색어로 좁혀 주세요.</p>}
        {!shown.length && <p className="p-6 text-center text-sage">댓글이 없습니다.</p>}
      </section>
    </div>
  );
}

function Badge({ tone, children }: { tone: "red" | "gray"; children: React.ReactNode }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${tone === "red" ? "bg-coral/20 text-coral" : "bg-chip text-sand"}`}>
      {children}
    </span>
  );
}
