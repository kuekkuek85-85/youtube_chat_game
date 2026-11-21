"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";

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

const norm = (s: string) => s.toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");

export function GiftBox({ characters }: { characters: GiftCharacter[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const cardRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = norm(deferred);
    if (!q) return [];
    const exact = characters.filter((c) => norm(c.displayName) === q || norm(c.name) === q);
    const partial = characters.filter((c) => !exact.includes(c) && (norm(c.displayName).includes(q) || norm(c.name).includes(q)));
    return [...exact, ...partial].slice(0, 20);
  }, [deferred, characters]);

  const selected =
    characters.find((c) => c.id === selectedId) ?? (matches.length === 1 || (matches[0] && norm(matches[0].displayName) === norm(deferred)) ? matches[0] : null);

  const pick = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <>
      <section className="flex flex-col gap-4">
        <label htmlFor="nick" className="font-display text-2xl">
          내 캐릭터 찾기 <span className="text-base text-ink/50">Find my character</span>
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
            className="w-full rounded-2xl border-2 border-ink bg-white px-5 py-4 text-lg outline-none placeholder:text-ink/40 focus:ring-4 focus:ring-lime"
          />
        </div>

        {deferred && matches.length === 0 && (
          <p className="rounded-2xl bg-white px-5 py-4 text-sm text-ink/70">
            &lsquo;{deferred}&rsquo; 캐릭터를 찾지 못했어요. 닉네임을 다시 확인해 주세요. (앞의 @는 빼도 돼요)
            <br />
            <span className="text-ink/50">No match. Please check your nickname.</span>
          </p>
        )}

        {!selected && matches.length > 1 && (
          <ul className="flex flex-col gap-2">
            {matches.map((c) => (
              <li key={c.id}>
                <button onClick={() => pick(c.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-2 pr-4 text-left shadow-sm active:scale-[0.99]">
                  <img src={c.thumbUrl} alt="" width={48} height={48} className="size-12 rounded-xl bg-green" />
                  <span className="font-semibold">{c.name}</span>
                  <span className="truncate text-sm text-ink/50">{c.displayName}</span>
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
    <article className="animate-pop overflow-hidden rounded-3xl border-2 border-ink bg-white shadow-[6px_6px_0_0_#0A0D0C]">
      <div className="bg-green">
        <img src={c.imageUrl} alt={`${c.name} 캐릭터`} width={1024} height={1024} className="aspect-square w-full" />
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div>
          <p className="text-sm text-ink/50">{c.displayName} 님의 캐릭터 · Your character</p>
          <h2 className="font-display text-4xl">{c.name}</h2>
          <p className="mt-1">{c.personality}</p>
        </div>
        {c.quote && (
          <div className="rounded-2xl bg-lime px-4 py-3">
            <p className="text-xs font-semibold text-ink/60">오늘의 한마디 · Today&apos;s line</p>
            <p className="mt-1 text-lg font-semibold">“{c.quote}”</p>
          </div>
        )}
        {c.comment && (
          <p className="text-sm text-ink/60">
            <span className="font-semibold">내가 남긴 댓글</span> · {c.comment}
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
          className="mt-1 rounded-2xl bg-ink px-5 py-4 text-lg font-bold text-lime active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? "저장 중…" : "이미지 저장 · Save image"}
        </button>
        <p className="text-center text-xs text-ink/50">아이폰은 새 창에서 이미지를 길게 눌러 저장하세요.</p>
      </div>
    </article>
  );
}

function Village({ characters, onPick }: { characters: GiftCharacter[]; onPick: (id: string) => void }) {
  if (!characters.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">
        핑핑 마을 <span className="text-base text-ink/50">The village · {characters.length}명</span>
      </h2>
      <div
        className="grid grid-cols-4 gap-x-2 gap-y-4 rounded-3xl p-4 sm:grid-cols-6"
        style={{
          backgroundColor: "#B4EFA0",
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(10,13,12,.12) 1.5px, transparent 0)",
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
            <img src={c.thumbUrl} alt={c.name} width={160} height={160} loading="lazy" decoding="async" className="aspect-square w-full rounded-2xl bg-paper shadow-sm" />
            <span className="w-full truncate rounded-full bg-paper/80 px-1 text-center text-[11px] font-semibold">{c.name}</span>
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
    const fontDisplay = getComputedStyle(document.documentElement).getPropertyValue("--font-jua").trim() || "sans-serif";
    const fontBody = getComputedStyle(document.documentElement).getPropertyValue("--font-noto").trim() || "sans-serif";

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
    ctx.font = `92px ${fontDisplay}`;
    ctx.fillText(c.name, 72, W + 70, W - 144);
    ctx.fillStyle = "#F6F8EF";
    ctx.font = `38px ${fontBody}`;
    ctx.fillText(c.personality, 72, W + 135, W - 144);
    if (c.quote) {
      ctx.font = `bold 40px ${fontBody}`;
      ctx.fillStyle = "#D4FF2A";
      wrapText(ctx, `“${c.quote}”`, W - 144, 2).forEach((l, i) => ctx.fillText(l, 72, W + 210 + i * 54));
    }
    ctx.fillStyle = "rgba(246,248,239,.55)";
    ctx.font = `28px ${fontBody}`;
    ctx.fillText("교사 개발자의 날 · 2회 공개방송 선물상자 · @sendevkorea", 72, H - 50, W - 144);

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
