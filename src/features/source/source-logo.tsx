import { listingSource } from "@/infrastructure/marketplaces/source-registry";

export interface SourceLogoProps {
  provider: string;
  locale?: "sv" | "en";
  className?: string;
  interactive?: boolean;
}

/** Quiet provenance mark: one source wordmark, one accessible label, no
 * seller/dealer branding and no permanent explanatory text. */
export function SourceLogo({
  provider,
  locale = "sv",
  className = "",
  interactive = true,
}: SourceLogoProps) {
  const source = listingSource(provider);
  const label = locale === "en" ? `Listing from ${source.displayName}` : `Annons från ${source.displayName}`;
  const wordmark = source.logoKey === "blocket" ? "blocket" : source.logoKey === "wayke" ? "wayke" : source.displayName;
  return (
    <span
      aria-label={label}
      className={`group/source relative inline-flex h-7 max-w-24 items-center rounded-md bg-white/95 px-2.5 text-[11px] font-black leading-none tracking-[-0.025em] text-slate-800 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      tabIndex={interactive ? 0 : undefined}
    >
      <span aria-hidden="true" className={source.logoKey === "blocket" ? "text-[#e11d2e]" : "text-[#172554]"}>
        {wordmark}
      </span>
      <span className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-0 z-30 w-max translate-y-1 rounded-md bg-ink px-2 py-1 text-[10px] font-medium tracking-normal text-surface opacity-0 shadow-md transition group-hover/source:translate-y-0 group-hover/source:opacity-100 group-focus-visible/source:translate-y-0 group-focus-visible/source:opacity-100" role="tooltip">
        {label}
      </span>
    </span>
  );
}
