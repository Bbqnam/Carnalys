"use client";

import type { FuelType, TransmissionType } from "@/domain/vehicle";
import type { MarketAnalysisFilters } from "@/domain/market/types";
import { BrandLogo } from "@/features/search/brand-logo";
import { CompactDropdown } from "@/features/search/compact-dropdown";
import type { Locale } from "@/features/search/copy";
import {
  AllOptionsIcon,
  AutomaticTransmissionIcon,
  DieselFuelIcon,
  ElectricFuelIcon,
  HybridFuelIcon,
  ManualTransmissionIcon,
  ManufacturerIcon,
  PetrolFuelIcon,
  PlugInFuelIcon,
  VehicleModelIcon,
} from "@/features/search/icons";
import { MultiChoiceDropdown } from "@/features/search/multi-choice-dropdown";
import type { AvailableVehicleFilters } from "@/features/search/types";
import { analysisCopy } from "./copy";
import { formatNumber } from "./format";
import { hasActiveAnalysisFilters } from "./analysis-state";

interface AnalysisFiltersProps {
  filters: MarketAnalysisFilters;
  available: AvailableVehicleFilters;
  locale: Locale;
  onChange: (filters: MarketAnalysisFilters, delay?: number) => void;
  onReset: () => void;
}

const fuels = [
  "electric",
  "plug_in_hybrid",
  "self_charging_hybrid",
  "petrol",
  "diesel",
] as const satisfies readonly FuelType[];

const gearboxes = ["automatic", "manual"] as const satisfies readonly TransmissionType[];

const earliestModelYear = 1990;
const maximumMileageMil = 30_000;
const mileageStepMil = 500;
const mileageSliderMaximum = maximumMileageMil / mileageStepMil;

function FuelIcon({ value }: { value: string }) {
  const className = "size-3.5";
  switch (value) {
    case "electric":
      return <ElectricFuelIcon className={className} />;
    case "plug_in_hybrid":
      return <PlugInFuelIcon className={className} />;
    case "self_charging_hybrid":
      return <HybridFuelIcon className={className} />;
    case "petrol":
      return <PetrolFuelIcon className={className} />;
    case "diesel":
      return <DieselFuelIcon className={className} />;
    default:
      return <AllOptionsIcon className={className} />;
  }
}

/**
 * A labelled dual-handle range, built on the same `.budget-range` styling the
 * search page's price and mileage sliders use, so the two pages feel like one
 * product rather than two.
 */
function RangeFilter({
  label,
  minimum,
  maximum,
  step,
  fromValue,
  toValue,
  fromLabel,
  toLabel,
  minimumAria,
  maximumAria,
  onChangeFrom,
  onChangeTo,
}: {
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  fromValue: number;
  toValue: number;
  fromLabel: string;
  toLabel: string;
  minimumAria: string;
  maximumAria: string;
  onChangeFrom: (value: number) => void;
  onChangeTo: (value: number) => void;
}) {
  const span = Math.max(1, maximum - minimum);

  return (
    <div className="min-w-0">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
        {label}
      </span>
      <div className="h-10 rounded-xl border border-border bg-surface px-3 pt-0.5">
        <div
          className="budget-range"
          style={
            {
              "--budget-start": `${((fromValue - minimum) / span) * 100}%`,
              "--budget-end": `${((toValue - minimum) / span) * 100}%`,
            } as React.CSSProperties
          }
        >
          <span aria-hidden="true" className="budget-range-track" />
          <input
            aria-label={minimumAria}
            aria-valuetext={fromLabel}
            max={maximum}
            min={minimum}
            onChange={(event) =>
              onChangeFrom(Math.min(Number(event.target.value), toValue))
            }
            step={step}
            type="range"
            value={fromValue}
          />
          <input
            aria-label={maximumAria}
            aria-valuetext={toLabel}
            max={maximum}
            min={minimum}
            onChange={(event) =>
              onChangeTo(Math.max(Number(event.target.value), fromValue))
            }
            step={step}
            type="range"
            value={toValue}
          />
        </div>
        <div className="-mt-1 flex justify-between text-[11px] font-semibold tabular-nums text-ink-muted">
          <span>{fromLabel}</span>
          <span>{toLabel}</span>
        </div>
      </div>
    </div>
  );
}

export function AnalysisFilters({
  filters,
  available,
  locale,
  onChange,
  onReset,
}: AnalysisFiltersProps) {
  const copy = analysisCopy[locale].filters;

  const latestYear = available.years.length
    ? Math.max(...available.years.map(({ value }) => value))
    : new Date().getFullYear();
  const selectedMinimumYear = Math.max(
    filters.minYear ?? earliestModelYear,
    earliestModelYear,
  );
  const selectedMaximumYear = Math.min(filters.maxYear ?? latestYear, latestYear);

  const minimumMileagePosition =
    filters.minMileageMil === null
      ? 0
      : Math.round(filters.minMileageMil / mileageStepMil);
  const maximumMileagePosition =
    filters.maxMileageMil === null
      ? mileageSliderMaximum
      : Math.round(filters.maxMileageMil / mileageStepMil);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-3 lg:grid-cols-6">
      <MultiChoiceDropdown
        clearLabel={copy.clear}
        doneLabel={copy.done}
        label={copy.brand}
        menuHeight={440}
        noResultsLabel={copy.noMatches}
        onChange={(brands) => onChange({ ...filters, brands, models: [] }, 0)}
        options={available.brands.map(({ value, count }) => ({
          value,
          label: value,
          count,
        }))}
        placeholder={copy.allBrands}
        renderIcon={(brand) =>
          brand ? (
            <BrandLogo className="size-6.5" make={brand} />
          ) : (
            <ManufacturerIcon className="size-3.5" />
          )
        }
        searchable
        searchPlaceholder={copy.searchBrands}
        selectedCountLabel={copy.selected}
        values={filters.brands}
      />

      <MultiChoiceDropdown
        clearLabel={copy.clear}
        disabled={available.models.length === 0}
        doneLabel={copy.done}
        label={copy.model}
        noResultsLabel={copy.noMatches}
        onChange={(models) => onChange({ ...filters, models }, 0)}
        options={available.models.map(({ value, count }) => ({
          value,
          label: value,
          count,
        }))}
        placeholder={copy.allModels}
        renderIcon={() => <VehicleModelIcon className="size-3.5" />}
        searchable
        searchPlaceholder={copy.searchModels}
        selectedCountLabel={copy.selected}
        values={filters.models}
      />

      <CompactDropdown
        label={copy.fuel}
        noResultsLabel={copy.noMatches}
        onChange={(value) =>
          onChange({ ...filters, fuelType: value as FuelType | "" }, 0)
        }
        options={[
          { value: "", label: copy.any },
          ...fuels.map((fuel) => ({ value: fuel, label: copy.fuels[fuel] })),
        ]}
        renderIcon={(value) => <FuelIcon value={value} />}
        value={filters.fuelType}
      />

      <CompactDropdown
        label={copy.gearbox}
        noResultsLabel={copy.noMatches}
        onChange={(value) =>
          onChange(
            { ...filters, transmission: value as TransmissionType | "" },
            0,
          )
        }
        options={[
          { value: "", label: copy.any },
          ...gearboxes.map((gearbox) => ({
            value: gearbox,
            label: copy.gearboxes[gearbox],
          })),
        ]}
        renderIcon={(value) =>
          value === "manual" ? (
            <ManualTransmissionIcon className="size-4" />
          ) : value === "automatic" ? (
            <AutomaticTransmissionIcon className="size-4" />
          ) : (
            <AllOptionsIcon className="size-3.5" />
          )
        }
        value={filters.transmission}
      />

      <RangeFilter
        fromLabel={String(selectedMinimumYear)}
        fromValue={selectedMinimumYear}
        label={copy.year}
        maximum={latestYear}
        maximumAria={`${copy.year} — max`}
        minimum={earliestModelYear}
        minimumAria={`${copy.year} — min`}
        onChangeFrom={(value) =>
          onChange(
            { ...filters, minYear: value === earliestModelYear ? null : value },
            220,
          )
        }
        onChangeTo={(value) =>
          onChange({ ...filters, maxYear: value === latestYear ? null : value }, 220)
        }
        step={1}
        toLabel={String(selectedMaximumYear)}
        toValue={selectedMaximumYear}
      />

      <RangeFilter
        fromLabel={formatNumber(minimumMileagePosition * mileageStepMil, locale)}
        fromValue={minimumMileagePosition}
        label={`${copy.mileage} (mil)`}
        maximum={mileageSliderMaximum}
        maximumAria={`${copy.mileage} — max`}
        minimum={0}
        minimumAria={`${copy.mileage} — min`}
        onChangeFrom={(position) =>
          onChange(
            {
              ...filters,
              minMileageMil: position === 0 ? null : position * mileageStepMil,
            },
            220,
          )
        }
        onChangeTo={(position) =>
          onChange(
            {
              ...filters,
              maxMileageMil:
                position === mileageSliderMaximum
                  ? null
                  : position * mileageStepMil,
            },
            220,
          )
        }
        step={1}
        toLabel={
          maximumMileagePosition === mileageSliderMaximum
            ? `${formatNumber(maximumMileageMil, locale)}+`
            : formatNumber(maximumMileagePosition * mileageStepMil, locale)
        }
        toValue={maximumMileagePosition}
      />

      {hasActiveAnalysisFilters(filters) ? (
        <button
          className="col-span-2 -mt-1 justify-self-start rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-ink md:col-span-3 lg:col-span-6"
          onClick={onReset}
          type="button"
        >
          {copy.reset}
        </button>
      ) : null}
    </div>
  );
}
