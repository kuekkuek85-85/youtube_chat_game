"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 flex max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm">
      <label htmlFor="password" className="font-semibold">운영자 비밀번호</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="rounded-lg border border-ink/20 px-3 py-2 outline-none focus:border-ink"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 font-semibold text-lime disabled:opacity-50">
        {pending ? "확인 중…" : "들어가기"}
      </button>
    </form>
  );
}
