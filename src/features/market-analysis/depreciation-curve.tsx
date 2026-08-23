"use client";

import { useMemo, useState } from "react";
import type { DepreciationCurve as DepreciationData } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatNumber } from "./format";

interface DepreciationCurveProps {
  data: DepreciationData;
  locale: Locale;
}

const viewWidth = 320;
const viewHeight = 150;
const padding = { top: 10, right: 8, bottom: 20, left: 8 };

/**
 * Value retained by model year, read off today's market rather than from one
 * car followed over time — the only kind of curve a snapshot of live listings
 * can support, and the same construction the published industry curves use.
 */
export function DepreciationCurve({ data, locale }: DepreciationCurveProps) {
  const copy = analysisCopy[locale].depreciation;
  const [activeYear, setActiveYear] = useState<number | null>(null);

  // Newest model year on the left, oldest on the right — so the line falls as
  // the car gets older, which is what a depreciation curve is expected to look
  // like. Plotted in model-year order it climbed left-to-right and read as
  // value *rising* with age.
  //
  // A dozen model years is enough to show the shape; older tails are thin and
  // flat, and stretching the axis to reach them squashes the part of the curve
  // anyone is choosing between.
  const points = useMemo(
    () => data.points.slice(-12).toReversed(),
    [data.points],
  );

  if (points.length < 3) {
    return <p className="text-xs text-ink-muted">{copy.empty}</p>;
  }

  const plotWidth = viewWidth - padding.left - padding.right;
  const plotHeight = viewHeight - padding.top - padding.bottom;
  const maximum = Math.max(...points.map((point) => point.retainedPercent), 1);

  const x = (index: number) =>
    padding.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (retained: number) =>
    padding.top + plotHeight * (1 - retained / maximum);

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)} ${y(point.retainedPercent)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1)} ${padding.top + plotHeight} L${x(0)} ${padding.top + plotHeight} Z`;

  const sweetSpotIndex = points.findIndex(
    (point) => point.modelYear === data.sweetSpotYear,
  );
  const active =
    activeYear === null
      ? null
      : points.find((point) => point.modelYear === activeYear) ?? null;

  return (
    <div>
      <svg
        className="w-full"
        onPointerLeave={() => setActiveYear(null)}
        role="img"
        aria-label={copy.title}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      >
        <defs>
          <linearGradient id="depreciation-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-year-3)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--viz-year-3)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#depreciation-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--viz-year-4)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />

        {sweetSpotIndex >= 0 ? (
          <g>
            <line
              stroke="var(--accent)"
              strokeDasharray="2 3"
              x1={x(sweetSpotIndex)}
              x2={x(sweetSpotIndex)}
              y1={padding.top}
              y2={padding.top + plotHeight}
            />
            <circle
              cx={x(sweetSpotIndex)}
              cy={y(points[sweetSpotIndex].retainedPercent)}
              fill="var(--accent)"
              r="4"
              stroke="var(--background)"
              strokeWidth="2"
            />
          </g>
        ) : null}

        {points.map((point, index) => (
          <g key={point.modelYear}>
            {/* An invisible full-height band per year gives the pointer a target
                far larger than the 3px mark it selects. */}
            <rect
              fill="transparent"
              height={plotHeight + padding.top}
              onPointerEnter={() => setActiveYear(point.modelYear)}
              width={plotWidth / points.length}
              x={x(index) - plotWidth / points.length / 2}
              y={0}
            />
            <circle
              cx={x(index)}
              cy={y(point.retainedPercent)}
              fill="var(--viz-year-4)"
              opacity={activeYear === point.modelYear ? 1 : 0}
              r="3.5"
              stroke="var(--background)"
              strokeWidth="1.5"
            />
          </g>
        ))}

        <text
          fill="var(--ink-subtle)"
          fontSize="9"
          textAnchor="start"
          x={padding.left}
          y={viewHeight - 6}
        >
          {points[0].modelYear}
        </text>
        <text
          fill="var(--ink-subtle)"
          fontSize="9"
          textAnchor="end"
          x={viewWidth - padding.right}
          y={viewHeight - 6}
        >
          {points.at(-1)!.modelYear}
        </text>
      </svg>

      <div className="mt-2 min-h-[2.5rem] text-xs">
        {active ? (
          <p className="tabular-nums text-ink">
            <span className="font-semibold">{active.modelYear}</span>{" "}
            <span className="text-ink-muted">
              · {compactMoney(active.medianPrice, locale, true)} ·{" "}
              {Math.round(active.retainedPercent)}
              {locale === "en" ? "%" : " %"} {copy.retained} ·{" "}
              {formatNumber(active.listingCount, locale)}
            </span>
          </p>
        ) : data.sweetSpotYear ? (
          <p className="leading-relaxed text-ink-muted">
            <span className="font-semibold text-accent">
              {copy.sweetSpot(data.sweetSpotYear)}
            </span>{" "}
            {copy.sweetSpotHelp}
          </p>
        ) : (
          <p className="text-ink-muted">{copy.hover}</p>
        )}
      </div>
    </div>
  );
}
