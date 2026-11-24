"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 flex max-w-sm flex-col gap-3 card p-6">
      <label htmlFor="password" className="font-semibold">운영자 비밀번호</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="rounded-lg border border-line bg-ink px-3 py-2 text-paper outline-none focus:border-ink"
      />
      {error && <p className="text-sm text-coral">{error}</p>}
      <button disabled={pending} className="rounded-lg bg-lime px-4 py-2 font-semibold text-ink disabled:opacity-50">
        {pending ? "확인 중…" : "들어가기"}
      </button>
    </form>
  );
}
