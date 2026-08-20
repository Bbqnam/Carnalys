import type { BodyStyle, FuelType, TransmissionType } from "@/domain/vehicle";
import { BrandLogo } from "./brand-logo";
import { CompactDropdown } from "./compact-dropdown";
import { uiCopy, type Locale } from "./copy";
import {
  AllOptionsIcon,
  AutomaticTransmissionIcon,
  CalendarFilterIcon,
  DieselFuelIcon,
  ElectricFuelIcon,
  EstateBodyIcon,
  HatchbackBodyIcon,
  HybridFuelIcon,
  ManualTransmissionIcon,
  ManufacturerIcon,
  OdometerIcon,
  PetrolFuelIcon,
  PlugInFuelIcon,
  SedanBodyIcon,
  SuvBodyIcon,
  VehicleModelIcon,
} from "./icons";
import type { SearchFilters } from "./types";

interface FilterPanelProps {
  locale: Locale;
  filters: SearchFilters;
  brands: readonly string[];
  models: readonly string[];
  budgetRange: {
    minimum: number;
    maximum: number;
  };
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

function budgetIncrement(maximum: number) {
  if (maximum <= 1_000_000) return 5_000;
  if (maximum <= 10_000_000) return 25_000;
  return 50_000;
}

function sliderPositionForPrice(price: number, maximum: number) {
  if (maximum <= 0) return 0;
  const ratio = Math.max(0, Math.min(price, maximum)) / maximum;
  return Math.round(Math.cbrt(ratio) * budgetSliderMaximum);
}

function priceForSliderPosition(position: number, maximum: number) {
  const ratio = position / budgetSliderMaximum;
  const increment = budgetIncrement(maximum);
  return Math.round((ratio ** 3 * maximum) / increment) * increment;
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
    ? "border-[#264b36] bg-[#254934] text-white shadow-sm"
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
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#17221c] px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
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
  budgetRange,
  onChange,
  onReset,
}: FilterPanelProps) {
  const copy = uiCopy[locale].filters;
  const formatLocale = locale === "en" ? "en-SE" : "sv-SE";
  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) => key !== "query" && value !== "" && value !== null,
  );
  const maxBudget = Math.max(
    100_000,
    Math.ceil(budgetRange.maximum / 100_000) * 100_000,
  );
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
  const brandOptions = [
    { value: "", label: copy.allMakes },
    ...brands.map((brand) => ({ value: brand, label: brand })),
  ];
  const modelOptions = [
    { value: "", label: copy.allModels },
    ...models.map((model) => ({ value: model, label: model })),
  ];
  const yearOptions = [
    { value: "", label: copy.anyYear },
    ...[2023, 2022, 2021, 2020, 2019].map((year) => ({
      value: year.toString(),
      label: year.toString(),
    })),
  ];
  const mileageOptions = [
    { value: "", label: copy.anyMileage },
    { value: "5000", label: locale === "en" ? "50,000 km" : "5 000 mil" },
    { value: "7500", label: locale === "en" ? "75,000 km" : "7 500 mil" },
    { value: "10000", label: locale === "en" ? "100,000 km" : "10 000 mil" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-[#18231d]">
          {copy.title}
        </h2>
        <button
          className="rounded-full border border-transparent px-2.5 py-1.5 text-xs font-semibold text-[#59665e] transition hover:border-[#d9ddd7] hover:bg-[#f6f7f3] hover:text-[#18231d] disabled:cursor-not-allowed disabled:opacity-35"
          disabled={!hasActiveFilters}
          onClick={onReset}
          type="button"
        >
          {copy.reset}
        </button>
      </div>

      <div className="space-y-5">
        <FilterGroup label={copy.budget}>
          <div className="rounded-2xl border border-[#e0e2dc] bg-[#f8f8f5] px-3.5 py-3">
            <div className="mb-2.5 grid grid-cols-2 items-center gap-3 text-xs">
              <button
                className="min-w-0 truncate text-left font-semibold text-[#26372d] underline-offset-2 hover:underline"
                onClick={() => onChange({ ...filters, minPrice: null })}
                type="button"
              >
                <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a938d]">
                  {copy.minimum}
                </span>
                {selectedMinimumLabel}
              </button>
              <button
                className="min-w-0 truncate text-right font-semibold text-[#26372d] underline-offset-2 hover:underline"
                onClick={() => onChange({ ...filters, maxPrice: null })}
                type="button"
              >
                <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#8a938d]">
                  {copy.maximum}
                </span>
                {selectedMaximumLabel}
              </button>
            </div>
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
          </div>
        </FilterGroup>

        <div className="grid grid-cols-2 gap-2.5">
          <CompactDropdown
            label={copy.make}
            noResultsLabel={copy.noMatches}
            onChange={(brand) => onChange({ ...filters, brand, model: "" })}
            options={brandOptions}
            renderIcon={(brand) =>
              brand ? (
                <BrandLogo className="size-4.5" make={brand} />
              ) : (
                <ManufacturerIcon className="size-3.5" />
              )
            }
            searchable
            searchPlaceholder={copy.searchMakes}
            value={filters.brand}
          />
          <CompactDropdown
            disabled={models.length === 0}
            label={copy.model}
            noResultsLabel={copy.noMatches}
            onChange={(model) => onChange({ ...filters, model })}
            options={modelOptions}
            renderIcon={() => <VehicleModelIcon className="size-3.5" />}
            searchable
            searchPlaceholder={copy.searchModels}
            value={filters.model}
          />
        </div>

        <FilterGroup label={copy.fuel}>
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

        <FilterGroup label={copy.transmission}>
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

        <div className="grid grid-cols-2 gap-2.5">
          <CompactDropdown
            label={copy.year}
            noResultsLabel={copy.noMatches}
            onChange={(year) =>
              onChange({ ...filters, minYear: year ? Number(year) : null })
            }
            options={yearOptions}
            renderIcon={() => <CalendarFilterIcon className="size-3.5" />}
            value={filters.minYear?.toString() ?? ""}
          />
          <CompactDropdown
            label={copy.mileage}
            noResultsLabel={copy.noMatches}
            onChange={(mileage) =>
              onChange({
                ...filters,
                maxMileageMil: mileage ? Number(mileage) : null,
              })
            }
            options={mileageOptions}
            renderIcon={() => <OdometerIcon className="size-3.5" />}
            value={filters.maxMileageMil?.toString() ?? ""}
          />
        </div>

        <FilterGroup label={copy.body}>
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
