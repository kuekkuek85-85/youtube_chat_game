import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "gift_admin";
/** 로그인 유지 시간. 방송 하루를 넉넉히 덮는다. */
export const SESSION_HOURS = 12;

function secret(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) throw new Error("ADMIN_PASSWORD 환경변수를 8자 이상으로 설정하세요.");
  return pw;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`gift-admin-session-v2.${payload}`).digest("hex");
}

/** 길이가 달라도 일정한 시간에 비교 (두 값을 해시해서 길이를 맞춘다) */
function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y) && a === b;
}

/**
 * 세션 쿠키 값: "만료시각.난수.서명". 비밀번호는 넣지 않는다.
 * 만료가 지나면 무효, 비밀번호를 바꾸면 기존 쿠키는 모두 무효.
 */
export function sessionToken(now = Date.now()): string {
  const payload = `${now + SESSION_HOURS * 3600_000}.${randomBytes(12).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i);
  const exp = Number(payload.split(".")[0]);
  if (!Number.isFinite(exp) || exp < now) return false;
  return safeEqual(value.slice(i + 1), sign(payload));
}

export function checkPassword(input: string): boolean {
  return safeEqual(input, secret());
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  await connection(); // 만료 검사에 현재 시각을 쓰므로 요청 시점에만 판단한다
  return verifySession(value);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("관리자 로그인이 필요합니다.");
}
