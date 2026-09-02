"use client";

import { useActionState } from "react";
import { resendDailyReportAction, type ResendReportState } from "./actions";

const initialState: ResendReportState = {};

export function ResendReportButton() {
  const [state, action, pending] = useActionState(resendDailyReportAction, initialState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Sending report…" : "Send this report by email"}
      </button>
      {state.success ? <span className="text-sm font-medium text-positive">Email sent</span> : null}
      {state.error ? <span className="text-sm font-medium text-negative">{state.error}</span> : null}
    </form>
  );
}
