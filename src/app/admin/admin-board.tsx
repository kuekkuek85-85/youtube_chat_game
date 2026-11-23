"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { collectorView } from "@/lib/collector-status";
import { approveAllDone, logout, regenerate, setExcluded, setPublicOpen, setStatus } from "./actions";

export interface AdminCharacter {
  id: string;
  channel_id: string;
  display_name: string;
  name: string | null;
  personality: string | null;
  look: string[];
  quote: string | null;
  comment: string | null;
  status: string;
  error: string | null;
  attempts: number;
  updated_at: string;
  thumb_url: string | null;
  image_url: string | null;
}

export interface AdminParticipant {
  channel_id: string;
  display_name: string;
  comment_count: number;
  top_comments: string[];
  excluded: boolean;
  excluded_reason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "대기",
  done: "생성 완료",
  failed: "실패",
  approved: "승인",
  hidden: "숨김",
};
const STATUS_COLOR: Record<string, string> = {
  queued: "bg-gray-200 text-gray-800",
  done: "bg-sky-100 text-sky-900",
  failed: "bg-red-100 text-red-800",
  approved: "bg-green-200 text-green-900",
  hidden: "bg-gray-800 text-gray-100",
};
const FILTERS = ["all", "done", "approved", "hidden", "failed", "queued", "pending", "excluded"] as const;
const FILTER_LABEL: Record<string, string> = {
  all: "전체 캐릭터",
  pending: "미생성 참여자",
  excluded: "제외된 참여자",
  ...STATUS_LABEL,
};

const GENERATOR_LABEL: Record<string, string> = {
  running: "만드는 중",
  idle: "다음 회차 대기",
  finished: "끝남",
  stopped: "상한 도달로 멈춤",
  crashed: "오류로 멈춤",
};

function timeAgo(iso?: string): string {
  if (!iso) return "-";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  return new Date(iso).toLocaleString("ko-KR");
}

export function AdminBoard(props: {
  filter: string;
  settings: Record<string, string>;
  messageCount: number;
  participants: AdminParticipant[];
  characters: AdminCharacter[];
}) {
  const { filter, settings, messageCount, participants, characters } = props;
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const publicOpen = settings.public_open === "true";

  const counts = characters.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const withChar = new Set(characters.map((c) => c.channel_id));
  const excluded = participants.filter((p) => p.excluded);
  const notGenerated = participants.filter((p) => !p.excluded && !withChar.has(p.channel_id));
  const participantById = new Map(participants.map((p) => [p.channel_id, p]));

  const shown = filter === "all" ? characters : characters.filter((c) => c.status === filter);
  const collector = collectorView(settings.collector_status, settings.collector_last_poll);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* 현황 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="수집 상태"
          value={collector.label}
          valueClassName={collector.tone === "ok" ? "text-green-700" : collector.tone === "warn" ? "text-red-600" : undefined}
          sub={`마지막 수집 ${timeAgo(settings.collector_last_poll)}`}
        />
        <Stat label="수집한 댓글" value={`${messageCount.toLocaleString()}건`} sub={`API 호출 ${settings.collector_calls ?? 0}회`} />
        <Stat label="참여자" value={`${participants.length}명`} sub={`제외 ${excluded.length} · 미생성 ${notGenerated.length}`} />
        <Stat
          label="이미지 사용량"
          value={`${settings.images_generated ?? 0}장`}
          sub={
            settings.generator_round
              ? `생성 도우미 ${settings.generator_round}회차 · ${GENERATOR_LABEL[settings.generator_status?.split(":")[0] ?? ""] ?? settings.generator_status} · ${timeAgo(settings.generator_last_run)}`
              : "상한은 MAX_IMAGES"
          }
        />
      </section>

      {/* 공개 스위치 */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <span className="font-semibold">선물상자 공개</span>
        <button
          disabled={pending}
          onClick={() => start(() => setPublicOpen(!publicOpen))}
          className={`rounded-full px-4 py-1.5 font-bold ${publicOpen ? "bg-green-500 text-white" : "bg-gray-300 text-gray-800"}`}
          aria-pressed={publicOpen}
        >
          {publicOpen ? "ON · 공개 중" : "OFF · 비공개"}
        </button>
        {publicOpen ? (
          <span className="text-sm text-ink/60">승인된 캐릭터 {counts.approved ?? 0}명이 /gift 에 보입니다.</span>
        ) : (
          <span className="text-sm font-semibold text-red-600">
            지금은 /gift 에 아무것도 안 보입니다. 승인된 {counts.approved ?? 0}명은 공개 ON 을 누르면 보입니다.
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            disabled={pending || !counts.done}
            onClick={() =>
              start(async () => {
                if (!confirm(`생성 완료 ${counts.done}명을 모두 승인할까요? (제외된 참여자는 건너뜁니다)`)) return;
                const r = await approveAllDone();
                setNotice(r.ok ? `${r.count}명을 승인했습니다.` : `승인 실패: ${r.error}`);
              })
            }
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-lime disabled:opacity-40"
          >
            생성 완료 전체 승인 ({counts.done ?? 0})
          </button>
          <Link href="/admin/award" className="rounded-lg bg-lime px-3 py-1.5 text-sm font-semibold">🏆 베스트 댓글 시상</Link>
          <Link href="/gift" target="_blank" className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm">/gift 열기</Link>
          <button onClick={() => start(() => logout())} className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm">로그아웃</button>
        </div>
      </section>
      {notice && <p className="rounded-lg bg-lime/60 px-4 py-2">{notice}</p>}

      {/* 필터 */}
      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n =
            f === "all" ? characters.length : f === "pending" ? notGenerated.length : f === "excluded" ? excluded.length : counts[f] ?? 0;
          return (
            <Link
              key={f}
              href={f === "all" ? "/admin" : `/admin?status=${f}`}
              className={`rounded-full px-3 py-1 text-sm ${filter === f ? "bg-ink text-lime" : "bg-white text-ink shadow-sm"}`}
            >
              {FILTER_LABEL[f]} {n}
            </Link>
          );
        })}
      </nav>

      {filter === "pending" || filter === "excluded" ? (
        <ParticipantTable rows={filter === "pending" ? notGenerated : excluded} />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CharacterCard key={c.id} c={c} participant={participantById.get(c.channel_id)} />
          ))}
          {!shown.length && <p className="text-ink/60">해당하는 캐릭터가 없습니다. 터미널에서 npm run generate 를 실행하세요.</p>}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, valueClassName }: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-xs text-ink/60">{label}</div>
      <div className={`mt-1 truncate text-lg font-bold ${valueClassName ?? ""}`} title={value}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink/60">{sub}</div>}
    </div>
  );
}

function CharacterCard({ c, participant }: { c: AdminCharacter; participant?: AdminParticipant }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const regen = (mode: "all" | "image") =>
    start(async () => {
      setMsg("생성 중… (최대 1~2분)");
      const r = await regenerate(c.channel_id, mode);
      setMsg(r.ok ? "다시 만들었습니다." : `실패: ${r.error}`);
    });
  const change = (status: "approved" | "hidden") =>
    start(async () => {
      const r = await setStatus([c.id], status);
      setMsg(r.ok ? null : `실패: ${r.error}`);
    });
  const excluded = participant?.excluded ?? false;

  return (
    <article className={`flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {c.thumb_url ? (
          <a href={c.image_url ?? "#"} target="_blank" rel="noreferrer">
            <img src={c.thumb_url} alt={c.name ?? ""} width={112} height={112} className="size-28 rounded-xl bg-green object-cover" loading="lazy" />
          </a>
        ) : (
          <div className="grid size-28 place-items-center rounded-xl bg-gray-100 text-xs text-ink/50">이미지 없음</div>
        )}
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[c.status] ?? ""}`}>
            {STATUS_LABEL[c.status] ?? c.status}
          </span>
          <h3 className="mt-1 truncate font-display text-xl">{c.name}</h3>
          <p className="truncate text-sm text-ink/60">{c.display_name} · 댓글 {participant?.comment_count ?? "?"}건</p>
          <p className="text-sm">{c.personality}</p>
        </div>
      </div>
      {c.quote && <p className="rounded-lg bg-lime/40 px-3 py-2 text-sm">“{c.quote}”</p>}
      {c.comment && <p className="text-xs text-ink/60">원래 댓글: {c.comment}</p>}
      {c.look.length > 0 && <p className="text-xs text-ink/50">외형: {c.look.join(", ")}</p>}
      {excluded && (
        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
          제외된 참여자 ({REASON_LABEL[participant?.excluded_reason ?? ""] ?? participant?.excluded_reason}) · 승인할 수 없습니다
        </p>
      )}
      {c.error && <p className="text-xs text-red-700">오류: {c.error}</p>}
      {msg && <p className="text-xs font-semibold">{msg}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button disabled={pending || excluded || c.status === "approved" || !c.image_url} onClick={() => change("approved")} title={excluded ? "제외된 참여자입니다" : undefined} className="rounded-lg bg-green-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">승인</button>
        <button disabled={pending || c.status === "hidden"} onClick={() => change("hidden")} className="rounded-lg bg-gray-800 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">숨김</button>
        <button disabled={pending || excluded} onClick={() => regen("image")} className="rounded-lg border border-ink/20 px-3 py-1 text-sm disabled:opacity-30" title="프로필은 두고 이미지만 다시">이미지만 재생성</button>
        <button disabled={pending || excluded} onClick={() => regen("all")} className="rounded-lg border border-ink/20 px-3 py-1 text-sm disabled:opacity-30" title="프로필과 이미지 모두 다시">전체 재생성</button>
      </div>
    </article>
  );
}

const REASON_LABEL: Record<string, string> = {
  staff: "운영진",
  moderator: "모더레이터",
  opt_out: "#캐릭터제외 요청",
  no_usable_comments: "쓸 수 있는 댓글 없음(개인정보·욕설)",
  manual: "운영자 수동 제외",
  not_in_video: "이번 방송 댓글 없음(리허설 등)",
};

function ParticipantTable({ rows }: { rows: AdminParticipant[] }) {
  const [pending, start] = useTransition();
  if (!rows.length) return <p className="text-ink/60">없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs text-ink/60">
          <tr>
            <th className="p-3">닉네임</th>
            <th className="p-3">댓글</th>
            <th className="p-3">대표 댓글</th>
            <th className="p-3">상태</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.channel_id} className="border-b last:border-0">
              <td className="p-3 font-semibold">{p.display_name}</td>
              <td className="p-3">{p.comment_count}</td>
              <td className="max-w-md truncate p-3 text-ink/70">{p.top_comments[0] ?? "-"}</td>
              <td className="p-3">{p.excluded ? REASON_LABEL[p.excluded_reason ?? ""] ?? p.excluded_reason : "생성 대기"}</td>
              <td className="p-3">
                <button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await setExcluded(p.channel_id, !p.excluded);
                      if (!r.ok) alert(r.error);
                    })
                  }
                  className="rounded-lg border border-ink/20 px-2 py-1 text-xs"
                >
                  {p.excluded ? "제외 해제" : "제외"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
