"use client";

import { useActionState } from "react";
import { updateUserAction, type UserFormState } from "../actions";

const initialState: UserFormState = {};
const fieldClass = "mt-2 h-11 w-full max-w-sm rounded-xl border border-border bg-surface-subtle px-3.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";

export function EditUserForm({ userId, username }: { userId: string; username: string }) {
  const [state, action, pending] = useActionState(updateUserAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <input name="userId" type="hidden" value={userId} />
      <label className="block text-sm font-semibold text-ink">
        Username
        <input autoComplete="off" className={fieldClass} defaultValue={username} maxLength={24} name="username" required type="text" />
      </label>
      <label className="block text-sm font-semibold text-ink">
        New password
        <input autoComplete="off" className={fieldClass} minLength={8} name="password" placeholder="Leave blank to keep the current password" type="text" />
      </label>
      <div className="flex items-center gap-3">
        <button
          className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.error ? <span className="text-sm text-negative">{state.error}</span> : null}
        {state.success ? <span className="text-sm font-medium text-positive">Saved</span> : null}
      </div>
    </form>
  );
}
