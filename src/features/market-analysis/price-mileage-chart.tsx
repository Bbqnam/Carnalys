"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PriceMileageChart as PriceMileageData } from "@/domain/market/types";
import type { Locale } from "@/features/search/copy";
import { analysisCopy } from "./copy";
import { compactMoney, formatMil } from "./format";
import { modelYearColor, rampSteps } from "./palette";

interface PriceMileageChartProps {
  data: PriceMileageData;
  locale: Locale;
}

/**
 * The chart draws in real pixels — one SVG unit is one CSS pixel, with the
 * viewBox sized from the measured container. A fixed viewBox scaled by CSS
 * instead would tie height to width, which at 1,400px made the plot taller
 * than the viewport and at 390px shrank the axis labels to about five pixels.
 * Measuring lets the height and the type stay right at every width.
 */
const fallbackWidth = 900;

function chartHeight(width: number) {
  return Math.round(Math.max(260, Math.min(width * 0.42, 420)));
}

/** Rounded axis stops, so labels read 200k / 400k rather than 197k / 394k. */
function axisTicks(maximum: number, count: number) {
  if (maximum <= 0) return [0];
  const rawStep = maximum / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((multiple) => multiple * magnitude)
      .find((candidate) => candidate >= rawStep) ?? magnitude * 10;

  const ticks: number[] = [];
  for (let value = 0; value <= maximum + step * 0.001; value += step) {
    ticks.push(value);
  }
  return ticks;
}

export function PriceMileageChart({ data, locale }: PriceMileageChartProps) {
  const copy = analysisCopy[locale].scatter;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  // Points animate between positions, but not into their first one. The server
  // renders at `fallbackWidth`, so the first measurement moves every point at
  // once — and for the length of that transition the pointer would select
  // points by where they are heading rather than where they are drawn, which
  // reads as the hover being offset from the cloud.
  const [animatePositions, setAnimatePositions] = useState(false);
  // Selection is held by listing, not by position in the array. Held by index,
  // it survived a filter change as a number pointing into a different sample —
  // marking some unrelated car, and blanking the mark drawn for it.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Hover is a transient preview; clicking pins the same card so it can hold a
  // link to the listing without the pointer having to leave the chart to reach
  // it — and so the card is reachable at all on touch.
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setMeasuredWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const measured = measuredWidth !== null;

  useEffect(() => {
    if (!measured) return;
    // A frame after the measured layout has been painted, so enabling the
    // transition can never coincide with a position change.
    const frame = requestAnimationFrame(() => setAnimatePositions(true));
    return () => cancelAnimationFrame(frame);
  }, [measured]);

  const width = measuredWidth ?? fallbackWidth;
  const height = chartHeight(width);
  const isNarrow = width < 520;
  const padding = {
    top: 14,
    right: 12,
    bottom: 30,
    left: isNarrow ? 46 : 58,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const scale = useMemo(() => {
    const priceMaximum = Math.max(data.priceMaximum, 1);
    const priceMinimum = Math.min(data.priceMinimum, priceMaximum);
    const mileageMaximum = Math.max(data.mileageMaximumKm, 1);

    return {
      priceMinimum,
      priceMaximum,
      mileageMaximum,
      x: (mileageKm: number) =>
        padding.left + (mileageKm / mileageMaximum) * plotWidth,
      y: (price: number) =>
        padding.top +
        plotHeight *
          (1 - (price - priceMinimum) / Math.max(1, priceMaximum - priceMinimum)),
    };
  }, [
    data.mileageMaximumKm,
    data.priceMaximum,
    data.priceMinimum,
    padding.left,
    padding.top,
    plotHeight,
    plotWidth,
  ]);

  const years = useMemo(() => {
    const values = data.points.map((point) => point.modelYear);
    return {
      minimum: values.length ? Math.min(...values) : 0,
      maximum: values.length ? Math.max(...values) : 0,
    };
  }, [data.points]);

  /**
   * Model year is sequential, so it takes a single-hue ramp with the newest
   * cars at the strong end — never a rainbow, and never a second hue that
   * would compete with the calendar's green/red.
   */
  const colorFor = (modelYear: number) =>
    modelYearColor(modelYear, years.minimum, years.maximum);

  const priceTicks = useMemo(
    () =>
      axisTicks(scale.priceMaximum, isNarrow ? 3 : 4).filter(
        (value) => value > scale.priceMinimum,
      ),
    [isNarrow, scale.priceMaximum, scale.priceMinimum],
  );
  const mileageTicks = useMemo(
    () => axisTicks(scale.mileageMaximum, isNarrow ? 3 : 5),
    [isNarrow, scale.mileageMaximum],
  );

  /**
   * The mark under the pointer, or the nearest one within reach of it.
   *
   * The direct hit comes first because the browser tests against what is
   * actually on screen: a mark still travelling to a new filter's position is
   * selectable where it is drawn, and one mark stacked exactly on another
   * resolves to the one on top rather than to whichever the data happens to
   * list first. The scan then covers the near misses, which is most of them —
   * a mark is under three pixels across.
   */
  function pointIndexFor(event: React.PointerEvent | React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg || data.points.length === 0) return null;

    const target = event.target;
    if (target instanceof SVGElement && target.dataset.index !== undefined) {
      return Number(target.dataset.index);
    }

    const coarse =
      "pointerType" in event ? event.pointerType !== "mouse" : false;
    const reach = coarse ? 18 : 9;
    const rect = svg.getBoundingClientRect();
    // The viewBox is sized from the measured container, so one unit is one
    // pixel — but only to within the rounding, and the pointer has to be
    // converted rather than assumed.
    const scaleFactor = rect.width > 0 ? width / rect.width : 1;
    const pointerX = (event.clientX - rect.left) * scaleFactor;
    const pointerY = (event.clientY - rect.top) * scaleFactor;

    // 1,200 points is small enough that a linear scan per pointer move stays
    // well inside a frame, so no spatial index is warranted.
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    data.points.forEach((point, index) => {
      const distance =
        (scale.x(point.mileageKm) - pointerX) ** 2 +
        (scale.y(point.price) - pointerY) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });

    return nearestDistance <= reach ** 2 ? nearest : null;
  }

  function listingIdFor(event: React.PointerEvent | React.MouseEvent) {
    const index = pointIndexFor(event);
    return index === null ? null : data.points[index].listingId;
  }

  const activeId = pinnedId ?? hoveredId;
  const active =
    activeId === null
      ? null
      : (data.points.find((point) => point.listingId === activeId) ?? null);
  const isPinned = pinnedId !== null && active !== null;

  if (data.points.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-ink-muted">
        {copy.empty}
      </p>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <svg
        className="block w-full touch-pan-y select-none"
        height={height}
        onClick={(event) => setPinnedId(listingIdFor(event))}
        onPointerLeave={() => setHoveredId(null)}
        onPointerMove={(event) => setHoveredId(listingIdFor(event))}
        ref={svgRef}
        role="img"
        aria-label={`${copy.priceAxis} / ${copy.mileageAxis}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        {/* Baseline at the lowest plotted price, so the cloud of points sits on
            a reference line instead of floating above nothing. */}
        {[scale.priceMinimum, ...priceTicks].map((price, index) => (
          <g key={`price-${price}`}>
            <line
              stroke="var(--border)"
              x1={padding.left}
              x2={width - padding.right}
              y1={scale.y(price)}
              y2={scale.y(price)}
            />
            <text
              fill="var(--ink-subtle)"
              fontSize="11"
              textAnchor="end"
              x={padding.left - 8}
              y={scale.y(price) + (index === 0 ? 0 : 4)}
            >
              {compactMoney(price, locale)}
            </text>
          </g>
        ))}

        {mileageTicks.map((mileageKm) => (
          <text
            fill="var(--ink-subtle)"
            fontSize="11"
            key={`mileage-${mileageKm}`}
            textAnchor="middle"
            x={scale.x(mileageKm)}
            y={height - 12}
          >
            {formatMil(mileageKm, locale)}
          </text>
        ))}

        {/* Position lives in a CSS transform rather than cx/cy so it can be
            transitioned. Keyed by listing id, so React reuses the same node for
            a car that survives a filter change and the browser animates it to
            its new place. */}
        <g fillOpacity={0.75}>
          {data.points.map((point, index) => (
            <circle
              className={
                animatePositions
                  ? "scatter-point scatter-point-animated"
                  : "scatter-point"
              }
              cx={0}
              cy={0}
              data-index={index}
              fill={colorFor(point.modelYear)}
              fillOpacity={point.listingId === activeId ? 0 : undefined}
              key={point.listingId}
              r={2.8}
              style={{
                transform: `translate(${scale.x(point.mileageKm)}px, ${scale.y(point.price)}px)`,
              }}
            />
          ))}
        </g>

        {active ? (
          // Draws over the mark it replaces, so it must not take the pointer
          // away from it.
          <circle
            cx={scale.x(active.mileageKm)}
            cy={scale.y(active.price)}
            fill={colorFor(active.modelYear)}
            pointerEvents="none"
            r={5.5}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ) : null}
      </svg>

      {active ? (
        // The card floats over the cloud, so it never takes the pointer: it
        // used to cover a couple of hundred pixels of chart that could not be
        // hovered or clicked while a point was pinned. Only its link does.
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-xl border border-border bg-surface p-3 shadow-[0_12px_32px_rgba(20,30,24,0.16)]"
          style={{
            // Clamped to the plot so a card for a point near either edge stays
            // fully on screen rather than hanging off it.
            left: Math.min(Math.max(scale.x(active.mileageKm), 110), width - 110),
            top: scale.y(active.price),
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {active.title}
          </p>
          {active.variant ? (
            <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
              {active.variant}
            </p>
          ) : null}
          <p className="mt-2 text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
            {compactMoney(active.price, locale, true)}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-ink-muted">
            {active.modelYear} · {formatMil(active.mileageKm, locale)} mil ·{" "}
            {active.sellerType === "dealer" ? copy.dealer : copy.private}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
            {active.municipality}
          </p>
          {isPinned ? (
            <Link
              className="pointer-events-auto mt-2 inline-flex text-[11px] font-semibold text-accent hover:text-accent-strong"
              href={`/vehicle/${active.listingId}`}
            >
              {copy.viewListing} →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] text-ink-subtle">
        {/* Discrete swatches, matching the five ramp steps actually drawn, with
            the real model years at either end — a smooth gradient bar would
            imply a precision the stepped scale doesn't have. */}
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{years.minimum}</span>
          <span aria-hidden="true" className="flex gap-0.5">
            {Array.from({ length: rampSteps }, (_, step) => (
              <span
                className="h-2 w-5 first:rounded-l-full last:rounded-r-full"
                key={step}
                style={{ backgroundColor: `var(--viz-year-${step + 1})` }}
              />
            ))}
          </span>
          <span className="tabular-nums">{years.maximum}</span>
          <span className="ml-1">{copy.modelYearLegend}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{copy.sampleNote(data.points.length, data.matchingCount)}</span>
          {data.trimmedCount > 0 ? (
            <span>· {copy.trimmedNote(data.trimmedCount)}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
