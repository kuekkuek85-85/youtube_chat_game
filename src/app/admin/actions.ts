"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { ADMIN_COOKIE, checkPassword, requireAdmin, sessionToken } from "@/lib/auth";
import { adminClient, setSettings } from "@/lib/supabase";
import { createCharacter, type ParticipantRow } from "@/lib/generate";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const pw = String(form.get("password") ?? "");
  // 무차별 대입을 늦추기 위한 짧은 지연
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPassword(pw)) return "비밀번호가 올바르지 않습니다.";
  (await cookies()).set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  refresh();
  return null;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  refresh();
}

type Status = "approved" | "hidden" | "done";
type Result = { ok: true; count: number } | { ok: false; error: string };

/** 제외된 참여자(#캐릭터제외·운영진·수동 제외 등)의 채널 ID */
async function excludedChannelIds(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const { data, error } = await db.from("participants").select("channel_id").eq("excluded", true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.channel_id as string));
}

export async function setStatus(ids: string[], status: Status): Promise<Result> {
  await requireAdmin();
  if (!ids.length) return { ok: true, count: 0 };
  const db = adminClient();
  try {
    if (status === "approved") {
      const { data: rows, error } = await db.from("characters").select("id, channel_id").in("id", ids);
      if (error) throw new Error(error.message);
      const excluded = await excludedChannelIds(db);
      if ((rows ?? []).some((r) => excluded.has(r.channel_id as string))) {
        return { ok: false, error: "제외된 참여자의 캐릭터는 승인할 수 없습니다. 먼저 '제외 해제'를 하세요." };
      }
    }
    const { data, error } = await db
      .from("characters")
      .update({ status, updated_at: new Date().toISOString() })
      .in("id", ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, count: data?.length ?? 0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    refresh();
  }
}

/** 생성 완료(done)된 캐릭터를 한꺼번에 승인 (제외된 참여자는 건너뜀) */
export async function approveAllDone(): Promise<Result> {
  await requireAdmin();
  const db = adminClient();
  try {
    const { data: done, error: readErr } = await db.from("characters").select("id, channel_id").eq("status", "done");
    if (readErr) throw new Error(readErr.message);
    const excluded = await excludedChannelIds(db);
    const ids = (done ?? []).filter((r) => !excluded.has(r.channel_id as string)).map((r) => r.id as string);
    let count = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from("characters")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .in("id", ids.slice(i, i + 200))
        .eq("status", "done")
        .select("id");
      if (error) throw new Error(error.message);
      count += data?.length ?? 0;
    }
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    refresh();
  }
}

export async function setPublicOpen(open: boolean): Promise<void> {
  await requireAdmin();
  await setSettings(adminClient(), { public_open: open ? "true" : "false" });
  refresh();
}

/** 캐릭터 한 명 재생성. mode=image 면 프로필은 두고 이미지만 다시. (30~90초 걸릴 수 있음) */
export async function regenerate(channelId: string, mode: "all" | "image"): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const db = adminClient();
  const { data, error } = await db
    .from("participants")
    .select("channel_id, display_name, top_comments, keywords, excluded")
    .eq("channel_id", channelId)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "참여자를 찾을 수 없습니다." };
  if (data.excluded) return { ok: false, error: "제외된 참여자입니다." };
  try {
    await createCharacter(db, data as ParticipantRow, { keepProfile: mode === "image" });
    refresh();
    return { ok: true };
  } catch (e) {
    refresh();
    return { ok: false, error: (e as Error).message };
  }
}

/** 참여자를 수동으로 제외/포함 (제외 요청을 방송 밖에서 받은 경우 등) */
export async function setExcluded(channelId: string, excluded: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const db = adminClient();
  try {
    const now = new Date().toISOString();
    const { error } = await db
      .from("participants")
      .update({ excluded, excluded_reason: excluded ? "manual" : null, updated_at: now })
      .eq("channel_id", channelId);
    if (error) throw new Error(error.message);
    if (excluded) {
      const { error: hideErr } = await db.from("characters").update({ status: "hidden", updated_at: now }).eq("channel_id", channelId);
      if (hideErr) throw new Error(`참여자는 제외했지만 캐릭터 숨김에 실패했습니다. 다시 시도하세요: ${hideErr.message}`);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    refresh();
  }
}
