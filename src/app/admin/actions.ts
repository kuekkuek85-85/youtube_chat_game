"use server";

import { cookies, headers } from "next/headers";
import { refresh } from "next/cache";
import { createHash } from "node:crypto";
import { ADMIN_COOKIE, SESSION_HOURS, checkPassword, requireAdmin, sessionToken } from "@/lib/auth";
import { adminClient, removeCharacterImages, setSettings } from "@/lib/supabase";
import { createCharacter, type ParticipantRow } from "@/lib/generate";
import { AWARD_KEY, AWARD_MAX } from "@/lib/award";
import { containsPII, containsProfanity } from "@/lib/filters";

// 로그인 실패 제한: 같은 IP 에서 15분 안에 8번 틀리면 15분 동안 막는다 (전체 잠금은 운영진까지 막으므로 하지 않음)
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 15 * 60_000;

async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `login_fail:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const pw = String(form.get("password") ?? "").slice(0, 200);
  const db = adminClient();
  const key = await clientKey();
  const now = Date.now();
  const { data: row } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  let fails = { n: 0, since: now };
  try {
    const v = JSON.parse(row?.value ?? "null");
    if (v && typeof v.n === "number" && typeof v.since === "number" && now - v.since < FAIL_WINDOW_MS) fails = v;
  } catch {}
  if (fails.n >= FAIL_LIMIT) {
    const min = Math.ceil((fails.since + FAIL_WINDOW_MS - now) / 60_000);
    return `비밀번호를 너무 여러 번 틀렸습니다. ${min}분 뒤에 다시 시도하세요.`;
  }
  // 무차별 대입을 늦추기 위한 짧은 지연
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPassword(pw)) {
    await setSettings(db, { [key]: JSON.stringify({ n: fails.n + 1, since: fails.since }) }).catch(() => {});
    return "비밀번호가 올바르지 않습니다.";
  }
  if (fails.n) await db.from("settings").delete().eq("key", key);
  (await cookies()).set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
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

/** 베스트 댓글 선정 저장 (최대 2개, 서로 다른 사람, 개인정보·욕설 댓글 불가) */
export async function setAwardPicks(messageIds: string[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const ids = [...new Set(messageIds)];
  if (ids.length > AWARD_MAX) return { ok: false, error: `베스트 댓글은 ${AWARD_MAX}개까지 고를 수 있습니다.` };
  const db = adminClient();
  try {
    if (ids.length) {
      const { data, error } = await db.from("chat_messages").select("id, channel_id, display_name, message, author_role").in("id", ids);
      if (error) throw new Error(error.message);
      if ((data ?? []).length !== ids.length) return { ok: false, error: "댓글을 찾을 수 없습니다. 새로고침 후 다시 고르세요." };
      if (new Set(data!.map((m) => m.channel_id)).size !== ids.length) return { ok: false, error: "같은 사람의 댓글을 두 개 고를 수 없습니다." };
      if (data!.some((m) => m.author_role !== "viewer")) return { ok: false, error: "운영진·모더레이터 댓글은 고를 수 없습니다." };
      const unsafeText = (s: string) => containsPII(s) || containsProfanity(s);
      if (data!.some((m) => unsafeText(m.message as string) || unsafeText(m.display_name as string))) {
        return { ok: false, error: "개인정보나 욕설이 들어간 댓글·닉네임은 방송 화면에 띄울 수 없습니다." };
      }
      const { data: ex, error: exErr } = await db
        .from("participants")
        .select("channel_id, excluded_reason")
        .in("channel_id", data!.map((m) => m.channel_id as string))
        .eq("excluded", true)
        .in("excluded_reason", ["staff", "moderator", "bad_nickname"]);
      if (exErr) throw new Error(exErr.message);
      if (ex?.length) return { ok: false, error: "운영진이거나 닉네임에 문제가 있는 참여자는 고를 수 없습니다." };
    }
    await setSettings(db, { [AWARD_KEY]: JSON.stringify(ids) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    refresh();
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
      // 공개 버킷이라 파일도 지운다 (제외를 풀면 '재생성'으로 다시 만든다)
      await removeCharacterImages(db, [channelId]).catch((e) => {
        throw new Error(`캐릭터는 숨겼지만 이미지 파일 삭제에 실패했습니다. 다시 시도하세요: ${(e as Error).message}`);
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    refresh();
  }
}
