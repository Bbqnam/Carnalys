"use client";

import { useMemo, useState } from "react";
import type { ValueMap as ValueMapData } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatNumber } from "./format";
import { priceColor, quantileThresholds, rampSteps } from "./palette";

interface ValueMapProps {
  data: ValueMapData;
  locale: Locale;
}

export function ValueMap({ data, locale }: ValueMapProps) {
  const copy = analysisCopy[locale].valueMap;
  const [active, setActive] = useState<string | null>(null);

  const cellByKey = useMemo(
    () =>
      new Map(data.cells.map((cell) => [`${cell.yearKey}:${cell.bandKey}`, cell])),
    [data.cells],
  );

  /**
   * A single-hue bronze ramp, not a green-to-red one. Price level is not a
   * verdict — the cheapest cell is usually just the oldest, most-driven cars —
   * so this page reserves green and red for the buying-conditions calendar,
   * where they genuinely mean good and bad.
   */
  const thresholds = useMemo(
    () =>
      quantileThresholds(
        data.cells
          .filter((cell) => cell.listingCount >= data.minimumCellCount)
          .map((cell) => cell.medianPrice),
      ),
    [data.cells, data.minimumCellCount],
  );

  if (data.cells.length === 0 || data.yearGroups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-ink-muted">
        {copy.empty}
      </p>
    );
  }

  const bandLabel = (fromKm: number, toKm: number | null) => {
    const from = formatNumber(fromKm / 10, locale);
    if (toKm === null) return copy.plus(from);
    if (fromKm === 0) return copy.under(formatNumber(toKm / 10, locale));
    return `${from}–${formatNumber(toKm / 10, locale)}`;
  };

  return (
    <div>
      {/* The grid can outgrow a phone; scrolling it horizontally keeps the
          numbers at a readable size instead of shrinking them to fit. The
          year column stays pinned so a scrolled cell never loses its row. */}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-left">
          <caption className="sr-only">{copy.title}</caption>
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 bg-background pr-2 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle"
                scope="col"
              >
                {copy.yearHeader}
              </th>
              {data.bands.map((band) => (
                <th
                  className="px-1 pb-1 text-center text-[11px] font-semibold tabular-nums text-ink-muted"
                  key={band.key}
                  scope="col"
                >
                  {bandLabel(band.fromKm, band.toKm)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.yearGroups.map((group) => (
              <tr key={group.key}>
                <th
                  className="sticky left-0 z-10 whitespace-nowrap bg-background pr-3 text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-ink"
                  scope="row"
                >
                  {group.fromYear === group.toYear
                    ? group.fromYear
                    : `${group.fromYear}–${group.toYear}`}
                </th>
                {data.bands.map((band) => {
                  const key = `${group.key}:${band.key}`;
                  const cell = cellByKey.get(key);
                  const isSparse =
                    !cell || cell.listingCount < data.minimumCellCount;
                  const isLowConfidence =
                    cell &&
                    !isSparse &&
                    cell.listingCount < data.lowConfidenceThreshold;

                  return (
                    <td className="p-0" key={band.key}>
                      <button
                        aria-label={
                          cell
                            ? `${group.fromYear}–${group.toYear}, ${bandLabel(band.fromKm, band.toKm)}: ${
                                isSparse
                                  ? copy.tooFew
                                  : `${compactMoney(cell.medianPrice, locale, true)}, ${copy.cars(cell.listingCount)}`
                              }`
                            : copy.tooFew
                        }
                        // Every cell carries a hairline border. It is what makes
                        // the palest band distinguishable from the page, which
                        // is why the fill ramp can stay light enough for the
                        // theme's own ink to read on all five steps.
                        className={`flex h-11 w-full flex-col items-center justify-center rounded-lg border px-1 transition-colors duration-300 ${
                          active === key
                            ? "border-ink/40 ring-2 ring-accent/25"
                            : "border-border hover:border-border-strong"
                        } ${isSparse ? "text-ink-subtle" : "text-ink"}`}
                        onClick={() => setActive(active === key ? null : key)}
                        style={{
                          backgroundColor:
                            cell && !isSparse
                              ? priceColor(cell.medianPrice, thresholds)
                              : "var(--surface-muted)",
                        }}
                        type="button"
                      >
                        {cell && !isSparse ? (
                          <>
                            <span className="text-[13px] font-semibold tabular-nums tracking-[-0.01em]">
                              {compactMoney(cell.medianPrice, locale)}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-[10px] tabular-nums opacity-75">
                              {isLowConfidence ? (
                                <span
                                  aria-hidden="true"
                                  className="size-1 rounded-full bg-current"
                                />
                              ) : null}
                              {formatNumber(cell.listingCount, locale)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-[13px]">
                              –
                            </span>
                            {cell ? (
                              <span className="mt-0.5 text-[10px] tabular-nums">
                                {formatNumber(cell.listingCount, locale)}
                              </span>
                            ) : null}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-subtle">
        {/* The bands hold equal numbers of cells, not equal price intervals, so
            the legend states the real boundaries — otherwise the uneven widths
            would be invisible. */}
        {thresholds.length > 0 ? (
          <span className="flex items-center gap-2">
            <span className="tabular-nums">
              {compactMoney(thresholds[0], locale)}
            </span>
            <span aria-hidden="true" className="flex gap-0.5">
              {Array.from({ length: rampSteps }, (_, step) => (
                <span
                  className="h-2 w-5 rounded-[2px] border border-border"
                  key={step}
                  style={{ backgroundColor: `var(--viz-price-${step + 1})` }}
                />
              ))}
            </span>
            <span className="tabular-nums">
              {compactMoney(thresholds[thresholds.length - 1], locale)}
            </span>
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-current opacity-70"
          />
          {copy.lowConfidence}
        </span>
        <span>– {copy.tooFew}</span>
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted">
        {copy.caution}
      </p>
    </div>
  );
}
