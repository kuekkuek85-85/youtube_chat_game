"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { setAwardPicks } from "../actions";

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
const time = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export function AwardPicker({ comments, initialPicks, videoId }: { comments: AwardComment[]; initialPicks: string[]; videoId: string | null }) {
  const [picks, setPicks] = useState<string[]>(initialPicks);
  const [query, setQuery] = useState("");
  const [hideShort, setHideShort] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const countBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) m.set(c.channelId, (m.get(c.channelId) ?? 0) + 1);
    return m;
  }, [comments]);
  const pickedChannels = new Set(picks.map((id) => byId.get(id)?.channelId).filter(Boolean));

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
      <section className="rounded-2xl bg-ink p-5 text-paper">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl text-lime">선정된 베스트 댓글 {picks.length}/{MAX}</h2>
          <Link
            href="/admin/award/show"
            target="_blank"
            className={`ml-auto rounded-full px-4 py-2 font-bold ${picks.length ? "bg-lime text-ink" : "pointer-events-none bg-paper/20 text-paper/50"}`}
          >
            발표 화면 열기 (방송용) ↗
          </Link>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: MAX }, (_, i) => {
            const c = byId.get(picks[i] ?? "");
            return (
              <li key={i} className="flex min-h-24 items-start gap-3 rounded-xl bg-paper/10 p-3">
                <span className="font-display text-2xl text-lime">{i + 1}</span>
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
      {notice && <p className="rounded-lg bg-lime/60 px-4 py-2">{notice}</p>}

      {/* 검색 */}
      <section className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="댓글 내용이나 닉네임으로 찾기"
          className="min-w-64 flex-1 rounded-xl border border-ink/20 bg-white px-4 py-2"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hideShort} onChange={(e) => setHideShort(e.target.checked)} />
          짧은 댓글(8자 미만) 숨기기
        </label>
        <span className="text-sm text-ink/60">
          {videoId ? `이번 방송(${videoId})` : "전체"} 댓글 {comments.length.toLocaleString()}건 중 {shown.length.toLocaleString()}건 · 최신순
        </span>
      </section>

      {/* 댓글 목록 */}
      <section className="flex flex-col divide-y overflow-hidden rounded-2xl bg-white shadow-sm">
        {shown.slice(0, 500).map((c) => {
          const picked = picks.includes(c.id);
          const samePerson = !picked && pickedChannels.has(c.channelId);
          const blocked = c.unsafe || c.staff;
          const full = picks.length >= MAX;
          return (
            <div key={c.id} className={`flex items-start gap-3 p-3 ${picked ? "bg-lime/40" : ""}`}>
              {c.thumbUrl ? (
                <img src={c.thumbUrl} alt="" width={48} height={48} className="size-12 rounded-lg bg-green object-cover" loading="lazy" />
              ) : (
                <div className="size-12 rounded-lg bg-gray-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <b>{c.displayName}</b> <span className="text-ink/50">· {time(c.publishedAt)} · 이 사람 댓글 {countBy.get(c.channelId)}건</span>
                  {c.staff && <Badge tone="gray">운영진·모더레이터</Badge>}
                  {c.excludedReason && <Badge tone="red">캐릭터 제외</Badge>}
                  {c.unsafe && <Badge tone="red">개인정보·욕설</Badge>}
                </p>
                <p className="mt-0.5 break-words">{c.message}</p>
              </div>
              <button
                disabled={pending || picked || samePerson || blocked || full}
                onClick={() => save([...picks, c.id])}
                title={blocked ? "방송에 띄울 수 없는 댓글입니다" : samePerson ? "이미 이 사람의 댓글을 골랐어요" : full ? "이미 2개를 골랐어요. 하나를 빼고 고르세요" : undefined}
                className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-lime disabled:opacity-30"
              >
                {picked ? "선정됨" : "선정"}
              </button>
            </div>
          );
        })}
        {shown.length > 500 && <p className="p-3 text-sm text-ink/60">앞의 500건만 보여요. 검색어로 좁혀 주세요.</p>}
        {!shown.length && <p className="p-6 text-center text-ink/60">댓글이 없습니다.</p>}
      </section>
    </div>
  );
}

function Badge({ tone, children }: { tone: "red" | "gray"; children: React.ReactNode }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${tone === "red" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"}`}>
      {children}
    </span>
  );
}
