import type { BodyStyle, FuelType, TransmissionType } from "@/domain/vehicle";
import { useState } from "react";
import { BrandLogo } from "./brand-logo";
import { uiCopy, type Locale } from "./copy";
import {
  AllOptionsIcon,
  AutomaticTransmissionIcon,
  DieselFuelIcon,
  ElectricFuelIcon,
  EstateBodyIcon,
  HatchbackBodyIcon,
  HybridFuelIcon,
  ManualTransmissionIcon,
  ManufacturerIcon,
  PetrolFuelIcon,
  PlugInFuelIcon,
  SedanBodyIcon,
  SuvBodyIcon,
  VehicleModelIcon,
  ChevronDownIcon,
} from "./icons";
import { MultiChoiceDropdown } from "./multi-choice-dropdown";
import type { SearchFilters, VehicleFilterOption } from "./types";

interface FilterPanelProps {
  locale: Locale;
  filters: SearchFilters;
  brands: readonly VehicleFilterOption<string>[];
  models: readonly VehicleFilterOption<string>[];
  years: readonly VehicleFilterOption<number>[];
  resultCount: number;
  onChange: (filters: SearchFilters) => void;
  onReset: () => void;
}

const fuels = [
  "electric",
  "plug_in_hybrid",
  "self_charging_hybrid",
  "petrol",
  "diesel",
] as const satisfies readonly FuelType[];

const transmissions = ["automatic", "manual"] as const satisfies readonly TransmissionType[];
const bodyStyles = ["estate", "suv", "sedan", "hatchback"] as const satisfies readonly BodyStyle[];
const budgetSliderMaximum = 1_000;
const maximumBudget = 500_000;
const maximumMileageMil = 30_000;
const mileageStepMil = 100;
const mileageSliderMaximum = maximumMileageMil / mileageStepMil;
const minimumModelYear = 1990;

function sliderPositionForPrice(price: number, maximum: number) {
  if (maximum <= 0) return 0;
  const ratio = Math.max(0, Math.min(price, maximum)) / maximum;
  return Math.round(Math.cbrt(ratio) * budgetSliderMaximum);
}

/**
 * No increment rounding here (unlike mileage's flat step) — snapping to a
 * coarse increment made round-tripping position -> price -> position
 * non-monotonic, so the controlled slider value would visibly stick or
 * jump mid-drag. Rounding to the nearest whole SEK keeps the mapping
 * dense and smooth; typed values in the number inputs can still land on
 * any exact figure the user wants.
 */
function priceForSliderPosition(position: number, maximum: number) {
  const ratio = position / budgetSliderMaximum;
  return Math.round(ratio ** 3 * maximum);
}

function FilterGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-[#737c76]">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function isSelected(selected: boolean) {
  return selected
    ? "border-[#a9bcae] bg-[#eaf2ed] text-[#214b36] shadow-sm"
    : "border-[#dde0da] bg-white hover:border-[#aebdb2] hover:bg-[#f8faf7]";
}

function IconChoiceButton({
  label,
  selected,
  children,
  onClick,
  tone = "text-[#4f5b53]",
}: {
  label: string;
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className={`group relative grid min-h-10 min-w-0 place-items-center rounded-xl border transition duration-200 focus-visible:outline-none ${isSelected(selected)} ${selected ? "" : tone}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

function FuelChoiceIcon({ fuel }: { fuel: (typeof fuels)[number] }) {
  const className = "size-5";

  switch (fuel) {
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
  }
}

function fuelIconTone(fuel: (typeof fuels)[number]) {
  switch (fuel) {
    case "electric":
      return "text-[#487d91]";
    case "plug_in_hybrid":
      return "text-[#47796d]";
    case "self_charging_hybrid":
      return "text-[#5d7e55]";
    case "petrol":
      return "text-[#8a6948]";
    case "diesel":
      return "text-[#596b7b]";
  }
}

function TransmissionChoiceIcon({
  transmission,
}: {
  transmission: (typeof transmissions)[number];
}) {
  return transmission === "automatic" ? (
    <AutomaticTransmissionIcon className="size-6" />
  ) : (
    <ManualTransmissionIcon className="size-6" />
  );
}

function BodyChoiceIcon({ bodyStyle }: { bodyStyle: (typeof bodyStyles)[number] }) {
  const className = "h-7 w-11";

  switch (bodyStyle) {
    case "estate":
      return <EstateBodyIcon className={className} />;
    case "suv":
      return <SuvBodyIcon className={className} />;
    case "sedan":
      return <SedanBodyIcon className={className} />;
    case "hatchback":
      return <HatchbackBodyIcon className={className} />;
  }
}

export function FilterPanel({
  locale,
  filters,
  brands,
  models,
  years,
  resultCount,
  onChange,
  onReset,
}: FilterPanelProps) {
  const copy = uiCopy[locale].filters;
  const advancedFilterCount = [
    filters.fuelType,
    filters.transmission,
    filters.bodyStyle,
  ].filter(Boolean).length;
  const advancedFiltersActive = advancedFilterCount > 0;
  const [showMoreFilters, setShowMoreFilters] = useState(advancedFiltersActive);
  const formatLocale = locale === "en" ? "en-SE" : "sv-SE";
  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) =>
      key !== "query" &&
      (Array.isArray(value) ? value.length > 0 : value !== "" && value !== null),
  );
  const maxBudget = maximumBudget;
  const selectedMinimum = filters.minPrice ?? 0;
  const selectedMaximum = filters.maxPrice ?? maxBudget;
  const minimumPosition = sliderPositionForPrice(selectedMinimum, maxBudget);
  const maximumPosition = sliderPositionForPrice(selectedMaximum, maxBudget);
  const selectedMinimumLabel =
    filters.minPrice !== null
      ? `${filters.minPrice.toLocaleString(formatLocale)} SEK`
      : copy.noMinimum;
  const selectedMaximumLabel =
    filters.maxPrice !== null
      ? `${filters.maxPrice.toLocaleString(formatLocale)} SEK`
      : copy.noMaximum;
  const minimumMileagePosition =
    filters.minMileageMil === null
      ? 0
      : Math.max(0, Math.round(filters.minMileageMil / mileageStepMil));
  const maximumMileagePosition =
    filters.maxMileageMil === null
      ? mileageSliderMaximum
      : Math.min(
          mileageSliderMaximum,
          Math.round(filters.maxMileageMil / mileageStepMil),
        );
  const selectedMinimumMileageLabel =
    filters.minMileageMil === null
      ? "0 mil"
      : `${filters.minMileageMil.toLocaleString(formatLocale)} mil`;
  const selectedMaximumMileageLabel =
    filters.maxMileageMil === null
      ? "30 000 mil+"
      : `${filters.maxMileageMil.toLocaleString(formatLocale)} mil`;
  const brandOptions = brands.map(({ value, count }) => ({
    value,
    label: value,
    count,
  }));
  const modelOptions = models.map(({ value, count }) => ({
    value,
    label: value,
    count,
  }));
  const availableYears = years.map(({ value }) => value);
  const earliestYear = minimumModelYear;
  const latestYear = availableYears.length
    ? Math.max(...availableYears)
    : new Date().getFullYear();
  const selectedMinimumYear = Math.max(filters.minYear ?? earliestYear, earliestYear);
  const selectedMaximumYear = filters.maxYear ?? latestYear;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[#18231d]">
            {copy.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-[#818a84]">
            {copy.resultCount(resultCount)}
          </p>
        </div>
        <button
          className="rounded-full border border-transparent px-2.5 py-1.5 text-xs font-semibold text-[#59665e] transition hover:border-[#d9ddd7] hover:bg-[#f6f7f3] hover:text-[#18231d] disabled:cursor-not-allowed disabled:opacity-35"
          disabled={!hasActiveFilters}
          onClick={onReset}
          type="button"
        >
          {copy.reset}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <FilterGroup className="order-2" label={copy.budget}>
          <div className="rounded-2xl border border-[#eaebe7] bg-[#f8f8f5] px-3.5 py-2.5">
            <div
              className="budget-range"
              style={{
                "--budget-start": `${minimumPosition / 10}%`,
                "--budget-end": `${maximumPosition / 10}%`,
              } as React.CSSProperties}
            >
              <span aria-hidden="true" className="budget-range-track" />
              <input
                aria-label={copy.minimumBudget}
                aria-valuetext={selectedMinimumLabel}
                max={budgetSliderMaximum}
                min={0}
                onChange={(event) => {
                  const position = Math.min(Number(event.target.value), maximumPosition);
                  const amount = priceForSliderPosition(position, maxBudget);
                  onChange({ ...filters, minPrice: amount === 0 ? null : amount });
                }}
                step={1}
                type="range"
                value={minimumPosition}
              />
              <input
                aria-label={copy.maximumBudget}
                aria-valuetext={selectedMaximumLabel}
                max={budgetSliderMaximum}
                min={0}
                onChange={(event) => {
                  const position = Math.max(Number(event.target.value), minimumPosition);
                  const amount = priceForSliderPosition(position, maxBudget);
                  onChange({
                    ...filters,
                    maxPrice: position === budgetSliderMaximum ? null : amount,
                  });
                }}
                step={1}
                type="range"
                value={maximumPosition}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex h-9 flex-1 items-center gap-1 rounded-lg border border-[#dedfd9] bg-white px-2.5 text-xs font-semibold tabular-nums text-[#56635b] focus-within:border-[#9eafa4]">
                <span className="sr-only">{copy.minimumBudget}</span>
                <input
                  className="w-full min-w-0 bg-transparent outline-none"
                  inputMode="numeric"
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");
                    const amount = digits === "" ? 0 : Math.min(Number(digits), selectedMaximum);
                    onChange({ ...filters, minPrice: amount === 0 ? null : amount });
                  }}
                  placeholder="0"
                  type="text"
                  value={filters.minPrice ?? ""}
                />
                <span className="shrink-0 text-[#8a918c]">SEK</span>
              </label>
              <span className="shrink-0 text-[#c5c8c4]">–</span>
              <label className="flex h-9 flex-1 items-center gap-1 rounded-lg border border-[#dedfd9] bg-white px-2.5 text-xs font-semibold tabular-nums text-[#56635b] focus-within:border-[#9eafa4]">
                <span className="sr-only">{copy.maximumBudget}</span>
                <input
                  className="w-full min-w-0 bg-transparent outline-none"
                  inputMode="numeric"
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");
                    const amount =
                      digits === "" ? maxBudget : Math.max(Number(digits), selectedMinimum);
                    onChange({
                      ...filters,
                      maxPrice: amount >= maxBudget ? null : amount,
                    });
                  }}
                  placeholder={copy.noMaximum}
                  type="text"
                  value={filters.maxPrice ?? ""}
                />
                <span className="shrink-0 text-[#8a918c]">SEK</span>
              </label>
            </div>
          </div>
        </FilterGroup>

        <div className="order-1 space-y-3">
          <MultiChoiceDropdown
            clearLabel={copy.clearSelection}
            doneLabel={copy.done}
            label={copy.make}
            menuHeight={520}
            noResultsLabel={copy.noMatches}
            onChange={(brands) => onChange({ ...filters, brands, models: [] })}
            options={brandOptions}
            placeholder={copy.allMakes}
            renderIcon={(brand) =>
              brand ? (
                <BrandLogo className="size-6.5" make={brand} />
              ) : (
                <ManufacturerIcon className="size-3.5" />
              )
            }
            searchable
            searchPlaceholder={copy.searchMakes}
            selectedCountLabel={copy.selected}
            values={filters.brands}
          />
          <MultiChoiceDropdown
            clearLabel={copy.clearSelection}
            disabled={models.length === 0}
            doneLabel={copy.done}
            label={copy.model}
            noResultsLabel={copy.noMatches}
            onChange={(models) => onChange({ ...filters, models })}
            options={modelOptions}
            placeholder={copy.allModels}
            renderIcon={() => <VehicleModelIcon className="size-3.5" />}
            searchable
            searchPlaceholder={copy.searchModels}
            selectedCountLabel={copy.selected}
            values={filters.models}
          />
        </div>

        <button
          aria-expanded={showMoreFilters}
          className="sticky bottom-0 z-20 order-5 flex h-10 w-full items-center justify-between rounded-xl border border-[#dde1db] bg-[#f7f8f5]/95 px-3 text-xs font-semibold text-[#344239] shadow-[0_4px_14px_rgba(26,35,29,0.08)] backdrop-blur-sm transition hover:border-[#b8c2ba] hover:bg-[#f1f4f0]"
          onClick={() => setShowMoreFilters((current) => !current)}
          type="button"
        >
          <span>{copy.moreFilters}{advancedFiltersActive ? ` · ${advancedFilterCount}` : ""}</span>
          <ChevronDownIcon className={`size-3.5 transition-transform ${showMoreFilters ? "rotate-180" : ""}`} />
        </button>

        <FilterGroup className={`order-7 ${showMoreFilters ? "" : "hidden"}`} label={copy.fuel}>
          <div className="grid grid-cols-6 gap-1">
            <IconChoiceButton
              label={copy.any}
              selected={!filters.fuelType}
              onClick={() => onChange({ ...filters, fuelType: "" })}
            >
              <AllOptionsIcon className="size-5" />
            </IconChoiceButton>
            {fuels.map((fuel) => (
              <IconChoiceButton
                key={fuel}
                label={copy.fuels[fuel]}
                selected={filters.fuelType === fuel}
                tone={fuelIconTone(fuel)}
                onClick={() => onChange({ ...filters, fuelType: fuel })}
              >
                <FuelChoiceIcon fuel={fuel} />
              </IconChoiceButton>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup className={`order-8 ${showMoreFilters ? "" : "hidden"}`} label={copy.transmission}>
          <div className="grid grid-cols-3 gap-1.5">
            <IconChoiceButton
              label={copy.any}
              selected={!filters.transmission}
              onClick={() => onChange({ ...filters, transmission: "" })}
            >
              <AllOptionsIcon className="size-5" />
            </IconChoiceButton>
            {transmissions.map((transmission) => (
              <IconChoiceButton
                key={transmission}
                label={copy.transmissions[transmission]}
                selected={filters.transmission === transmission}
                tone={transmission === "automatic" ? "text-[#52768a]" : "text-[#6b665b]"}
                onClick={() => onChange({ ...filters, transmission })}
              >
                <TransmissionChoiceIcon transmission={transmission} />
              </IconChoiceButton>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup className="order-3" label={copy.year}>
          <div className="rounded-2xl border border-[#eaebe7] bg-[#f8f8f5] px-3.5 py-2.5">
            <div className="budget-range" style={{ "--budget-start": `${((selectedMinimumYear - earliestYear) / Math.max(1, latestYear - earliestYear)) * 100}%`, "--budget-end": `${((selectedMaximumYear - earliestYear) / Math.max(1, latestYear - earliestYear)) * 100}%` } as React.CSSProperties}>
              <span aria-hidden="true" className="budget-range-track" />
              <input aria-label={`${copy.minimum} ${copy.year}`} max={latestYear} min={earliestYear} onChange={(event) => { const value = Math.min(Number(event.target.value), selectedMaximumYear); onChange({ ...filters, minYear: value === earliestYear ? null : value }); }} step={1} type="range" value={selectedMinimumYear} />
              <input aria-label={`${copy.maximum} ${copy.year}`} max={latestYear} min={earliestYear} onChange={(event) => { const value = Math.max(Number(event.target.value), selectedMinimumYear); onChange({ ...filters, maxYear: value === latestYear ? null : value }); }} step={1} type="range" value={selectedMaximumYear} />
            </div>
            <div className="mt-1 flex justify-between text-xs font-semibold tabular-nums text-[#56635b]"><span>{selectedMinimumYear}</span><span>{selectedMaximumYear}</span></div>
          </div>
        </FilterGroup>

        <FilterGroup className="order-4" label={copy.mileage}>
          <div className="rounded-2xl border border-[#eaebe7] bg-[#f8f8f5] px-3.5 py-2.5">
            <div
              className="budget-range"
              style={{
                "--budget-start": `${(minimumMileagePosition / mileageSliderMaximum) * 100}%`,
                "--budget-end": `${(maximumMileagePosition / mileageSliderMaximum) * 100}%`,
              } as React.CSSProperties}
            >
              <span aria-hidden="true" className="budget-range-track" />
              <input
                aria-label={`${copy.minimum} ${copy.mileage}`}
                aria-valuetext={selectedMinimumMileageLabel}
                max={mileageSliderMaximum}
                min={0}
                onChange={(event) => {
                  const position = Math.min(Number(event.target.value), maximumMileagePosition);
                  onChange({
                    ...filters,
                    minMileageMil: position === 0 ? null : position * mileageStepMil,
                  });
                }}
                step={1}
                type="range"
                value={minimumMileagePosition}
              />
              <input
                aria-label={`${copy.maximum} ${copy.mileage}`}
                aria-valuetext={selectedMaximumMileageLabel}
                max={mileageSliderMaximum}
                min={0}
                onChange={(event) => {
                  const position = Math.max(Number(event.target.value), minimumMileagePosition);
                  onChange({ ...filters, maxMileageMil: position === mileageSliderMaximum ? null : position * mileageStepMil });
                }}
                step={1}
                type="range"
                value={maximumMileagePosition}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs font-semibold tabular-nums text-[#56635b]">
              <span>{selectedMinimumMileageLabel}</span>
              <span>{selectedMaximumMileageLabel}</span>
            </div>
          </div>
        </FilterGroup>

        <FilterGroup className={`order-6 ${showMoreFilters ? "" : "hidden"}`} label={copy.body}>
          <div className="grid grid-cols-4 gap-1.5">
            {bodyStyles.map((bodyStyle) => (
              <IconChoiceButton
                key={bodyStyle}
                label={copy.bodies[bodyStyle]}
                selected={filters.bodyStyle === bodyStyle}
                tone="text-[#536e5e]"
                onClick={() =>
                  onChange({
                    ...filters,
                    bodyStyle: filters.bodyStyle === bodyStyle ? "" : bodyStyle,
                  })
                }
              >
                <BodyChoiceIcon bodyStyle={bodyStyle} />
              </IconChoiceButton>
            ))}
          </div>
        </FilterGroup>
      </div>
    </div>
  );
}
