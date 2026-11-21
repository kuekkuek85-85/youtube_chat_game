// 캐릭터 생성: 1단계 프로필(LLM) → 2단계 이미지(OpenAI 이미지 API) → Storage 업로드 (PRD 6-3)
import OpenAI from "openai";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./supabase";
import { buildImagePrompt, characterName, cleanNickname, stripBannedTerms, BANNED_TERMS, type CharacterProfile } from "./style";
import { containsPII, containsProfanity } from "./filters";

export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
export const IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "low") as "low" | "medium" | "high";
export const MAX_IMAGES = Number(process.env.MAX_IMAGES || 400);

export interface ParticipantRow {
  channel_id: string;
  display_name: string;
  top_comments: string[];
  keywords: string[];
}

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("환경변수 OPENAI_API_KEY 가 비어 있습니다.");
    client = new OpenAI();
  }
  return client;
}

const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["personality", "look", "quote"],
  properties: {
    personality: { type: "string", description: "한 줄 성격, 한국어 25자 이내" },
    look: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", description: "외형 키워드, 영어 1~4단어 (예: 'tiny headphones')" },
    },
    quote: { type: "string", description: "오늘의 한마디, 한국어 40자 이내, 원래 댓글의 분위기를 반영" },
  },
} as const;

const SYSTEM_PROMPT = `너는 교사 개발자 공개방송 청취자를 위한 오리지널 마스코트 캐릭터 작가다.
청취자의 닉네임과 라이브 댓글을 보고 캐릭터 프로필을 만든다.
규칙:
- 완전히 새로 디자인한 캐릭터다. 기존 애니메이션·게임·캐릭터 상품(예: ${BANNED_TERMS.slice(0, 6).join(", ")} 등)의 이름이나 외형을 언급하거나 흉내 내지 않는다.
- 실존 인물(연예인, 정치인 등)을 묘사하지 않는다.
- 외형 키워드(look)는 이미지 생성용이라 영어로, 색·소품·모양 위주로 쓴다. 글자·로고는 넣지 않는다.
- 오늘의 한마디(quote)는 댓글 내용을 따뜻하고 재치 있게 반영한다. 개인정보, 비속어, 비방은 절대 넣지 않는다.
- 결과는 JSON 으로만 답한다.`;

export async function generateProfile(p: ParticipantRow): Promise<CharacterProfile> {
  const nickname = cleanNickname(p.display_name);
  const user = [
    `닉네임: ${nickname}`,
    `캐릭터 이름: ${characterName(p.display_name)}`,
    `대표 댓글:\n${p.top_comments.map((c) => `- ${c}`).join("\n")}`,
    p.keywords.length ? `키워드: ${p.keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await openai().chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "character_profile", strict: true, schema: PROFILE_SCHEMA as unknown as Record<string, unknown> },
    },
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("프로필 응답이 비어 있습니다.");
  const raw = JSON.parse(text) as CharacterProfile;
  return sanitizeProfile(raw);
}

const unsafe = (s: string) => containsPII(s) || containsProfanity(s);
export const FALLBACK_PERSONALITY = "댓글로 방송을 밝혀 준 다정한 청취자";
export const FALLBACK_QUOTE = "오늘 방송 함께해서 즐거웠어요!";

/** LLM 결과를 한 번 더 걸러낸다 (금지어 제거, 길이 제한, 모든 필드의 개인정보·욕설 차단) */
export function sanitizeProfile(raw: CharacterProfile): CharacterProfile {
  let personality = stripBannedTerms(String(raw.personality ?? "")).slice(0, 40);
  if (unsafe(personality)) personality = FALLBACK_PERSONALITY;
  const look = (Array.isArray(raw.look) ? raw.look : [])
    // 모델이 키워드 여러 개를 한 문자열에 몰아 넣는 경우가 있다 (예: 'a」「b', 'a`,`b') → 나눠서 쓴다
    .flatMap((s) => String(s).split(/[」「『』`|\n]+|,\s*/))
    .map((s) => stripBannedTerms(s.trim()).slice(0, 60).trim())
    .filter((s) => s && !unsafe(s)) // 공개 표시 + 이미지 프롬프트로 가므로 문제 있는 항목은 버린다
    .slice(0, 3);
  let quote = stripBannedTerms(String(raw.quote ?? "")).slice(0, 60);
  if (unsafe(quote)) quote = FALLBACK_QUOTE;
  if (!personality || look.length === 0) throw new Error("프로필 형식이 올바르지 않습니다.");
  return { personality, look, quote };
}

/** 이미지 1장 몫을 DB 에서 원자적으로 예약한다. 동시에 여러 건이 와도 MAX_IMAGES 를 넘지 않는다. */
async function reserveImageSlot(db: SupabaseClient): Promise<void> {
  const { data, error } = await db.rpc("reserve_image_slot", { cap: MAX_IMAGES });
  if (error) throw new Error(`이미지 상한 예약 실패: ${error.message} (supabase/schema.sql 을 다시 실행했는지 확인)`);
  if (data == null) throw new CapReachedError(`이미지 생성 상한(${MAX_IMAGES}장)에 도달했습니다.`);
}

export class CapReachedError extends Error {}

export async function generateImage(profile: CharacterProfile): Promise<Buffer> {
  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt: buildImagePrompt(profile),
    size: "1024x1024",
    quality: IMAGE_QUALITY,
    output_format: "webp",
    output_compression: 85,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("이미지 응답이 비어 있습니다.");
  return Buffer.from(b64, "base64");
}

async function upload(db: SupabaseClient, path: string, body: Buffer) {
  const { error } = await db.storage.from(BUCKET).upload(path, body, { contentType: "image/webp", upsert: true });
  if (error) throw error;
}

/**
 * 참여자 한 명의 캐릭터를 만들어 저장한다. 실패하면 status=failed 로 남기고 오류를 다시 던진다.
 * 이미 프로필이 있고 keepProfile=true 면 이미지만 다시 만든다.
 */
export async function createCharacter(
  db: SupabaseClient,
  p: ParticipantRow,
  opts: { keepProfile?: boolean } = {},
): Promise<void> {
  const name = characterName(p.display_name);
  const { data: existing, error: readErr } = await db
    .from("characters")
    .select("personality, look, quote, attempts, image_path, thumb_path")
    .eq("channel_id", p.channel_id)
    .maybeSingle();
  if (readErr) throw new Error(`캐릭터 조회 실패: ${readErr.message}`);

  // 행을 먼저 확보하지 못하면 유료 생성(OpenAI)으로 넘어가지 않는다
  const { error: upsertErr } = await db.from("characters").upsert(
    {
      channel_id: p.channel_id,
      display_name: cleanNickname(p.display_name),
      name,
      comment: p.top_comments[0] ?? null,
      status: "queued",
      error: null,
      attempts: (existing?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id" },
  );
  if (upsertErr) throw new Error(`캐릭터 저장 실패: ${upsertErr.message}`);

  try {
    const profile =
      opts.keepProfile && existing?.personality && Array.isArray(existing.look)
        ? sanitizeProfile({ personality: existing.personality, look: existing.look, quote: existing.quote ?? "" })
        : await generateProfile(p);

    await reserveImageSlot(db);
    const full = await generateImage(profile);
    const thumb = await sharp(full).resize(320, 320).webp({ quality: 80 }).toBuffer();

    const stamp = `${Date.now()}-${randomBytes(6).toString("hex")}`;
    const safeId = p.channel_id.replace(/[^A-Za-z0-9_-]/g, "");
    const imagePath = `${safeId}/${stamp}.webp`;
    const thumbPath = `${safeId}/${stamp}-thumb.webp`;
    await upload(db, imagePath, full);
    await upload(db, thumbPath, thumb);

    const { data: saved, error } = await db
      .from("characters")
      .update({
        personality: profile.personality,
        look: profile.look,
        quote: profile.quote,
        image_path: imagePath,
        thumb_path: thumbPath,
        status: "done",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("channel_id", p.channel_id)
      .select("id");
    if (error || !saved?.length) {
      await db.storage.from(BUCKET).remove([imagePath, thumbPath]).catch(() => {});
      throw new Error(`캐릭터 저장 실패: ${error?.message ?? "행이 없습니다"}`);
    }

    // 재생성이면 예전 이미지 파일은 지운다 (실패해도 무시)
    const old = [existing?.image_path, existing?.thumb_path].filter((x): x is string => !!x);
    if (old.length) await db.storage.from(BUCKET).remove(old).catch(() => {});
  } catch (e) {
    await db
      .from("characters")
      .update({ status: "failed", error: String((e as Error)?.message ?? e).slice(0, 500), updated_at: new Date().toISOString() })
      .eq("channel_id", p.channel_id);
    throw e;
  }
}
