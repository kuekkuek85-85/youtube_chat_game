import { Suspense } from "react";
import { connection } from "next/server";
import { publicClient, publicImageUrl } from "@/lib/supabase";
import { GiftBox, type GiftCharacter } from "./gift-box";

export default function GiftPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-16 pt-6">
      {/* 머리: PPT 슬라이드 머리와 같은 구성 (로고 원 · 두 줄 제목 · 상태 알약) */}
      <header className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <img src="/brand/logo.png" alt="교사 개발자" width={64} height={64} className="size-14 sm:size-16" />
          <span className="flex items-center gap-2 rounded-full bg-chip px-4 py-1.5 text-sm font-bold text-paper">
            <span aria-hidden className="size-2.5 rounded-full bg-lime shadow-[0_0_8px_#d4ff2a]" /> 선물상자 OPEN
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-sage">교사 개발자의 날 · 2회 공개방송 · 2026. 11. 24.</p>
          <h1 className="mt-2 text-4xl font-black leading-tight text-green sm:text-5xl">
            🎁 댓글로 함께해 주셔서 <span className="text-lime">고마워요!</span>
          </h1>
          <p className="mt-1 text-base italic text-sage">Thank you for joining us in the live chat!</p>
        </div>
        <p className="card px-5 py-4 text-[15px] leading-relaxed text-paper">
          라이브에 남겨 주신 닉네임과 댓글로 세상에 하나뿐인 <b className="text-lime">○○핑</b> 캐릭터를 만들었어요.
          <br />
          <span className="text-sm italic text-sage">We made a one-of-a-kind character from your nickname and comments.</span>
        </p>
      </header>

      <Suspense fallback={<GiftSkeleton />}>
        <GiftData />
      </Suspense>

      {/* 마무리: 디자인만 PPT 마지막 슬라이드 구성 (이퀄라이저 · 알약 · 주최 로고). 문구는 앱 원래 문구 */}
      <footer className="flex flex-col items-center gap-5 pt-4 text-center">
        <Equalizer />
        <p className="rounded-full bg-panel-hi px-5 py-2 text-sm font-bold text-lime">다음 방송 예고 · Coming next</p>
        <p className="-mt-1 text-2xl font-bold text-green">3회 「구해줘요, 교사 개발자!」</p>
        <p className="-mt-3 text-sm text-paper/85">
          2026. 12. 15. 공개방송에서 또 만나요! · <i className="text-sage">See you on Dec 15.</i>
        </p>
        <a
          href="https://www.instagram.com/sendevkorea/"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-green"
        >
          인스타그램 @sendevkorea
        </a>
        <img src="/brand/seoul-edu.png" alt="서울특별시교육청" width={180} height={44} className="mt-2 h-9 w-auto opacity-90" />
      </footer>
    </main>
  );
}

function Equalizer() {
  const bars = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.55, 0.85, 0.65, 1, 0.6];
  return (
    <div aria-hidden className="flex h-12 items-end gap-1.5">
      {bars.map((h, i) => (
        <span key={i} className="eq-bar w-2 bg-lime" style={{ height: `${h * 100}%`, animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

async function GiftData() {
  await connection(); // 요청 시점에 읽기 (공개 ON/OFF 즉시 반영)
  const db = publicClient();
  const [openRes, charsRes] = await Promise.all([
    db.rpc("is_public_open"),
    db
      .from("characters")
      .select("id, display_name, name, personality, quote, comment, image_path, thumb_path")
      .order("name", { ascending: true })
      .range(0, 1999),
  ]);

  if (openRes.error || charsRes.error) {
    return <Notice title="잠시 문제가 생겼어요" body="잠시 뒤 다시 열어 주세요. Please try again in a moment." />;
  }
  if (!openRes.data) {
    return <Notice title="선물상자를 준비하고 있어요 🎁" body="곧 열릴 예정이에요! 유튜브 고정 댓글과 인스타그램에서 소식을 알려 드릴게요. · Opening soon!" />;
  }

  const characters: GiftCharacter[] = (charsRes.data ?? []).map((c) => ({
    id: c.id,
    displayName: c.display_name,
    name: c.name ?? `${c.display_name}핑`,
    personality: c.personality ?? "",
    quote: c.quote ?? "",
    comment: c.comment ?? "",
    imageUrl: publicImageUrl(c.image_path) ?? "",
    thumbUrl: publicImageUrl(c.thumb_path) ?? publicImageUrl(c.image_path) ?? "",
  }));
  return <GiftBox characters={characters} />;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="card px-6 py-10 text-center">
      <p className="text-2xl font-bold text-green">{title}</p>
      <p className="mt-2 text-sm text-paper/80">{body}</p>
    </section>
  );
}

function GiftSkeleton() {
  return (
    <section className="flex flex-col gap-4" aria-busy>
      <div className="h-14 animate-pulse rounded-2xl bg-panel" />
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-2xl bg-panel" />
        ))}
      </div>
    </section>
  );
}
