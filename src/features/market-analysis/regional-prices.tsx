"use client";

import type { RegionalPrice, RegionalPrices as RegionalData } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatNumber, formatPercent } from "./format";

interface RegionalPricesProps {
  data: RegionalData;
  locale: Locale;
}

function RegionRow({
  region,
  locale,
  widest,
}: {
  region: RegionalPrice;
  locale: Locale;
  widest: number;
}) {
  const cheaper = region.differencePercent < 0;
  const width = (Math.abs(region.differencePercent) / widest) * 100;

  return (
    <li className="flex items-center gap-2.5">
      <span className="w-24 shrink-0 truncate text-[13px] text-ink">
        {region.municipality}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 min-w-[2px] rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(4, width)}%`,
          backgroundColor: cheaper ? "var(--positive)" : "var(--negative)",
        }}
      />
      <span
        className="shrink-0 text-[12px] font-semibold tabular-nums"
        style={{ color: cheaper ? "var(--positive)" : "var(--negative)" }}
      >
        {formatPercent(region.differencePercent, locale, 1)}
      </span>
      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-subtle">
        {compactMoney(region.medianPrice, locale)} ·{" "}
        {formatNumber(region.listingCount, locale)}
      </span>
    </li>
  );
}

/**
 * Where the same car is advertised for less. Municipalities are ranked on
 * mix-adjusted differences, so a town that simply lists older, higher-mileage
 * cars does not masquerade as a bargain.
 */
export function RegionalPrices({ data, locale }: RegionalPricesProps) {
  const copy = analysisCopy[locale].regions;

  if (data.cheapest.length === 0) {
    return <p className="text-xs text-ink-muted">{copy.empty}</p>;
  }

  const widest = Math.max(
    ...[...data.cheapest, ...data.priciest].map((region) =>
      Math.abs(region.differencePercent),
    ),
    1,
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-positive">
          {copy.cheapest}
        </p>
        <ul className="space-y-2">
          {data.cheapest.map((region) => (
            <RegionRow
              key={region.municipality}
              locale={locale}
              region={region}
              widest={widest}
            />
          ))}
        </ul>
      </div>
      {data.priciest.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-negative">
            {copy.priciest}
          </p>
          <ul className="space-y-2">
            {data.priciest.slice(0, 3).map((region) => (
              <RegionRow
                key={region.municipality}
                locale={locale}
                region={region}
                widest={widest}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
