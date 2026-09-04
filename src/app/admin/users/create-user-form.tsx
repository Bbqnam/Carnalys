"use client";

import { useActionState, useEffect, useRef } from "react";
import { createUserAction, type UserFormState } from "./actions";

const initialState: UserFormState = {};
const fieldClass = "mt-1 block h-10 w-40 rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <form action={action} className="flex flex-wrap items-end gap-2" ref={formRef}>
        <label className="text-xs font-semibold text-ink-muted">
          Username
          <input autoComplete="off" className={fieldClass} maxLength={24} name="username" required type="text" />
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Password
          <input autoComplete="off" className={fieldClass} minLength={8} name="password" required type="text" />
        </label>
        <button
          className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Creating…" : "Create user"}
        </button>
      </form>
      {state.error ? <span className="text-xs text-negative">{state.error}</span> : null}
      {state.success ? <span className="text-xs font-medium text-positive">User created</span> : null}
    </div>
  );
}
