"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  getSynchronizationProgress,
  synchronizeLatestListings,
  type ManualSynchronizationState,
  type SynchronizationProgress,
} from "@/app/actions";
import type { Locale } from "./copy";
import { RefreshIcon } from "./icons";

const initialState: ManualSynchronizationState = { outcome: "idle" };
const autoDismissMilliseconds = 6_000;
const progressPollMilliseconds = 3_000;

function SynchronizationStatusMessage({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDismissed(true), autoDismissMilliseconds);
    return () => clearTimeout(timeout);
  }, []);

  if (dismissed) return null;

  return (
    <p
      aria-live="polite"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-64 rounded-xl border border-border bg-surface px-3 py-2.5 text-xs leading-5 text-ink-muted shadow-[0_10px_30px_rgba(24,36,28,0.12)]"
      id="synchronization-status"
    >
      {message}
    </p>
  );
}

interface SynchronizationButtonProps {
  activeSynchronization?: {
    mode: string;
    fetchedCount: number;
  };
  locale: Locale;
}

export function SynchronizationButton({
  activeSynchronization,
  locale,
}: SynchronizationButtonProps) {
  const [state, formAction, pending] = useActionState(
    synchronizeLatestListings,
    initialState,
  );
  const router = useRouter();
  const [progress, setProgress] = useState<SynchronizationProgress | undefined>(
    activeSynchronization
      ? {
          mode: activeSynchronization.mode,
          phase: "",
          fetchedCount: activeSynchronization.fetchedCount,
          pagesProcessed: 0,
          totalListings: 0,
        }
      : undefined,
  );
  // The sweep runs after the response, so the button can't learn it finished
  // from the action result — it polls the sync lock instead. `syncActive` keeps
  // the button in its running state from the click until polling sees the lock
  // clear (tolerating a few empty polls while the background job starts up).
  const [syncActive, setSyncActive] = useState(Boolean(activeSynchronization));
  const emptyPolls = useRef(0);

  const action = () => {
    setSyncActive(true);
    emptyPolls.current = 0;
    formAction();
  };

  useEffect(() => {
    if (!syncActive && !progress) return;
    const interval = setInterval(async () => {
      const next = await getSynchronizationProgress();
      if (next) {
        emptyPolls.current = 0;
        setProgress(next);
        return;
      }
      // The background sweep can take a few seconds to register its lock;
      // only conclude it finished after several consecutive empty polls.
      emptyPolls.current += 1;
      if (emptyPolls.current >= 3) {
        setSyncActive(false);
        setProgress(undefined);
        router.refresh();
      }
    }, progressPollMilliseconds);
    return () => clearInterval(interval);
  }, [syncActive, progress, router]);

  const english = locale === "en";
  const isBusy = syncActive || Boolean(progress);
  const label = pending
    ? english
      ? "Updating…"
      : "Uppdaterar…"
    : isBusy
      ? progress?.mode === "reconciliation"
        ? english
          ? "Full sync running"
          : "Full synk körs"
        : english
          ? "Update running"
          : "Uppdatering körs"
      : english
        ? "Update listings"
        : "Uppdatera annonser";

  const actionMessage =
    state.outcome === "started"
      ? english
        ? "Update started — the list refreshes when it finishes."
        : "Uppdatering startad — listan uppdateras när den är klar."
      : state.outcome === "completed"
      ? english
        ? `Done: ${state.createdCount ?? 0} new and ${state.updatedCount ?? 0} updated.`
        : `Klart: ${state.createdCount ?? 0} nya och ${state.updatedCount ?? 0} uppdaterade.`
      : state.outcome === "warning"
        ? english
          ? `Updated, but ${state.failedCount ?? 0} ads could not be read.`
          : `Uppdaterat, men ${state.failedCount ?? 0} annonser kunde inte läsas.`
        : state.outcome === "busy"
          ? english
            ? "Another synchronization is already running."
            : "En annan synkronisering körs redan."
          : state.outcome === "unauthorized"
            ? english
              ? "Sign in to update listings."
              : "Logga in för att uppdatera annonser."
            : state.outcome === "failed"
              ? english
                ? "The update failed. Existing listings are unchanged."
                : "Uppdateringen misslyckades. Befintliga annonser är kvar."
              : undefined;

  const progressLabel =
    progress && progress.totalListings > 0
      ? `${progress.fetchedCount.toLocaleString(english ? "en-SE" : "sv-SE")} / ${progress.totalListings.toLocaleString(english ? "en-SE" : "sv-SE")}`
      : progress
        ? progress.fetchedCount.toLocaleString(english ? "en-SE" : "sv-SE")
        : undefined;

  return (
    <div className="relative flex items-center gap-2">
      {progressLabel ? (
        <span className="hidden shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-ink-muted sm:inline">
          {progressLabel}
        </span>
      ) : null}
      <form action={action}>
        <button
          aria-describedby={
            actionMessage && !pending ? "synchronization-status" : undefined
          }
          aria-label={label}
          className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-muted px-3.5 text-sm font-semibold text-accent-strong shadow-sm transition hover:border-border-strong hover:bg-surface hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-65"
          disabled={pending || isBusy}
          type="submit"
        >
          <RefreshIcon className={`size-4 ${pending || isBusy ? "animate-spin" : ""}`} />
          {/* The label used to disappear below xl, leaving a bare circle in a row
              where the sort and page-size controls beside it stay labelled — the
              one control whose purpose could not be guessed from its shape. It
              keeps its words down to sm and only drops them where the row is
              genuinely out of room. */}
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden" aria-hidden="true">
            {pending ? "…" : ""}
          </span>
          <span className="sr-only sm:hidden">{label}</span>
        </button>
      </form>
      {actionMessage && !pending ? (
        <SynchronizationStatusMessage key={actionMessage} message={actionMessage} />
      ) : null}
    </div>
  );
}
