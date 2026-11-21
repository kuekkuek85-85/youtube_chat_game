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
