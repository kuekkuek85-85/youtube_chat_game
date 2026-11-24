"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { autoPick, searchCharacters } from "@/lib/search";

export interface GiftCharacter {
  id: string;
  displayName: string;
  name: string;
  personality: string;
  quote: string;
  comment: string;
  imageUrl: string;
  thumbUrl: string;
}

export function GiftBox({ characters }: { characters: GiftCharacter[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const cardRef = useRef<HTMLDivElement>(null);

  const { matches, exactCount } = useMemo(() => searchCharacters(characters, deferred), [deferred, characters]);
  const selected = characters.find((c) => c.id === selectedId) ?? autoPick(matches, exactCount);

  const pick = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <>
      <section className="flex flex-col gap-4">
        <label htmlFor="nick" className="flex flex-col">
          <span className="text-2xl font-bold text-green">🔍 내 캐릭터 찾기</span>
          <span className="text-sm italic text-sage">Find my character</span>
        </label>
        <div className="relative">
          <input
            id="nick"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="유튜브 닉네임을 입력하세요 · Your YouTube name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedId(null);
            }}
            className="w-full rounded-2xl border border-line bg-panel px-5 py-4 text-lg text-paper outline-none placeholder:text-sage/80 focus:border-lime focus:ring-2 focus:ring-lime/40"
          />
        </div>

        {deferred && matches.length === 0 && (
          <p className="card px-5 py-4 text-sm text-paper/85">
            &lsquo;{deferred}&rsquo; 캐릭터를 찾지 못했어요. 닉네임을 다시 확인해 주세요. (앞의 @는 빼도 돼요)
            <br />
            <span className="italic text-sage">No match. Please check your nickname.</span>
          </p>
        )}

        {!selected && matches.length > 1 && exactCount > 1 && (
          <p className="text-sm text-lime">
            같은 닉네임이 {exactCount}명 있어요. 내 캐릭터를 골라 주세요. · Several people share this name — pick yours.
          </p>
        )}
        {!selected && matches.length > 1 && (
          <ul className="flex flex-col gap-2">
            {matches.map((c) => (
              <li key={c.id}>
                <button onClick={() => pick(c.id)} className="card flex w-full items-center gap-3 p-2 pr-4 text-left hover:border-lime active:scale-[0.99]">
                  <img src={c.thumbUrl} alt="" width={48} height={48} className="size-12 rounded-xl bg-green" />
                  <span className="font-bold text-green">{c.name}</span>
                  <span className="truncate text-sm text-sage">{c.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div ref={cardRef}>{selected && <CharacterCard key={selected.id} c={selected} />}</div>
      </section>

      <Village characters={characters} onPick={pick} />
    </>
  );
}

function CharacterCard({ c }: { c: GiftCharacter }) {
  const [saving, setSaving] = useState(false);
  return (
    <article className="card-hi animate-pop overflow-hidden shadow-[0_0_40px_-10px_rgba(212,255,42,.45)]">
      <div className="bg-green">
        <img src={c.imageUrl} alt={`${c.name} 캐릭터`} width={1024} height={1024} className="aspect-square w-full" />
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div>
          <p className="text-sm font-bold text-sage">{c.displayName} 님의 캐릭터 · <i className="font-normal">Your character</i></p>
          <h2 className="text-4xl font-black text-lime">{c.name}</h2>
          <p className="mt-1 text-paper">{c.personality}</p>
        </div>
        {c.quote && (
          <div className="rounded-xl bg-lime px-4 py-3 text-ink">
            <p className="text-xs font-bold text-ink/60">오늘의 한마디 · <i className="font-normal">Today&apos;s line</i></p>
            <p className="mt-1 text-lg font-bold">“{c.quote}”</p>
          </div>
        )}
        {c.comment && (
          <p className="text-sm text-paper/75">
            <span className="font-bold text-green">💬 내가 남긴 댓글</span> · {c.comment}
          </p>
        )}
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await saveCard(c);
            } finally {
              setSaving(false);
            }
          }}
          className="mt-1 rounded-xl bg-lime px-5 py-4 text-lg font-bold text-ink active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? "저장 중…" : "이미지 저장 · Save image"}
        </button>
        <p className="text-center text-xs text-sage">아이폰은 새 창에서 이미지를 길게 눌러 저장하세요.</p>
      </div>
    </article>
  );
}

function Village({ characters, onPick }: { characters: GiftCharacter[]; onPick: (id: string) => void }) {
  if (!characters.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex flex-col">
        <span className="text-2xl font-bold text-green">🏘️ 핑핑 마을 <span className="text-base font-normal text-paper/70">{characters.length}명</span></span>
        <span className="text-sm italic text-sage">The village</span>
      </h2>
      <div
        className="card grid grid-cols-4 gap-x-2 gap-y-4 p-4 sm:grid-cols-6"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(180,239,160,.14) 1.5px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      >
        {characters.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className={`villager flex flex-col items-center gap-1 outline-none ${i % 2 ? "translate-y-2" : ""}`}
            title={c.name}
          >
            <img src={c.thumbUrl} alt={c.name} width={160} height={160} loading="lazy" decoding="async" className="aspect-square w-full rounded-2xl bg-green" />
            <span className="w-full truncate rounded-full bg-ink/80 px-1 text-center text-[11px] font-bold text-green">{c.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- 카드 이미지 저장 (캔버스 합성, 실패하면 원본 이미지로) ---------- */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of [...text]) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else line += ch;
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

async function saveCard(c: GiftCharacter) {
  const filename = `${c.name}.png`;
  try {
    const img = await loadImage(c.imageUrl);
    const W = 1080, H = 1440;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const fontBody = getComputedStyle(document.documentElement).getPropertyValue("--font-noto").trim() || "sans-serif";
    const logo = await loadImage("/brand/logo.png").catch(() => null);

    ctx.fillStyle = "#0A0D0C";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#B4EFA0";
    roundRect(ctx, 60, 60, W - 120, W - 120, 48);
    ctx.fill();
    ctx.save();
    roundRect(ctx, 60, 60, W - 120, W - 120, 48);
    ctx.clip();
    ctx.drawImage(img, 60, 60, W - 120, W - 120);
    ctx.restore();

    ctx.fillStyle = "#D4FF2A";
    ctx.font = `900 88px ${fontBody}`;
    ctx.fillText(c.name, 72, W + 70, W - 144);
    ctx.fillStyle = "#F2F5F0";
    ctx.font = `38px ${fontBody}`;
    ctx.fillText(c.personality, 72, W + 135, W - 144);
    if (c.quote) {
      ctx.font = `bold 40px ${fontBody}`;
      ctx.fillStyle = "#D4FF2A";
      wrapText(ctx, `“${c.quote}”`, W - 144, 2).forEach((l, i) => ctx.fillText(l, 72, W + 210 + i * 54));
    }
    ctx.fillStyle = "#8FA89A";
    ctx.font = `28px ${fontBody}`;
    ctx.fillText("교사 개발자의 날 · 2회 공개방송 선물상자 · @sendevkorea", 72, H - 50, W - 260);
    if (logo) ctx.drawImage(logo, W - 172, H - 172, 112, 112);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob failed");
    download(blob, filename);
  } catch {
    // 캔버스가 막히면 원본 이미지를 새 창으로 연다
    window.open(c.imageUrl, "_blank", "noopener");
  }
}

function download(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  // 모바일은 공유 시트(사진 앱에 저장)를 먼저 시도
  if (/Android|iPhone|iPad/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: filename }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
