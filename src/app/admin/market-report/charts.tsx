import type { DayCount, HistogramBucket } from "@/application/reporting/daily-market-report";

const en = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function percentile(values: number[], p: number) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] || 1;
}

/**
 * A 21-day trailing bar strip — the shape behind a headline number. Outliers
 * are clipped to a high percentile so a one-off spike (the initial seed import)
 * does not flatten the recent trend; the most recent day is accented.
 */
export function DayBars({ series }: { series: DayCount[] }) {
  const scale = Math.max(percentile(series.map((d) => d.count), 92), 1);
  return (
    <span aria-hidden="true" className="mt-2 flex h-8 items-end gap-[2px]">
      {series.map((d, i) => {
        const last = i === series.length - 1;
        const height = d.count === 0 ? 3 : Math.max(7, Math.min(100, (d.count / scale) * 100));
        return (
          <span
            className="flex-1 rounded-[1px]"
            key={d.date}
            style={{
              height: `${height}%`,
              backgroundColor: last ? "var(--accent)" : "var(--border-strong)",
              opacity: last ? 1 : d.count === 0 ? 0.35 : 0.7,
            }}
            title={`${d.date}: ${en.format(d.count)}`}
          />
        );
      })}
    </span>
  );
}

/** An inline-SVG sparkline of a day series. */
export function Sparkline({ series }: { series: DayCount[] }) {
  const values = series.map((d) => d.count);
  const max = Math.max(percentile(values, 92), 1);
  const path = series
    .map((d, i) => {
      const x = (i / Math.max(1, series.length - 1)) * 100;
      const y = 24 - (Math.min(d.count, max) / max) * 22;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
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

export type RankRow = { name: string; count: number; averagePrice?: number };

/**
 * Horizontal ranked bars from a shared track. Monochrome — the ranking is the
 * signal, not a good/bad judgement.
 */
export function RankedBars({
  rows,
  total,
  formatMeta,
}: {
  rows: RankRow[];
  total?: number;
  formatMeta?: (row: RankRow) => string | null;
}) {
  if (rows.length === 0) return <p className="mt-2 text-sm text-ink-subtle">No data for this period.</p>;
  const widest = Math.max(...rows.map((r) => r.count), 1);
  const denominator = total ?? widest;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{row.name}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
              {en.format(row.count)}
              {denominator ? (
                <span className="ml-1 text-[11px] font-normal text-ink-subtle">
                  {Math.round((row.count / denominator) * 100)}%
                </span>
              ) : null}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span aria-hidden="true" className="relative h-1.5 flex-1 rounded-full bg-surface-muted">
              <span
                className="absolute left-0 top-0 h-1.5 rounded-full bg-border-strong"
                style={{ width: `${(row.count / widest) * 100}%` }}
              />
            </span>
            {formatMeta ? (
              <span className="w-[6rem] shrink-0 text-right text-[10px] tabular-nums text-ink-subtle">
                {formatMeta(row)}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Price-movement histogram: bars run out from a centre line — cuts to the left
 * in the negative tone, increases to the right in the positive tone. Buckets
 * 0–5 are reductions, 6 straddles zero, 7–12 are increases.
 */
export function DivergingHistogram({ buckets }: { buckets: HistogramBucket[] }) {
  const tallest = Math.max(...buckets.map((b) => b.count), 1);
  const labelFor = (bucket: number) => {
    if (bucket === 0) return "< −100k";
    if (bucket === 12) return "> +100k";
    if (bucket === 6) return "≈ 0";
    const centre = (bucket - 6) * 20;
    return `${centre > 0 ? "+" : "−"}${Math.abs(centre)}k`;
  };
  return (
    <span aria-hidden="true" className="mt-2 flex h-10 items-end gap-[3px]">
      {buckets.map((b) => {
        const isCut = b.bucket < 6;
        const isCentre = b.bucket === 6;
        const height = b.count === 0 ? 3 : Math.max(8, (b.count / tallest) * 100);
        return (
          <span
            className="flex-1 rounded-[1px]"
            key={b.bucket}
            style={{
              height: `${height}%`,
              backgroundColor: isCentre
                ? "var(--border-strong)"
                : isCut
                  ? "var(--negative)"
                  : "var(--positive)",
              opacity: b.count === 0 ? 0.3 : isCentre ? 0.5 : 0.85,
            }}
            title={`${labelFor(b.bucket)}: ${en.format(b.count)}`}
          />
        );
      })}
    </span>
  );
}

/** One wide track filling toward full direct-check coverage. */
export function CoverageBar({
  percent,
  checked,
  total,
  daysToFull,
}: {
  percent: number;
  checked: number;
  total: number;
  daysToFull: number | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-muted">Direct availability coverage</span>
        <span className="text-[15px] font-semibold tabular-nums text-ink">{percent}%</span>
      </div>
      <span aria-hidden="true" className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.max(1, Math.min(100, percent))}%` }}
        />
      </span>
      <p className="mt-1.5 text-[11px] tabular-nums text-ink-subtle">
        {en.format(checked)} of {en.format(total)} active Blocket ads checked
        {daysToFull && daysToFull > 0 ? ` · ≈ ${daysToFull} nights to full coverage` : null}
      </p>
    </div>
  );
}
