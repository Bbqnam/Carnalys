"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { verifyBlocketNowAction, type VerifyBlocketState } from "./actions";

const initialState: VerifyBlocketState = {};

const time = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  hour: "2-digit",
  minute: "2-digit",
});

export function VerifyBlocketButton() {
  const router = useRouter();
  const [state, action, pending] = useActionState(verifyBlocketNowAction, initialState);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  const result = state.result;
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <form action={action}>
        <button
          className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Checking Blocket…" : "Check Blocket listings now"}
        </button>
      </form>

      {result ? (
        <div className="max-w-sm text-right text-xs leading-5 text-ink-muted">
          <p className="text-ink">
            <span className="font-semibold text-positive">{result.missing}</span> missing
            <span className="text-ink-subtle"> · </span>
            {result.active} active
            <span className="text-ink-subtle"> · </span>
            {result.inconclusive} inconclusive
            <span className="text-ink-subtle"> · </span>
            {result.checked} checked
          </p>
          <p>
            {result.newlyRemoved} newly removed · {result.newDisappearances} disappearance
            {result.newDisappearances === 1 ? "" : "s"} recorded · {result.neverCheckedInSample} never
            checked before
          </p>
          <p>
            Listing age {result.newestListingAgeDays ?? "–"}–{result.oldestListingAgeDays ?? "–"} d
            (median {result.medianListingAgeDays ?? "–"} d) · {result.dealerListings} dealer /{" "}
            {result.privateListings} private · finished {time.format(new Date(result.completedAt))}
          </p>
          {result.sampleTooRecent || result.warnings.length ? (
            <ul className="mt-1.5 space-y-1 rounded-lg border border-[#ead59e] bg-[#fff8e5] px-3 py-2 text-left text-[#6f5520]">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {state.error ? <span className="text-right text-sm text-negative">{state.error}</span> : null}
    </div>
  );
}
