import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "characters";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 비어 있습니다. .env.local 을 확인하세요.`);
  return v;
}

/** 서비스 롤 키 클라이언트: 스크립트와 관리자 서버 코드에서만 사용 (RLS 우회) */
export function adminClient(): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 공개(anon) 키 클라이언트: /gift 에서 사용. RLS 로 승인 + 공개 ON 캐릭터만 보인다. */
export function publicClient(): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = required("SUPABASE_URL").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * 제외된 참여자의 이미지 파일을 저장소에서 지우고 경로를 비운다.
 * 버킷이 공개라서, 숨김만 하면 이미 퍼진 URL 로 계속 볼 수 있기 때문이다.
 */
export async function removeCharacterImages(db: SupabaseClient, channelIds: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < channelIds.length; i += 200) {
    const { data, error } = await db
      .from("characters")
      .select("channel_id, image_path, thumb_path")
      .in("channel_id", channelIds.slice(i, i + 200));
    if (error) throw error;
    const paths = (data ?? []).flatMap((c) => [c.image_path, c.thumb_path]).filter((x): x is string => !!x);
    if (!paths.length) continue;
    const { error: rmErr } = await db.storage.from(BUCKET).remove(paths);
    if (rmErr) throw rmErr;
    const ids = (data ?? []).filter((c) => c.image_path || c.thumb_path).map((c) => c.channel_id as string);
    const { error: upErr } = await db.from("characters").update({ image_path: null, thumb_path: null, status: "hidden" }).in("channel_id", ids);
    if (upErr) throw upErr;
    removed += ids.length;
  }
  return removed;
}

export async function getSetting(db: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function setSettings(db: SupabaseClient, values: Record<string, string>): Promise<void> {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
  const { error } = await db.from("settings").upsert(rows);
  if (error) throw error;
}
