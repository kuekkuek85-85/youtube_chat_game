import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "gift_admin";

function secret(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) throw new Error("ADMIN_PASSWORD 환경변수를 8자 이상으로 설정하세요.");
  return pw;
}

/** 쿠키에는 비밀번호 대신 HMAC 값을 넣는다. 비밀번호를 바꾸면 기존 로그인은 모두 풀린다. */
export function sessionToken(): string {
  return createHmac("sha256", secret()).update("gift-admin-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(input: string): boolean {
  return safeEqual(input, secret());
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!value && safeEqual(value, sessionToken());
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("관리자 로그인이 필요합니다.");
}
