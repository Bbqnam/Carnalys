"use client";

import type { MarketEstimate, ValueRelationships } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { formatNumber, formatPercent, formatSignedMoney } from "./format";

interface ValueRelationshipsSectionProps {
  data: ValueRelationships;
  locale: Locale;
}

/**
 * These figures stay in plain ink. Green and red are reserved on this page for
 * the buying-conditions calendar, where they mean favourable and unfavourable
 * — and here they would say the opposite of what a reader expects: a newer car
 * costing more is not "good", and a private seller asking less is not "bad".
 * The sign carries the direction perfectly well on its own.
 */
function EstimateRow({
  label,
  estimate,
  locale,
}: {
  label: string;
  estimate: MarketEstimate;
  locale: Locale;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
          {formatSignedMoney(estimate.amount, locale)}
        </span>
        <span className="w-14 text-right text-xs text-ink-subtle">
          {formatPercent(estimate.percent, locale)}
        </span>
      </span>
    </div>
  );
}

export function ValueRelationshipsSection({
  data,
  locale,
}: ValueRelationshipsSectionProps) {
  const copy = analysisCopy[locale].relationships;

  if (!data.available) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm font-semibold text-ink">{copy.unavailable}</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-muted">
          {copy.unavailableBody}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* The equivalence leads because it is the number that settles the actual
          decision — a newer car with more miles, or an older one with fewer.
          The coefficients below it are the workings. */}
      {data.yearMileageEquivalentMil ? (
        <div className="mb-4">
          <p className="text-[11px] text-ink-muted">{copy.equivalence}</p>
          <p className="mt-0.5 text-[1.9rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-ink">
            {copy.equivalenceUnit(
              formatNumber(data.yearMileageEquivalentMil, locale),
            )}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
            {copy.equivalenceHelp}
          </p>
        </div>
      ) : null}

      <div>
        {data.perModelYear ? (
          <EstimateRow
            estimate={data.perModelYear}
            label={copy.perYear}
            locale={locale}
          />
        ) : null}
        {data.perThousandMil ? (
          <EstimateRow
            estimate={data.perThousandMil}
            label={copy.perMileage}
            locale={locale}
          />
        ) : null}
        {data.privateSellerGap ? (
          <EstimateRow
            estimate={data.privateSellerGap}
            label={copy.sellerGap}
            locale={locale}
          />
        ) : null}

        {/* The methodology used to sit behind a disclosure toggle here; it now
            lives in the module's ⓘ, so this line carries only what qualifies
            the numbers directly above it. */}
        <p className="border-t border-border pt-3 text-[10px] leading-relaxed text-ink-subtle">
          {copy.estimateLabel} ·{" "}
          {copy.basis(
            formatNumber(data.observationCount, locale),
            data.modelCount,
          )}{" "}
          · {copy.fit(Math.round(data.rSquared * 100))}
        </p>
      </div>
    </div>
  );
}
