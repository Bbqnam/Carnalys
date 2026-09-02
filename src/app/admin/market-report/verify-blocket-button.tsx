"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { verifyBlocketNowAction, type VerifyBlocketState } from "./actions";

const initialState: VerifyBlocketState = {};

export function VerifyBlocketButton() {
  const router = useRouter();
  const [state, action, pending] = useActionState(verifyBlocketNowAction, initialState);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Checking Blocket…" : "Check 300 Blocket listings now"}
      </button>
      {state.success ? <span className="text-sm text-positive">Checked {state.checked}; {state.missing} missing; {state.inconclusive} inconclusive</span> : null}
      {state.error ? <span className="text-sm text-negative">{state.error}</span> : null}
    </form>
  );
}
