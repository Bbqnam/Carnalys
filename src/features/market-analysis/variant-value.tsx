"use client";

import type { VariantValueRanking } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatNumber, formatPercent } from "./format";

interface VariantValueProps {
  data: VariantValueRanking;
  locale: Locale;
}

/**
 * The page's answer to "which version should I buy". Each version is shown
 * against what its own model year and mileage predict, so a cheap-looking base
 * trim full of old cars doesn't automatically top the list — the bar measures
 * value, not price.
 */
export function VariantValue({ data, locale }: VariantValueProps) {
  const copy = analysisCopy[locale].variants;

  if (data.variants.length === 0) {
    return <p className="text-xs text-ink-muted">{copy.empty}</p>;
  }

  const widest = Math.max(
    ...data.variants.map((variant) => Math.abs(variant.valuePercent)),
    1,
  );

  return (
    // The ranking is long and open-ended, so it scrolls inside the module
    // rather than setting the height of the row it shares with the value map.
    // On a phone there is no row to match, so it falls back to a fixed frame.
    <div className="flex h-full min-h-0 flex-col">
      {/* The bottom edge fades rather than cutting, so it is obvious the
          ranking continues past the frame. */}
      <ol className="min-h-0 max-h-[26rem] flex-1 space-y-2 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.75rem),transparent)]">
        {data.variants.map((variant) => {
          const isBargain = variant.valuePercent < 0;
          const width = (Math.abs(variant.valuePercent) / widest) * 50;

          return (
            <li key={variant.variant}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {variant.variant}
                </span>
                <span
                  className="shrink-0 text-[13px] font-semibold tabular-nums"
                  style={{
                    color: isBargain ? "var(--positive)" : "var(--negative)",
                  }}
                >
                  {formatPercent(variant.valuePercent, locale, 0)}
                </span>
              </div>
              {/* Bars run out from a shared centre line, so "cheaper than
                  predicted" and "dearer than predicted" are separated by
                  direction as well as by colour. */}
              <div className="mt-1 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="relative h-1.5 flex-1 rounded-full bg-surface-muted"
                >
                  <span
                    className="absolute top-0 h-1.5 rounded-full transition-[width] duration-500"
                    style={{
                      width: `${width}%`,
                      left: isBargain ? undefined : "50%",
                      right: isBargain ? "50%" : undefined,
                      backgroundColor: isBargain
                        ? "var(--positive)"
                        : "var(--negative)",
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-0 h-1.5 w-px bg-border-strong"
                  />
                </span>
                <span className="w-[6.5rem] shrink-0 text-right text-[10px] tabular-nums text-ink-subtle">
                  {compactMoney(variant.medianPrice, locale)} ·{" "}
                  {formatNumber(variant.listingCount, locale)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
