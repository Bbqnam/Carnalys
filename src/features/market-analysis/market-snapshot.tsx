import type {
  DepreciationCurve,
  MarketSnapshot as MarketSnapshotData,
  PriceMileageChart,
} from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatMil, formatNumber } from "./format";

interface MarketSnapshotProps {
  data: MarketSnapshotData;
  priceMileage: PriceMileageChart;
  depreciation: DepreciationCurve;
  locale: Locale;
}

/**
 * A tiny distribution strip. Buckets the sampled listings and draws them as
 * bars, with the median marked — so the headline figure arrives with the shape
 * of the market behind it instead of standing alone.
 */
function Distribution({
  values,
  median,
  buckets = 22,
}: {
  values: readonly number[];
  median: number | null;
  buckets?: number;
}) {
  if (values.length < 8 || median === null) return null;

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1, maximum - minimum);
  const counts = new Array(buckets).fill(0) as number[];
  for (const value of values) {
    const index = Math.min(
      buckets - 1,
      Math.floor(((value - minimum) / span) * buckets),
    );
    counts[index] += 1;
  }
  const tallest = Math.max(...counts, 1);
  const medianBucket = Math.min(
    buckets - 1,
    Math.floor(((median - minimum) / span) * buckets),
  );

  return (
    <span
      aria-hidden="true"
      className="mt-2 flex h-6 items-end gap-[2px]"
    >
      {counts.map((count, index) => (
        <span
          className="flex-1 rounded-[1px] transition-[height] duration-500"
          key={index}
          style={{
            height: `${Math.max(8, (count / tallest) * 100)}%`,
            backgroundColor:
              index === medianBucket ? "var(--accent)" : "var(--border-strong)",
          }}
        />
      ))}
    </span>
  );
}

/** A sparkline of value retained by model year — the depreciation shape, small. */
function RetentionSpark({ curve }: { curve: DepreciationCurve }) {
  // Newest year first, matching the depreciation module: the line has to fall
  // with age, not climb.
  const points = curve.points.slice(-10).toReversed();
  if (points.length < 3) return null;

  const maximum = Math.max(...points.map((point) => point.retainedPercent), 1);
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 24 - (point.retainedPercent / maximum) * 22;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="mt-2 h-6 w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 26"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--viz-year-4)"
        strokeLinecap="round"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Four figures on one baseline, each carrying a micro-chart. A card around
 * every number would turn the page's opening into a dashboard before the
 * reader has seen a single car; a number with its own distribution under it
 * says more in the same space than a number alone.
 */
export function MarketSnapshot({
  data,
  priceMileage,
  depreciation,
  locale,
}: MarketSnapshotProps) {
  const copy = analysisCopy[locale].snapshot;
  const prices = priceMileage.points.map((point) => point.price);
  const mileages = priceMileage.points.map((point) => point.mileageKm);

  const items = [
    {
      label: copy.listings,
      value: formatNumber(data.listingCount, locale),
      note:
        priceMileage.matchingCount > 0
          ? copy.sampled(formatNumber(priceMileage.points.length, locale))
          : null,
      chart: null as React.ReactNode,
    },
    {
      label: copy.medianPrice,
      value:
        data.medianPrice === null
          ? "–"
          : compactMoney(data.medianPrice, locale, true),
      note:
        data.priceP25 !== null && data.priceP75 !== null
          ? copy.spread(
              compactMoney(data.priceP25, locale),
              compactMoney(data.priceP75, locale),
            )
          : null,
      chart: <Distribution median={data.medianPrice} values={prices} />,
    },
    {
      label: copy.medianMileage,
      value:
        data.medianMileageKm === null
          ? "–"
          : `${formatMil(data.medianMileageKm, locale)} mil`,
      note: null,
      chart: <Distribution median={data.medianMileageKm} values={mileages} />,
    },
    {
      label: copy.medianYear,
      value:
        data.medianModelYear === null
          ? "–"
          : String(Math.round(data.medianModelYear)),
      note:
        depreciation.baselineYear !== null && depreciation.points.length >= 3
          ? copy.retention(
              Math.round(
                depreciation.points.find(
                  (point) =>
                    point.modelYear === Math.round(data.medianModelYear ?? 0),
                )?.retainedPercent ?? 0,
              ),
            )
          : null,
      chart: <RetentionSpark curve={depreciation} />,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 sm:gap-x-10">
      {items.map((item) => (
        <div className="min-w-0" key={item.label}>
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            {item.label}
          </dt>
          <dd className="mt-1.5 text-[1.55rem] font-semibold leading-none tracking-[-0.035em] tabular-nums text-ink">
            {item.value}
          </dd>
          {item.chart}
          {item.note ? (
            <p className="mt-1.5 text-[10px] tabular-nums text-ink-subtle">
              {item.note}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
