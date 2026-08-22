"use client";

import Image from "next/image";
import Link from "next/link";
import { uiCopy, type Locale } from "./copy";
import { CloseIcon, CompareIcon } from "./icons";
import type { ComparedVehicle } from "./use-compare";

interface CompareTrayContentProps {
  compared: readonly ComparedVehicle[];
  locale: Locale;
  onRemove: (id: string) => void;
  onClear: () => void;
}

function CompareThumbnail({ vehicle }: { vehicle: ComparedVehicle }) {
  return vehicle.imageUrl ? (
    <Image
      alt=""
      className="rounded-lg object-cover"
      height={44}
      src={vehicle.imageUrl}
      width={44}
    />
  ) : (
    <div className="size-11 shrink-0 rounded-lg bg-surface-muted" />
  );
}

/** The reusable panel content: header, vehicle list, and the "Compare" CTA — no positioning of its own. */
export function CompareTrayPanel({ compared, locale, onRemove, onClear }: CompareTrayContentProps) {
  const copy = uiCopy[locale];

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_8px_30px_rgba(26,35,29,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <CompareIcon className="size-4 text-accent" />
          {copy.compare.selectedCount(compared.length)}
        </span>
        <button
          className="text-xs font-medium text-ink-muted transition hover:text-ink"
          onClick={onClear}
          type="button"
        >
          {copy.compare.clearAll}
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {compared.map((vehicle) => (
          <div
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-2"
            key={vehicle.id}
          >
            <CompareThumbnail vehicle={vehicle} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {vehicle.make} {vehicle.model}
              </span>
              {vehicle.variant ? (
                <span className="block truncate text-xs text-ink-muted">{vehicle.variant}</span>
              ) : null}
            </span>
            <button
              aria-label={copy.compare.remove}
              className="grid size-7 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-muted hover:text-ink"
              onClick={() => onRemove(vehicle.id)}
              type="button"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-3 pt-0">
        <Link
          className="flex h-11 w-full items-center justify-center rounded-xl bg-ink text-sm font-semibold text-surface transition hover:opacity-90"
          href="/compare"
        >
          {copy.compare.viewComparison}
        </Link>
      </div>
    </div>
  );
}

/** Compact floating bar for narrow viewports, where a docked side panel has nowhere to go. */
export function CompareMobileBar({ compared, locale, onClear }: CompareTrayContentProps) {
  const copy = uiCopy[locale];

  if (compared.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 lg:hidden">
      <div className="flex items-center gap-3 rounded-full border border-border bg-surface/95 px-4 py-2.5 shadow-[0_18px_48px_rgba(26,35,29,0.16)] backdrop-blur-md">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <CompareIcon className="size-4 text-accent" />
          {copy.compare.selectedCount(compared.length)}
        </span>
        <button
          className="rounded-full px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:text-ink"
          onClick={onClear}
          type="button"
        >
          {copy.compare.clearAll}
        </button>
        <Link
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition hover:opacity-90"
          href="/compare"
        >
          {copy.compare.viewComparison}
        </Link>
      </div>
    </div>
  );
}

/**
 * Floating variant for pages with no filter panel to dock beside (saved,
 * vehicle detail): a sticky panel pinned to the left edge of the viewport
 * on desktop, falling back to CompareMobileBar on narrow viewports.
 */
export function CompareTray(props: CompareTrayContentProps) {
  if (props.compared.length === 0) return null;

  return (
    <>
      <div className="fixed left-4 top-24 z-30 hidden w-72 lg:block">
        <CompareTrayPanel {...props} />
      </div>
      <CompareMobileBar {...props} />
    </>
  );
}
