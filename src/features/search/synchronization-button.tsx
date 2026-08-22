"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
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
      className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-64 rounded-xl border border-[#dfe4de] bg-white px-3 py-2.5 text-xs leading-5 text-[#526058] shadow-[0_10px_30px_rgba(24,36,28,0.12)]"
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
  const [state, action, pending] = useActionState(
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

  useEffect(() => {
    if (state.outcome === "completed" || state.outcome === "warning") {
      router.refresh();
    }
    if (state.outcome === "busy" || state.outcome === "completed" || pending) {
      getSynchronizationProgress().then(setProgress);
    }
  }, [state, pending, router]);

  useEffect(() => {
    if (!progress) return;
    const interval = setInterval(async () => {
      const next = await getSynchronizationProgress();
      setProgress(next);
      if (!next) router.refresh();
    }, progressPollMilliseconds);
    return () => clearInterval(interval);
  }, [progress, router]);

  const english = locale === "en";
  const initiallyBusy = Boolean(activeSynchronization);
  const isBusy = initiallyBusy || Boolean(progress);
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
    state.outcome === "completed"
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
        <span className="hidden shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-[#737b75] sm:inline">
          {progressLabel}
        </span>
      ) : null}
      <form action={action}>
        <button
          aria-describedby={
            actionMessage && !pending ? "synchronization-status" : undefined
          }
          aria-label={label}
          className="flex h-11 items-center gap-2 rounded-xl border border-[#d6ddd7] bg-[#f3f7f4] px-3.5 text-sm font-semibold text-[#315441] shadow-sm transition hover:border-[#aebeb3] hover:bg-white hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-65"
          disabled={pending || isBusy}
          type="submit"
        >
          <RefreshIcon className={`size-4 ${pending || isBusy ? "animate-spin" : ""}`} />
          <span className="hidden xl:inline">{label}</span>
          <span className="xl:hidden" aria-hidden="true">
            {pending ? "…" : ""}
          </span>
          <span className="sr-only xl:hidden">{label}</span>
        </button>
      </form>
      {actionMessage && !pending ? (
        <SynchronizationStatusMessage key={actionMessage} message={actionMessage} />
      ) : null}
    </div>
  );
}
