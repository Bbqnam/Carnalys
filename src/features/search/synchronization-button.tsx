"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { synchronizeLatestListings, type ManualSynchronizationState } from "@/app/actions";
import type { SynchronizationStatus } from "@/application/ingestion/synchronization-status";
import type { Locale } from "./copy";
import { RefreshIcon } from "./icons";

const initialState: ManualSynchronizationState = { outcome: "idle" };
const autoDismissMilliseconds = 6_000;
const progressPollMilliseconds = 3_000;
const maximumPollMilliseconds = 6 * 60 * 1_000;

type FinishedUpdate = {
  runId: string;
  status: Exclude<SynchronizationStatus, { outcome: "running" }> | { outcome: "unavailable" };
};

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
    runId: string;
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
  const [progress, setProgress] = useState<{ runId: string; fetchedCount: number }>();
  const [finishedUpdate, setFinishedUpdate] = useState<FinishedUpdate>();
  const runId = state.runId ?? activeSynchronization?.runId;
  const isBusy = Boolean(runId && finishedUpdate?.runId !== runId);

  useEffect(() => {
    if (!runId || !isBusy) return;
    let controller: AbortController | undefined;
    let cancelled = false;
    const deadline = Date.now() + maximumPollMilliseconds;
    let timeout: ReturnType<typeof setTimeout>;

    async function poll(id: string) {
      controller = new AbortController();
      const requestTimeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(`/api/sync-status?runId=${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Sync status returned ${response.status}`);
        const status: SynchronizationStatus = await response.json();
        if (cancelled) return;

        if (status.outcome !== "running") {
          setFinishedUpdate({ runId: id, status });
          router.refresh();
          return;
        }
        setProgress({ runId: id, fetchedCount: status.fetchedCount });
      } catch {
        if (cancelled) return;
      } finally {
        clearTimeout(requestTimeout);
      }

      if (Date.now() >= deadline) {
        setFinishedUpdate({ runId: id, status: { outcome: "unavailable" } });
        return;
      }
      timeout = setTimeout(() => void poll(id), progressPollMilliseconds);
    }

    void poll(runId);
    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timeout);
    };
  }, [runId, isBusy, router]);

  const english = locale === "en";
  const label = pending
    ? english ? "Updating…" : "Uppdaterar…"
    : isBusy
      ? activeSynchronization?.mode === "reconciliation"
        ? english ? "Full sync running" : "Full synk körs"
        : english ? "Update running" : "Uppdatering körs"
      : english ? "Update listings" : "Uppdatera annonser";

  const status = !pending && finishedUpdate?.runId === runId ? finishedUpdate?.status : undefined;
  const actionMessage =
    status?.outcome === "completed"
      ? english
        ? `Done. ${status.createdCount} new and ${status.updatedCount} updated.`
        : `Klart. ${status.createdCount} nya och ${status.updatedCount} uppdaterade.`
      : status?.outcome === "warning"
        ? english
          ? "The catalogue was refreshed. Some sources or listings could not be fully updated."
          : "Katalogen uppdaterades. Vissa källor eller annonser kunde inte uppdateras helt."
        : status?.outcome === "unavailable"
          ? english ? "Could not confirm the update status." : "Kunde inte bekräfta uppdateringens status."
          : status?.outcome === "failed" || state.outcome === "failed"
            ? english ? "The update failed. Try again." : "Uppdateringen misslyckades. Försök igen."
            : isBusy
              ? english ? "The list refreshes when the update finishes." : "Listan uppdateras när synkroniseringen är klar."
              : state.outcome === "busy"
                ? english ? "An update just ran. Try again shortly." : "En uppdatering kördes nyss. Försök igen om en stund."
                : undefined;

  const fetchedCount = progress?.runId === runId
    ? progress?.fetchedCount
    : activeSynchronization?.fetchedCount;
  const progressLabel = isBusy && fetchedCount
    ? fetchedCount.toLocaleString(english ? "en-SE" : "sv-SE")
    : undefined;

  return (
    <div className="relative flex items-center gap-2">
      {progressLabel ? (
        <span className="hidden shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-ink-muted sm:inline">
          {progressLabel}
        </span>
      ) : null}
      <form action={formAction}>
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
