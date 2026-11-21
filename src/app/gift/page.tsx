import { Suspense } from "react";
import { connection } from "next/server";
import { publicClient, publicImageUrl } from "@/lib/supabase";
import { GiftBox, type GiftCharacter } from "./gift-box";

export default function GiftPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-16 pt-8">
      <header className="relative overflow-hidden rounded-3xl bg-ink px-6 pb-10 pt-7 text-paper">
        <p className="text-sm font-semibold text-lime">교사 개발자의 날 · 2회 공개방송 · 2026. 11. 24.</p>
        <h1 className="font-display mt-3 text-4xl leading-tight sm:text-5xl">
          댓글로 함께해 주셔서
          <br />
          <span className="text-lime">고마워요!</span>
        </h1>
        <p className="mt-2 text-sm text-paper/70">Thank you for joining us in the live chat!</p>
        <p className="relative z-10 mt-4 pr-6 text-[15px] leading-relaxed text-paper/90">
          라이브에 남겨 주신 닉네임과 댓글로 세상에 하나뿐인 <b className="text-lime">○○핑</b> 캐릭터를 만들었어요.
          <br />
          <span className="text-sm text-paper/60">We made a one-of-a-kind character from your nickname and comments.</span>
        </p>
        <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-8 size-28 rounded-full bg-lime/90" />
        <div aria-hidden className="pointer-events-none absolute bottom-14 right-4 size-6 rounded-full bg-green" />
      </header>

      <Suspense fallback={<GiftSkeleton />}>
        <GiftData />
      </Suspense>

      <footer className="flex flex-col gap-3 rounded-3xl bg-lime px-6 py-6">
        <p className="text-sm font-semibold">다음 방송 예고 · Coming next</p>
        <p className="font-display text-2xl">3회 「구해줘요, 교사 개발자!」</p>
        <p className="text-sm">2026. 12. 15. 공개방송에서 또 만나요! · See you on Dec 15.</p>
        <a
          href="https://www.instagram.com/sendevkorea/"
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-lime"
        >
          인스타그램 @sendevkorea
        </a>
      </footer>
    </main>
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
    <section className="rounded-3xl bg-white px-6 py-10 text-center shadow-sm">
      <p className="font-display text-2xl">{title}</p>
      <p className="mt-2 text-sm text-ink/70">{body}</p>
    </section>
  );
}

function GiftSkeleton() {
  return (
    <section className="flex flex-col gap-4" aria-busy>
      <div className="h-14 animate-pulse rounded-2xl bg-white" />
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-2xl bg-green/40" />
        ))}
      </div>
    </section>
  );
}
