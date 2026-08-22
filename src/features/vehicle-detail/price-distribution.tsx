import type { Locale } from "@/features/search/copy";
import { createMoneyFormatter } from "@/features/search/format";

interface PriceDistributionProps {
  prices: readonly number[];
  targetPrice: number;
  /** The "likely range" (25th-75th percentile) already shown as text above this chart. */
  likelyRangeMinimum: number;
  likelyRangeMaximum: number;
  locale: Locale;
  comparableLabel: string;
  targetLabel: string;
}

const width = 480;
const height = 150;
const paddingLeft = 60;
const paddingRight = 12;
const paddingTop = 12;
const paddingBottom = 12;

export function PriceDistribution({
  prices,
  targetPrice,
  likelyRangeMinimum,
  likelyRangeMaximum,
  locale,
  comparableLabel,
  targetLabel,
}: PriceDistributionProps) {
  if (prices.length === 0) return null;

  // Priced within the likely range (already shown as text above) reads as a
  // normal/expected price — neutral. Below it is a good deal, above it is
  // pricier than typical — reusing the app's one positive/negative palette
  // rather than introducing new colors for the same "good vs bad price" idea
  // already used elsewhere (e.g. the "below/above market" labels on cards).
  const targetTone =
    targetPrice <= likelyRangeMinimum
      ? "var(--positive)"
      : targetPrice >= likelyRangeMaximum
        ? "var(--negative)"
        : "var(--ink-muted)";

  const moneyFormatter = createMoneyFormatter(locale);
  const points = [
    ...prices.map((price) => ({ price, isTarget: false })),
    { price: targetPrice, isTarget: true },
  ].toSorted((left, right) => left.price - right.price);

  const min = points[0].price;
  const max = points.at(-1)!.price;
  const span = max - min || 1;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const y = (price: number) => paddingTop + plotHeight * (1 - (price - min) / span);
  const x = (index: number) =>
    points.length === 1
      ? paddingLeft + plotWidth / 2
      : paddingLeft + plotWidth * (index / (points.length - 1));

  const target = points.find((point) => point.isTarget)!;
  const targetY = y(target.price);
  const gridlinePrices = [max, min + span / 2, min];

  return (
    <div className="mt-3">
      <svg
        aria-hidden="true"
        className="w-full"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {gridlinePrices.map((price) => (
          <g key={price}>
            <line
              stroke="var(--border)"
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={y(price)}
              y2={y(price)}
            />
            <text fill="var(--ink-subtle)" fontSize="9" textAnchor="end" x={paddingLeft - 8} y={y(price) + 3}>
              {moneyFormatter.format(price)}
            </text>
          </g>
        ))}
        <line
          stroke={targetTone}
          strokeDasharray="2 3"
          strokeWidth="1"
          x1={paddingLeft}
          x2={width - paddingRight}
          y1={targetY}
          y2={targetY}
        />
        {points.map((point, index) =>
          point.isTarget ? null : (
            <circle
              cx={x(index)}
              cy={y(point.price)}
              fill="var(--border-strong)"
              key={index}
              r="3"
            />
          ),
        )}
        <circle
          cx={x(points.indexOf(target))}
          cy={targetY}
          fill={targetTone}
          r="5"
          stroke="var(--surface)"
          strokeWidth="2"
        />
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-ink-subtle">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-border-strong" />
          {comparableLabel}
        </span>
        <span className="flex items-center gap-1 font-medium" style={{ color: targetTone }}>
          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: targetTone }} />
          {targetLabel}: {moneyFormatter.format(targetPrice)}
        </span>
      </div>
    </div>
  );
}
