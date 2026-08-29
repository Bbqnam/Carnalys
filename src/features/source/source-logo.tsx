import Image, { type StaticImageData } from "next/image";
import blocketMark from "@/logos/sources/blocket.svg";
import bytbilMark from "@/logos/sources/bytbil.svg";
import hedinMark from "@/logos/sources/hedin.svg";
import waykeMark from "@/logos/sources/wayke.svg";
import { listingSource } from "@/infrastructure/marketplaces/source-registry";
import { sourceListingLabel } from "./source-label";

export interface SourceLogoProps {
  provider: string;
  locale?: "sv" | "en";
  className?: string;
  interactive?: boolean;
}

/** Official wordmark per source, keyed by the registry's `logoKey`. */
const sourceMarks: Record<string, StaticImageData> = {
  blocket: blocketMark,
  wayke: waykeMark,
  bytbil: bytbilMark,
  hedin: hedinMark,
};

/** Every source mark is drawn to the same optical box — a fixed height, and a
 *  width cap so a long wordmark can't crowd its row. `object-contain` keeps
 *  each logo's own proportions inside it. */
const MARK_HEIGHT = 13;
const MARK_MAX_WIDTH = 60;

/** A near-square lockup carries far less ink than a wide wordmark at the same
 *  height, so it reads as the odd one out in a row of them. Nudging its drawn
 *  height up evens out the visual weight; the width cap still contains it. */
const MARK_SCALE: Record<string, number> = { bytbil: 1.6 };

function Mark({
  provider,
  height = MARK_HEIGHT,
}: {
  provider: string;
  height?: number;
}) {
  const source = listingSource(provider);
  const mark = source.logoKey ? sourceMarks[source.logoKey] : undefined;
  if (!mark) {
    return (
      <span className="text-[10px] font-black uppercase leading-none tracking-[-0.02em] text-ink-muted">
        {source.displayName}
      </span>
    );
  }
  const drawnHeight = Math.round(height * (source.logoKey ? MARK_SCALE[source.logoKey] ?? 1 : 1));
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="w-auto max-w-full object-contain object-left"
      height={drawnHeight}
      src={mark}
      style={{ height: drawnHeight, maxWidth: MARK_MAX_WIDTH }}
      width={Math.round((drawnHeight * mark.width) / mark.height)}
    />
  );
}

/** Bare source wordmark — no chip, no box. For menus/lists that already have
 *  their own surface and (optional) text label. */
export function SourceMark({
  provider,
  className = "",
}: {
  provider: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex h-[13px] shrink-0 items-center ${className}`}>
      <Mark provider={provider} />
    </span>
  );
}

/**
 * Quiet provenance mark: the source's own wordmark, one accessible label, a
 * hover/focus tooltip, and nothing else — no chip, border or pill. A soft
 * shadow keeps it legible on a photo; on a plain surface it just reads as the
 * logo. Sources without bundled artwork show their display name instead.
 */
export function SourceLogo({
  provider,
  locale = "sv",
  className = "",
  interactive = true,
}: SourceLogoProps) {
  const source = listingSource(provider);
  const label = sourceListingLabel(source.displayName, locale);

  return (
    <span
      aria-label={label}
      className={`group/source relative inline-flex h-[15px] items-center [filter:drop-shadow(0_1px_1px_rgba(15,23,32,0.18))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      tabIndex={interactive ? 0 : undefined}
    >
      <Mark provider={provider} height={15} />
      <span
        className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-0 z-30 w-max translate-y-1 rounded-md bg-ink px-2 py-1 text-[10px] font-medium tracking-normal text-surface opacity-0 shadow-md transition group-hover/source:translate-y-0 group-hover/source:opacity-100 group-focus-visible/source:translate-y-0 group-focus-visible/source:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
