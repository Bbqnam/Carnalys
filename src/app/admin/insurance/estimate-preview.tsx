"use client";

import { useActionState } from "react";
import { previewEstimateAction, type EstimatePreviewState } from "./actions";
import { bodyStyleOptions, drivetrainOptions, fuelTypeOptions } from "./vehicle-options";

const initialState: EstimatePreviewState = {};
const fieldClass =
  "mt-1 block h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";
const labelClass = "text-xs font-semibold text-ink-muted";

const tierLabel: Record<string, string> = {
  model: "Same brand and model",
  make_body_fuel: "Same brand, body style and fuel type",
  body_fuel_value_band: "Similar body style, fuel type and value (any brand)",
};

const confidenceClass: Record<string, string> = {
  high: "bg-accent-soft text-accent-strong",
  medium: "bg-surface-muted text-ink-muted",
  low: "bg-negative-soft text-negative",
};

export function EstimatePreview() {
  const [state, action, pending] = useActionState(previewEstimateAction, initialState);

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className={labelClass}>
          Brand
          <input className={fieldClass} name="make" required />
        </label>
        <label className={labelClass}>
          Model
          <input className={fieldClass} name="model" required />
        </label>
        <label className={labelClass}>
          Body style
          <select className={fieldClass} defaultValue="" name="bodyStyle" required>
            <option disabled value="">
              Select…
            </option>
            {bodyStyleOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Fuel type
          <select className={fieldClass} defaultValue="" name="fuelType" required>
            <option disabled value="">
              Select…
            </option>
            {fuelTypeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Drivetrain
          <select className={fieldClass} defaultValue="" name="drivetrain">
            <option value="">Unknown</option>
            {drivetrainOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Horsepower
          <input className={fieldClass} min={0} name="horsepower" type="number" />
        </label>
        <label className={labelClass}>
          Vehicle value (SEK)
          <input className={fieldClass} min={0} name="vehicleValueAmount" required type="number" />
        </label>
        <button
          className="h-9 self-end rounded-lg bg-ink px-4 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Estimating…" : "Estimate"}
        </button>
      </form>

      {state.error ? <p className="text-xs text-negative">{state.error}</p> : null}

      {state.checked && !state.error ? (
        state.result ? (
          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {state.result.rangeLow.toLocaleString("sv-SE")}–{state.result.rangeHigh.toLocaleString("sv-SE")}
              </span>
              <span className="text-sm text-ink-muted">SEK/month</span>
              <span
                className={`ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${confidenceClass[state.result.confidence]}`}
              >
                {state.result.confidence} confidence
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Median {state.result.medianMonthly.toLocaleString("sv-SE")} SEK/month · cheapest observed{" "}
              {state.result.cheapestMonthly.toLocaleString("sv-SE")} SEK/month via {state.result.cheapestInsurer}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {tierLabel[state.result.tier]} · {state.result.comparableCount} quote
              {state.result.comparableCount === 1 ? "" : "s"} across {state.result.insurerCount} insurer
              {state.result.insurerCount === 1 ? "" : "s"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No reliable estimate available yet — not enough comparable quotes recorded for this kind of vehicle.
          </p>
        )
      ) : null}
    </div>
  );
}
