"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  BuyerVerdict,
  SeasonalAnalysis,
  SeasonalMonth,
} from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import {
  compactMoney,
  formatMonthYear,
  formatNumber,
  formatPercent,
} from "./format";

interface BestTimeToBuyProps {
  data: SeasonalAnalysis;
  locale: Locale;
}

/**
 * Green and red are load-bearing here and nowhere else on this page: on the
 * calendar they mean "conditions favour you" and "conditions favour the
 * seller", which is exactly the meaning the rest of the app already gives
 * them. Every other visualisation on the page stays monochrome so this one
 * reads at a glance.
 */
function verdictTone(verdict: BuyerVerdict) {
  switch (verdict) {
    case "great":
      return { background: "var(--viz-buy-great)", color: "var(--positive)" };
    case "good":
      return { background: "var(--viz-buy-good)", color: "var(--positive)" };
    case "normal":
      return {
        background: "var(--viz-buy-neutral)",
        color: "var(--ink-muted)",
      };
    case "expensive":
      return {
        background: "var(--viz-buy-expensive)",
        color: "var(--negative)",
      };
  }
}

function ConfidenceChip({
  confidence,
  label,
}: {
  confidence: SeasonalAnalysis["confidence"];
  label: string;
}) {
  const filled =
    confidence === "high" ? 3 : confidence === "medium" ? 2 : confidence === "low" ? 1 : 0;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
      <span aria-hidden="true" className="flex items-end gap-[2px]">
        {[3, 5, 7].map((height, index) => (
          <span
            className="w-[3px] rounded-full"
            key={height}
            style={{
              height,
              backgroundColor:
                index < filled ? "var(--accent)" : "var(--border-strong)",
            }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function MonthDetail({
  month,
  locale,
  isRated,
}: {
  month: SeasonalMonth;
  locale: Locale;
  isRated: boolean;
}) {
  const copy = analysisCopy[locale].timing;

  if (month.observationCount === 0) {
    return (
      <div className="flex min-h-[9rem] flex-col justify-center">
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
          {copy.noData}
        </p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-muted">
          {copy.noDataHint}
        </p>
      </div>
    );
  }

  const stats: { label: string; value: string }[] = [
    {
      label: copy.medianPrice,
      value:
        month.medianPrice === null
          ? "–"
          : compactMoney(month.medianPrice, locale, true),
    },
    {
      label: copy.vsBaseline,
      value:
        month.relativePricePercent === null
          ? "–"
          : formatPercent(month.relativePricePercent, locale),
    },
    {
      label: copy.inventory,
      value: formatNumber(month.listingCount, locale),
    },
    {
      label: copy.listingAge,
      value:
        month.medianListingAgeDays === null
          ? "–"
          : copy.days(formatNumber(month.medianListingAgeDays, locale)),
    },
    {
      label: copy.reductions,
      value:
        month.priceReductionRate === null
          ? "–"
          : // Early on, a real but tiny share of cuts would round to a flat
            // "0.0%" and read as "none observed". The precision follows the
            // magnitude so a non-zero rate always shows as non-zero.
            `${(month.priceReductionRate * 100).toFixed(
              month.priceReductionRate > 0 && month.priceReductionRate < 0.001
                ? 2
                : 1,
            )}${locale === "en" ? "%" : " %"}`,
    },
    {
      label: copy.observations,
      value: formatNumber(month.observationCount, locale),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p
          className="text-xl font-semibold tracking-[-0.03em]"
          style={{
            color:
              isRated && month.verdict
                ? verdictTone(month.verdict).color
                : "var(--ink)",
          }}
        >
          {isRated && month.verdict
            ? copy.verdicts[month.verdict]
            : copy.months[month.month - 1]}
        </p>
        {isRated && month.buyerScore !== null ? (
          <p className="text-xs font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            {copy.buyerScore}{" "}
            <span className="text-[15px] tabular-nums tracking-normal text-ink">
              {month.buyerScore}
            </span>
          </p>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[11px] text-ink-subtle">{stat.label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {isRated && month.components.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
            {copy.whyThisRating}
          </p>
          <ul className="mt-3 space-y-2.5">
            {month.components.map((component) => {
              const positive = component.contribution > 0;
              const width = Math.min(100, Math.abs(component.contribution) * 4);
              return (
                <li
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1"
                  key={component.key}
                >
                  <span className="text-xs text-ink-muted">
                    {copy.components[component.key]}
                  </span>
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{
                      color: positive ? "var(--positive)" : "var(--negative)",
                    }}
                  >
                    {positive ? "+" : "−"}
                    {Math.abs(component.contribution).toFixed(1)}
                  </span>
                  {/* Contributions run both ways from a shared centre line, so
                      the direction of a signal is readable without reading the
                      number next to it. */}
                  <span
                    aria-hidden="true"
                    className="col-span-2 relative h-1 rounded-full bg-surface-muted"
                  >
                    <span
                      className="absolute top-0 h-1 rounded-full transition-[width] duration-300"
                      style={{
                        width: `${width / 2}%`,
                        left: positive ? "50%" : undefined,
                        right: positive ? undefined : "50%",
                        backgroundColor: positive
                          ? "var(--positive)"
                          : "var(--negative)",
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function BestTimeToBuy({ data, locale }: BestTimeToBuyProps) {
  const copy = analysisCopy[locale].timing;
  const observedMonths = data.months.filter(
    (month) => month.observationCount > 0,
  );
  const isRated = data.scoredMonthCount > 0;
  const [selectedMonth, setSelectedMonth] = useState<number>(
    () => observedMonths[0]?.month ?? new Date().getMonth() + 1,
  );
  const panelId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedTileRef = useRef<HTMLButtonElement>(null);

  // The strip scrolls horizontally on narrow screens and always starts at
  // January, so early on — when only a month or two has been observed — the
  // only tile with data would sit off-screen behind an empty year.
  useEffect(() => {
    const strip = stripRef.current;
    const tile = selectedTileRef.current;
    if (!strip || !tile) return;
    if (strip.scrollWidth <= strip.clientWidth) return;

    strip.scrollTo({
      left: Math.max(
        0,
        tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2,
      ),
      behavior: "smooth",
    });
    // Only on first paint: re-running on every selection would yank the strip
    // around under the reader's finger as they tap through months.
  }, []);

  const selected =
    data.months.find((month) => month.month === selectedMonth) ?? data.months[0];

  if (observedMonths.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-base font-semibold tracking-[-0.02em] text-ink">
          {copy.emptyTitle}
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
          {copy.emptyBody}
        </p>
      </div>
    );
  }

  if (!data.isSeasonal) {
    const recentStats = [
      {
        label: copy.inventory,
        value: formatNumber(selected.listingCount, locale),
      },
      {
        label: copy.listingAge,
        value:
          selected.medianListingAgeDays === null
            ? "–"
            : copy.days(formatNumber(selected.medianListingAgeDays, locale)),
      },
      {
        label: copy.reductions,
        value:
          selected.priceReductionRate === null
            ? "–"
            : `${(selected.priceReductionRate * 100).toFixed(1)}${locale === "en" ? "%" : " %"}`,
      },
      {
        label: copy.observations,
        value: formatNumber(selected.observationCount, locale),
      },
    ];

    return (
      <div>
        <div className="rounded-2xl border border-border bg-surface-subtle p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {copy.months[selected.month - 1]}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink">
                {selected.medianPrice === null
                  ? "–"
                  : compactMoney(selected.medianPrice, locale, true)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{copy.medianPrice}</p>
            </div>
            <p className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-ink-muted">
              {copy.coverage(data.coveredMonthCount)}
            </p>
          </div>

          <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" ref={stripRef}>
            <div className="relative min-w-[42rem] px-2">
              <span className="absolute left-[4.3%] right-[4.3%] top-[7px] h-px bg-border-strong" />
              <div className="relative grid grid-cols-12" role="tablist" aria-label={copy.selectMonth}>
                {data.months.map((month) => {
                  const hasData = month.observationCount > 0;
                  const isSelected = month.month === selectedMonth;
                  return (
                    <button
                      aria-controls={panelId}
                      aria-selected={isSelected}
                      className="group flex flex-col items-center gap-2 text-[10px] font-medium text-ink-subtle disabled:cursor-default"
                      disabled={!hasData}
                      id={`${panelId}-tab-${month.month}`}
                      key={month.month}
                      onClick={() => setSelectedMonth(month.month)}
                      ref={isSelected ? selectedTileRef : undefined}
                      role="tab"
                      tabIndex={isSelected ? 0 : -1}
                      type="button"
                    >
                      <span
                        className={`relative z-10 block rounded-full border-2 border-surface transition ${
                          isSelected
                            ? "size-4 bg-accent ring-2 ring-accent/20"
                            : hasData
                              ? "mt-0.5 size-3 bg-accent"
                              : "mt-0.5 size-3 bg-border-strong"
                        }`}
                      />
                      <span className={isSelected ? "font-semibold text-ink" : ""}>
                        {copy.monthsShort[month.month - 1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <dl
            aria-labelledby={`${panelId}-tab-${selectedMonth}`}
            className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border pt-4 sm:grid-cols-4"
            id={panelId}
            role="tabpanel"
          >
            {recentStats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-[10px] text-ink-subtle">{stat.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-muted">
          {copy.disclaimer}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* The strip scrolls rather than shrinks on narrow screens: twelve tiles
          squeezed into 360px would lose the colour blocks that make it
          readable in a glance, which is the entire point of the section. */}
      <div
        className="-mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0"
        ref={stripRef}
      >
        <div
          className="grid min-w-[42rem] grid-cols-12 gap-1.5"
          role="tablist"
          aria-label={copy.selectMonth}
        >
          {data.months.map((month) => {
            const hasData = month.observationCount > 0;
            const rated = isRated && month.verdict !== null;
            const tone = rated ? verdictTone(month.verdict!) : null;
            const isSelected = month.month === selectedMonth;

            return (
              <button
                aria-controls={panelId}
                aria-selected={isSelected}
                id={`${panelId}-tab-${month.month}`}
                tabIndex={isSelected ? 0 : -1}
                className={`flex h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border transition duration-200 ${
                  isSelected
                    ? "border-ink/25 ring-2 ring-accent/20"
                    : hasData
                      ? "border-transparent hover:border-border-strong"
                      : "border-dashed border-border hover:border-border-strong"
                }`}
                key={month.month}
                onClick={() => setSelectedMonth(month.month)}
                ref={isSelected ? selectedTileRef : undefined}
                role="tab"
                style={{
                  backgroundColor: tone
                    ? tone.background
                    : hasData
                      ? "var(--surface-muted)"
                      : "transparent",
                }}
                type="button"
              >
                <span
                  className={`text-xs font-semibold ${hasData ? "text-ink" : "text-ink-subtle"}`}
                >
                  {copy.monthsShort[month.month - 1]}
                </span>
                {rated && month.relativePricePercent !== null ? (
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: tone!.color }}
                  >
                    {formatPercent(month.relativePricePercent, locale, 0)}
                  </span>
                ) : hasData ? (
                  <span className="text-[11px] tabular-nums text-ink-subtle">
                    {formatNumber(month.listingCount, locale)}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-[3px] w-4 rounded-full bg-border-strong"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isRated ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-subtle">
          {(
            [
              ["good", "var(--positive)"],
              ["neutral", "var(--border-strong)"],
              ["bad", "var(--negative)"],
            ] as const
          ).map(([key, color]) => (
            <span className="flex items-center gap-1.5" key={key}>
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {copy.legend[key]}
            </span>
          ))}
        </div>
      ) : null}

      <div
        aria-labelledby={`${panelId}-tab-${selectedMonth}`}
        className="mt-5 rounded-2xl border border-border bg-surface-subtle p-5 sm:p-6"
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        <MonthDetail isRated={isRated} locale={locale} month={selected} />
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-muted">
        {copy.disclaimer}
      </p>
    </div>
  );
}

/** The module header's right-hand side: how much history this rests on. */
export function SeasonalCoverage({
  data,
  locale,
}: {
  data: SeasonalAnalysis;
  locale: Locale;
}) {
  const copy = analysisCopy[locale].timing;

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <ConfidenceChip
        confidence={data.confidence}
        label={copy.confidence[data.confidence]}
      />
      <span className="text-[11px] text-ink-subtle">
        {copy.coverage(data.coveredMonthCount)}
        {data.earliestObservationAt
          ? ` · ${copy.since(formatMonthYear(data.earliestObservationAt, locale))}`
          : ""}
      </span>
    </span>
  );
}
