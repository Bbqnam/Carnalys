"use client";

import { useActionState, useState } from "react";
import { createTestUserAction, type CreateTestUserState } from "./actions";

const initialState: CreateTestUserState = {};

export function CreateTestUserButton() {
  const [state, action, pending] = useActionState(createTestUserAction, initialState);
  const [dismissedFor, setDismissedFor] = useState<string | undefined>(undefined);
  const credentials = state.username && state.password && state.username !== dismissedFor ? state : null;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <form action={action}>
        <button
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Creating…" : "Create quick test user"}
        </button>
      </form>
      {state.error ? <span className="text-xs text-negative">{state.error}</span> : null}
      {credentials ? (
        <div className="w-full max-w-xs rounded-xl border border-accent/30 bg-accent-soft p-3.5 text-xs leading-5 text-ink sm:text-right">
          <p className="font-semibold text-accent-strong">Shown once — save it now</p>
          <p className="mt-1.5 font-mono text-[13px]">{credentials.username}</p>
          <p className="font-mono text-[13px]">{credentials.password}</p>
          <button
            className="mt-2 text-[11px] font-semibold text-ink-muted underline decoration-border-strong underline-offset-2 hover:text-ink"
            onClick={() => setDismissedFor(credentials.username)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
