"use client";

import { useMemo, useState } from "react";
import type { DepreciationCurve as DepreciationData } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatNumber, formatPercent } from "./format";

interface DepreciationCurveProps {
  data: DepreciationData;
  locale: Locale;
}

const viewWidth = 320;
const viewHeight = 216;
const padding = { top: 18, right: 10, bottom: 34, left: 24 };
/** Retained-share gridlines. 100% is the newest model year on sale. */
const gridlines = [100, 50];

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
  // The scale starts at zero and always reaches 100, so the gridlines mean what
  // they say and the filled area is a true share of the newest year's price.
  // An older year can out-ask the newest one on a thin cohort, so the top is
  // not simply pinned at 100.
  const maximum = Math.max(100, ...points.map((point) => point.retainedPercent));

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
  // The cliff is the year-on-year step the sweet spot sits at the bottom of —
  // in this reversed order, the segment immediately to its left. Drawing it
  // makes the claim underneath the chart visible rather than asserted.
  const cliff =
    sweetSpotIndex >= 1
      ? {
          from: points[sweetSpotIndex - 1],
          to: points[sweetSpotIndex],
          fromIndex: sweetSpotIndex - 1,
        }
      : null;
  // Expressed against the newer year's own price ("this car lost a fifth of its
  // value that year"), not as a difference in retained percentage points.
  const cliffDropPercent =
    cliff && cliff.from.medianPrice > 0
      ? ((cliff.from.medianPrice - cliff.to.medianPrice) / cliff.from.medianPrice) *
        100
      : null;

  const active =
    activeYear === null
      ? null
      : points.find((point) => point.modelYear === activeYear) ?? null;

  // The middle label is dropped rather than allowed to collide with an end one.
  const sweetSpotLabelX = sweetSpotIndex >= 0 ? x(sweetSpotIndex) : null;
  const showSweetSpotLabel =
    sweetSpotLabelX !== null &&
    sweetSpotLabelX - padding.left > 40 &&
    viewWidth - padding.right - sweetSpotLabelX > 40;

  const axisLabels: {
    point: (typeof points)[number];
    x: number;
    anchor: "start" | "middle" | "end";
    accent: boolean;
  }[] = [
    { point: points[0], x: padding.left, anchor: "start", accent: false },
    ...(showSweetSpotLabel
      ? ([
          {
            point: points[sweetSpotIndex],
            x: sweetSpotLabelX,
            anchor: "middle" as const,
            accent: true,
          },
        ] as const)
      : []),
    {
      point: points.at(-1)!,
      x: viewWidth - padding.right,
      anchor: "end",
      accent: false,
    },
  ];

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
            <stop offset="0%" stopColor="var(--viz-year-3)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--viz-year-3)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridlines.map((value) => (
          <g key={value}>
            <line
              stroke="var(--border)"
              strokeDasharray={value === 100 ? undefined : "2 4"}
              x1={padding.left}
              x2={viewWidth - padding.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              fill="var(--ink-subtle)"
              fontSize="8"
              opacity="0.75"
              textAnchor="end"
              x={padding.left - 5}
              y={y(value) + 3}
            >
              {value}%
            </text>
          </g>
        ))}

        <path d={area} fill="url(#depreciation-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--viz-year-4)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />

        {cliff ? (
          <g>
            <path
              d={`M${x(cliff.fromIndex)} ${y(cliff.from.retainedPercent)} L${x(sweetSpotIndex)} ${y(cliff.to.retainedPercent)}`}
              fill="none"
              stroke="var(--accent)"
              strokeLinecap="round"
              strokeWidth="2.75"
            />
            {cliffDropPercent !== null ? (
              <text
                fill="var(--accent)"
                fontSize="9.5"
                fontWeight="600"
                textAnchor="middle"
                x={(x(cliff.fromIndex) + x(sweetSpotIndex)) / 2}
                y={y(cliff.from.retainedPercent) - 6}
              >
                {formatPercent(-cliffDropPercent, locale, 0)}
              </text>
            ) : null}
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
              opacity={activeYear === point.modelYear ? 1 : 0.45}
              r={activeYear === point.modelYear ? 3.5 : 1.75}
              stroke="var(--background)"
              strokeWidth={activeYear === point.modelYear ? 1.5 : 0}
            />
          </g>
        ))}

        {sweetSpotIndex >= 0 ? (
          <circle
            cx={x(sweetSpotIndex)}
            cy={y(points[sweetSpotIndex].retainedPercent)}
            fill="var(--accent)"
            r="4"
            stroke="var(--background)"
            strokeWidth="2"
          />
        ) : null}

        {/* The axis carries the median asking price under each year it labels,
            so the curve is read in kronor rather than in abstract share. */}
        {axisLabels.map((label) => (
          <g key={label.point.modelYear}>
            <text
              fill={label.accent ? "var(--accent)" : "var(--ink-subtle)"}
              fontSize="9"
              fontWeight={label.accent ? 600 : 400}
              textAnchor={label.anchor}
              x={label.x}
              y={viewHeight - 17}
            >
              {label.point.modelYear}
            </text>
            <text
              fill="var(--ink-subtle)"
              fontSize="8"
              opacity="0.8"
              textAnchor={label.anchor}
              x={label.x}
              y={viewHeight - 5}
            >
              {compactMoney(label.point.medianPrice, locale)}
            </text>
          </g>
        ))}
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
