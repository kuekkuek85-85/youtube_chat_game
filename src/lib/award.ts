// 베스트 댓글 시상: 운영진이 고른 댓글(최대 2개)을 settings.award_picks 에 메시지 ID 배열(JSON)로 저장한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSetting, publicImageUrl } from "./supabase";
import { cleanNickname } from "./style";

export const AWARD_KEY = "award_picks";
export const AWARD_MAX = 2;

export interface Winner {
  messageId: string;
  channelId: string;
  displayName: string;
  message: string;
  publishedAt: string;
  characterName: string | null;
  imageUrl: string | null;
}

export function parsePicks(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, AWARD_MAX) : [];
  } catch {
    return [];
  }
}

/** 선정된 댓글과 (있으면) 그 사람의 캐릭터를 고른 순서대로 돌려준다 */
export async function loadWinners(db: SupabaseClient): Promise<Winner[]> {
  const picks = parsePicks(await getSetting(db, AWARD_KEY));
  if (!picks.length) return [];
  const { data: msgs, error } = await db
    .from("chat_messages")
    .select("id, channel_id, display_name, message, published_at")
    .in("id", picks);
  if (error) throw new Error(error.message);
  const channelIds = (msgs ?? []).map((m) => m.channel_id as string);
  const { data: chars, error: charErr } = channelIds.length
    ? await db.from("characters").select("channel_id, name, image_path, status").in("channel_id", channelIds)
    : { data: [], error: null };
  if (charErr) throw new Error(charErr.message);
  const charBy = new Map((chars ?? []).map((c) => [c.channel_id as string, c]));
  const byId = new Map((msgs ?? []).map((m) => [m.id as string, m]));
  return picks
    .map((id) => byId.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => {
      const c = charBy.get(m.channel_id as string);
      const usable = c && c.status !== "hidden" && c.image_path;
      return {
        messageId: m.id as string,
        channelId: m.channel_id as string,
        displayName: cleanNickname(m.display_name as string),
        message: m.message as string,
        publishedAt: m.published_at as string,
        characterName: usable ? ((c.name as string | null) ?? null) : null,
        imageUrl: usable ? publicImageUrl(c.image_path as string) : null,
      };
    });
}
