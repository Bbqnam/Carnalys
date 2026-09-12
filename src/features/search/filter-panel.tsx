import type { FuelType, SellerType, TransmissionType } from "@/domain/vehicle";
import { brandOptionMatchesQuery } from "@/domain/vehicle/taxonomy/brand-search";
import { listingSources } from "@/infrastructure/marketplaces/source-registry";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { uiCopy, type Locale } from "./copy";
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
  ChevronDownIcon,
  MapPinIcon,
} from "./icons";
import { MultiChoiceDropdown } from "./multi-choice-dropdown";
import { SourceMark } from "@/features/source/source-logo";
import type { SearchFilters, VehicleFilterOption } from "./types";
import type { LocationStatus, UserLocation } from "./use-current-location";

/**
 * A budget field you can actually finish typing in.
 *
 * The pair used to be controlled straight off the committed filter, and every
 * keystroke both re-ran the search and passed the half-typed number through
 * `Math.min`/`Math.max` against the other end of the range. Typing "500000"
 * into the maximum while a minimum of 100000 was set turned the first
 * keystroke into "100000" and you were typing into the middle of that; typing
 * a leading zero anywhere cleared the field, because zero commits as "no
 * bound" and no bound renders as empty.
 *
 * So the keystrokes go into a local draft that nothing clamps and nothing
 * queries. The value is committed — clamped, and handed upwards — when the
 * field is left, when Enter is pressed, or after a pause long enough to mean
 * the typing has stopped. While the field is focused, incoming props are
 * ignored, so a result landing from an earlier commit can never overwrite
 * what is being typed now.
 */
function BudgetInput({
  ariaLabel,
  commitDelayMs = 600,
  onCommit,
  placeholder,
  value,
}: {
  ariaLabel: string;
  commitDelayMs?: number;
  onCommit: (digits: string) => void;
  placeholder: string;
  value: number | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function commit(digits: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onCommit(digits);
  }

  return (
    <input
      aria-label={ariaLabel}
      className="h-full w-full min-w-0 bg-transparent outline-none"
      inputMode="numeric"
      onBlur={(event) => {
        focused.current = false;
        setDraft(null);
        commit(event.target.value.replace(/\D/g, ""));
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "");
        setDraft(digits);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(digits), commitDelayMs);
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value.replace(/\D/g, ""));
        }
      }}
      placeholder={placeholder}
      type="text"
      value={draft ?? (value ?? "")}
    />
  );
}

interface FilterPanelProps {
  locale: Locale;
  filters: SearchFilters;
  brands: readonly VehicleFilterOption<string>[];
  models: readonly VehicleFilterOption<string>[];
  years: readonly VehicleFilterOption<number>[];
  resultCount: number;
  onChange: (filters: SearchFilters) => void;
  onReset: () => void;
  currentLocation?: UserLocation;
  locationStatus?: LocationStatus;
  onRequestLocation?: () => void;
}

const minimumDistanceKm = 100;
const maximumDistanceKm = 1_000;
const distanceStepKm = 50;
const distanceSliderMaximum = (maximumDistanceKm - minimumDistanceKm) / distanceStepKm;

function distanceForSliderPosition(position: number) {
  return minimumDistanceKm + position * distanceStepKm;
}

function sliderPositionForDistance(km: number) {
  return Math.round((km - minimumDistanceKm) / distanceStepKm);
}

const fuels = [
  "electric",
  "plug_in_hybrid",
  "self_charging_hybrid",
  "petrol",
  "diesel",
] as const satisfies readonly FuelType[];

const transmissions = ["automatic", "manual"] as const satisfies readonly TransmissionType[];
const sellerTypeOptions = ["dealer", "private"] as const satisfies readonly SellerType[];
// Derived from the source registry so a new importer appears in the filter the
// moment it is registered — no second list to keep in sync.
const sourceOptions = Object.values(listingSources).map((source) => ({
  value: source.key,
  label: source.displayName,
}));
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
      <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function isSelected(selected: boolean) {
  return selected
    ? "border-accent/50 bg-accent-soft text-accent-strong shadow-sm"
    : "border-border bg-surface hover:border-border-strong hover:bg-surface-subtle";
}

function IconChoiceButton({
  label,
  selected,
  children,
  onClick,
  tone = "text-ink-muted",
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
      className={`group relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-center transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10 ${isSelected(selected)} ${selected ? "" : tone}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className="grid h-7 place-items-center">
        {children}
      </span>
      <span className="min-w-0 max-w-full truncate text-[10px] font-bold leading-tight">
        {label}
      </span>
    </button>
  );
}

function FuelChoiceIcon({ fuel }: { fuel: (typeof fuels)[number] }) {
  const className = "size-6";

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
      return "text-filter-electric";
    case "plug_in_hybrid":
      return "text-filter-plug-in";
    case "self_charging_hybrid":
      return "text-filter-hybrid";
    case "petrol":
      return "text-filter-petrol";
    case "diesel":
      return "text-filter-diesel";
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

export function FilterPanel({
  locale,
  filters,
  brands,
  models,
  years,
  resultCount,
  onChange,
  onReset,
  currentLocation,
  locationStatus,
  onRequestLocation,
}: FilterPanelProps) {
  const copy = uiCopy[locale].filters;
  const locationCopy = uiCopy[locale].results;
  const advancedFilterCount = [
    filters.fuelType,
    filters.transmission,
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
  const distancePosition =
    filters.maxDistanceKm === null
      ? distanceSliderMaximum
      : Math.min(distanceSliderMaximum, Math.max(0, sliderPositionForDistance(filters.maxDistanceKm)));
  const distanceLabel =
    filters.maxDistanceKm === null ? copy.anyDistance : copy.withinKm(filters.maxDistanceKm);
  const locationLabel =
    locationStatus === "locating"
      ? locationCopy.locating
      : locationStatus === "denied"
        ? locationCopy.locationDenied
        : locationStatus === "unavailable"
          ? locationCopy.locationUnavailable
          : locationCopy.useCurrentLocation;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-ink">
            {copy.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            {copy.resultCount(resultCount)}
          </p>
        </div>
        <button
          className="rounded-full border border-transparent px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-border hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
          disabled={!hasActiveFilters}
          onClick={onReset}
          type="button"
        >
          {copy.reset}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <FilterGroup className="order-2" label={copy.budget}>
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
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
              <label className="flex h-9 flex-1 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold tabular-nums text-ink-muted focus-within:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                <BudgetInput
                  ariaLabel={copy.minimumBudget}
                  onCommit={(digits) => {
                    const amount = digits === "" ? 0 : Math.min(Number(digits), selectedMaximum);
                    onChange({ ...filters, minPrice: amount === 0 ? null : amount });
                  }}
                  placeholder="0"
                  value={filters.minPrice}
                />
                <span className="shrink-0 text-ink-subtle">SEK</span>
              </label>
              <span className="shrink-0 text-ink-subtle">–</span>
              <label className="flex h-9 flex-1 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold tabular-nums text-ink-muted focus-within:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                <BudgetInput
                  ariaLabel={copy.maximumBudget}
                  onCommit={(digits) => {
                    const amount =
                      digits === "" ? maxBudget : Math.max(Number(digits), selectedMinimum);
                    onChange({
                      ...filters,
                      maxPrice: amount >= maxBudget ? null : amount,
                    });
                  }}
                  placeholder={`${maximumBudget.toLocaleString(formatLocale)}+`}
                  value={filters.maxPrice}
                />
                <span className="shrink-0 text-ink-subtle">SEK</span>
              </label>
            </div>
          </div>
        </FilterGroup>

        <div className="order-1 space-y-2">
          <MultiChoiceDropdown
            clearLabel={copy.clearSelection}
            doneLabel={copy.done}
            label={copy.make}
            menuHeight={430}
            noResultsLabel={copy.noMatches}
            matchExtra={(searchQuery, option) => brandOptionMatchesQuery(option.value, searchQuery)}
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

        <FilterGroup className="order-1" label={copy.seller}>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              className={`flex h-9 items-center justify-center rounded-xl border text-xs font-semibold transition ${isSelected(!filters.sellerType)}`}
              onClick={() => onChange({ ...filters, sellerType: "" })}
              type="button"
            >
              {copy.any}
            </button>
            {sellerTypeOptions.map((type) => (
              <button
                className={`flex h-9 items-center justify-center rounded-xl border text-xs font-semibold transition ${isSelected(filters.sellerType === type)}`}
                key={type}
                onClick={() => onChange({ ...filters, sellerType: type })}
                type="button"
              >
                {copy.sellerTypes[type]}
              </button>
            ))}
          </div>
        </FilterGroup>

        <div className="order-1">
          <MultiChoiceDropdown
            clearLabel={copy.clearSelection}
            doneLabel={copy.done}
            label={locale === "en" ? "Source" : "Källa"}
            menuHeight={240}
            noResultsLabel={copy.noMatches}
            onChange={(sources) => onChange({ ...filters, sources })}
            options={sourceOptions}
            placeholder={locale === "en" ? "All sources" : "Alla källor"}
            iconWide
            hideLabels
            renderIcon={(source) =>
              source ? <SourceMark provider={source} /> : null
            }
            selectedCountLabel={copy.selected}
            values={filters.sources}
          />
        </div>

        <button
          aria-expanded={showMoreFilters}
          className="order-5 -mb-0.5 flex h-9 w-full items-center justify-between rounded-xl border border-border bg-surface-subtle px-3 text-xs font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted"
          onClick={() => setShowMoreFilters((current) => !current)}
          type="button"
        >
          <span>{copy.moreFilters}{advancedFiltersActive ? ` · ${advancedFilterCount}` : ""}</span>
          <ChevronDownIcon className={`size-3.5 transition-transform ${showMoreFilters ? "rotate-180" : ""}`} />
        </button>

        <FilterGroup className={`order-7 ${showMoreFilters ? "" : "hidden"}`} label={copy.fuel}>
          <div className="grid grid-cols-3 gap-1.5">
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
                tone={
                  transmission === "automatic"
                    ? "text-filter-electric"
                    : "text-filter-manual"
                }
                onClick={() => onChange({ ...filters, transmission })}
              >
                <TransmissionChoiceIcon transmission={transmission} />
              </IconChoiceButton>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup className="order-3" label={copy.year}>
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
            <div className="budget-range" style={{ "--budget-start": `${((selectedMinimumYear - earliestYear) / Math.max(1, latestYear - earliestYear)) * 100}%`, "--budget-end": `${((selectedMaximumYear - earliestYear) / Math.max(1, latestYear - earliestYear)) * 100}%` } as React.CSSProperties}>
              <span aria-hidden="true" className="budget-range-track" />
              <input aria-label={`${copy.minimum} ${copy.year}`} max={latestYear} min={earliestYear} onChange={(event) => { const value = Math.min(Number(event.target.value), selectedMaximumYear); onChange({ ...filters, minYear: value === earliestYear ? null : value }); }} step={1} type="range" value={selectedMinimumYear} />
              <input aria-label={`${copy.maximum} ${copy.year}`} max={latestYear} min={earliestYear} onChange={(event) => { const value = Math.max(Number(event.target.value), selectedMinimumYear); onChange({ ...filters, maxYear: value === latestYear ? null : value }); }} step={1} type="range" value={selectedMaximumYear} />
            </div>
            <div className="mt-1 flex justify-between text-xs font-semibold tabular-nums text-ink-muted"><span>{selectedMinimumYear}</span><span>{selectedMaximumYear}</span></div>
          </div>
        </FilterGroup>

        <FilterGroup className="order-4" label={copy.mileage}>
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
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
            <div className="mt-1 flex justify-between text-xs font-semibold tabular-nums text-ink-muted">
              <span>{selectedMinimumMileageLabel}</span>
              <span>{selectedMaximumMileageLabel}</span>
            </div>
          </div>
        </FilterGroup>

        <FilterGroup className="order-6" label={copy.distance}>
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
            {currentLocation ? (
              <>
                <div
                  className="budget-range"
                  style={{ "--budget-start": "0%", "--budget-end": `${(distancePosition / distanceSliderMaximum) * 100}%` } as React.CSSProperties}
                >
                  <span aria-hidden="true" className="budget-range-track" />
                  <input
                    aria-label={copy.distance}
                    aria-valuetext={distanceLabel}
                    max={distanceSliderMaximum}
                    min={0}
                    onChange={(event) => {
                      const position = Number(event.target.value);
                      const atMaximum = position >= distanceSliderMaximum;
                      onChange({
                        ...filters,
                        maxDistanceKm: atMaximum ? null : distanceForSliderPosition(position),
                        originLatitude: atMaximum ? null : currentLocation.latitude,
                        originLongitude: atMaximum ? null : currentLocation.longitude,
                      });
                    }}
                    step={1}
                    type="range"
                    value={distancePosition}
                  />
                </div>
                <div className="mt-1 text-xs font-semibold tabular-nums text-ink-muted">
                  {distanceLabel}
                </div>
              </>
            ) : (
              <button
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-ink-muted transition hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!onRequestLocation || locationStatus === "locating"}
                onClick={onRequestLocation}
                type="button"
              >
                <MapPinIcon className="size-3.5" />
                {locationStatus === "locating" ? locationLabel : copy.enableLocationToFilter}
              </button>
            )}
          </div>
        </FilterGroup>

      </div>
    </div>
  );
}
