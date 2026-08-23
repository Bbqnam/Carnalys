"use client";

import type { EquipmentValue as EquipmentData } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { formatNumber, formatPercent } from "./format";

interface EquipmentValueProps {
  data: EquipmentData;
  locale: Locale;
}

/**
 * What the market charges for a given piece of equipment, against comparable
 * cars of the same model, year and mileage band.
 *
 * The copy says "associated with" rather than "adds", and that is not hedging:
 * options are not fitted at random, so a figure here carries both the option's
 * own value and whatever else tends to be specified alongside it.
 */
export function EquipmentValue({ data, locale }: EquipmentValueProps) {
  const copy = analysisCopy[locale].equipment;

  if (data.items.length === 0) {
    return <p className="text-xs text-ink-muted">{copy.empty}</p>;
  }

  const widest = Math.max(
    ...data.items.map((item) => Math.abs(item.premiumPercent)),
    1,
  );

  return (
    <ul className="space-y-2.5">
      {data.items.slice(0, 7).map((item) => {
        const positive = item.premiumPercent > 0;
        const width = (Math.abs(item.premiumPercent) / widest) * 50;

        return (
          <li className="grid grid-cols-[1fr_auto] items-center gap-x-3" key={item.label}>
            <span className="min-w-0 truncate text-[13px] text-ink">
              {item.label}
            </span>
            {/* A decimal place, unlike the other modules. Equipment premiums
                are all inside a couple of percent of each other, so whole
                numbers printed −2% against four different bar lengths and the
                list read as though the figures were identical. */}
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{ color: positive ? "var(--positive)" : "var(--negative)" }}
            >
              {formatPercent(item.premiumPercent, locale, 1)}
            </span>
            <span
              aria-hidden="true"
              className="relative col-span-2 h-1.5 rounded-full bg-surface-muted"
            >
              <span
                className="absolute top-0 h-1.5 rounded-full transition-[width] duration-500"
                style={{
                  width: `${width}%`,
                  left: positive ? "50%" : undefined,
                  right: positive ? undefined : "50%",
                  backgroundColor: positive
                    ? "var(--positive)"
                    : "var(--negative)",
                }}
              />
              <span className="absolute left-1/2 top-0 h-1.5 w-px bg-border-strong" />
            </span>
          </li>
        );
      })}
      <li className="pt-0.5 text-[10px] text-ink-subtle">
        {copy.basis(formatNumber(data.minimumListings, locale))}
      </li>
    </ul>
  );
}
