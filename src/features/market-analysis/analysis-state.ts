import type { FuelType, TransmissionType } from "@/domain/vehicle";
import type { MarketAnalysisFilters } from "@/domain/market/types";
import type {
  SearchParameters,
  SearchParameterValue,
} from "@/features/search/search-state";

/**
 * Query parameter names are shared with the search page (`make`, `model`,
 * `fuel`, …) so the two pages speak the same URL vocabulary and a selection
 * can be carried between them.
 */

const fuelTypes = new Set<FuelType>([
  "diesel",
  "electric",
  "ethanol",
  "hydrogen",
  "petrol",
  "plug_in_hybrid",
  "self_charging_hybrid",
  "other",
]);
const transmissions = new Set<TransmissionType>(["automatic", "manual", "other"]);

export const defaultAnalysisFilters: MarketAnalysisFilters = {
  brands: [],
  models: [],
  fuelType: "",
  transmission: "",
  minYear: null,
  maxYear: null,
  minMileageMil: null,
  maxMileageMil: null,
};

function first(value: SearchParameterValue) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Sorted, not left in URL order. The parsed filters are the cache key for the
 * whole analysis, so `?make=Volvo&make=Audi` and `?make=Audi&make=Volvo` must
 * resolve to one entry rather than recomputing the same aggregate twice.
 */
function stringValues(value: SearchParameterValue) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(values.map((item) => item.trim().slice(0, 80)).filter(Boolean)),
  ]
    .sort()
    .slice(0, 40);
}

function positiveInteger(value: SearchParameterValue) {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function enumValue<T extends string>(value: SearchParameterValue, allowed: Set<T>) {
  const parsed = first(value)?.trim() ?? "";
  return allowed.has(parsed as T) ? (parsed as T) : "";
}

export function parseAnalysisFilters(
  parameters: SearchParameters,
): MarketAnalysisFilters {
  const minimumYear = positiveInteger(parameters.minYear);
  const maximumYear = positiveInteger(parameters.maxYear);
  const minimumMileage = positiveInteger(parameters.minMileage);
  const maximumMileage = positiveInteger(parameters.maxMileage);

  return {
    brands: stringValues(parameters.make),
    models: stringValues(parameters.model),
    fuelType: enumValue(parameters.fuel, fuelTypes),
    transmission: enumValue(parameters.transmission, transmissions),
    // A reversed range is treated as no lower bound rather than as an empty
    // result, matching how the search page resolves the same conflict.
    minYear:
      minimumYear !== null && (maximumYear === null || minimumYear <= maximumYear)
        ? minimumYear
        : null,
    maxYear: maximumYear,
    minMileageMil:
      minimumMileage !== null &&
      (maximumMileage === null || minimumMileage <= maximumMileage)
        ? minimumMileage
        : null,
    maxMileageMil: maximumMileage,
  };
}

export function analysisUrl(filters: MarketAnalysisFilters) {
  const parameters = new URLSearchParams();

  filters.brands.forEach((brand) => parameters.append("make", brand));
  filters.models.forEach((model) => parameters.append("model", model));
  if (filters.fuelType) parameters.set("fuel", filters.fuelType);
  if (filters.transmission) parameters.set("transmission", filters.transmission);
  if (filters.minYear !== null) parameters.set("minYear", String(filters.minYear));
  if (filters.maxYear !== null) parameters.set("maxYear", String(filters.maxYear));
  if (filters.minMileageMil !== null) {
    parameters.set("minMileage", String(filters.minMileageMil));
  }
  if (filters.maxMileageMil !== null) {
    parameters.set("maxMileage", String(filters.maxMileageMil));
  }

  const query = parameters.toString();
  return query ? `/analysis?${query}` : "/analysis";
}

export function hasActiveAnalysisFilters(filters: MarketAnalysisFilters) {
  return (
    filters.brands.length > 0 ||
    filters.models.length > 0 ||
    filters.fuelType !== "" ||
    filters.transmission !== "" ||
    filters.minYear !== null ||
    filters.maxYear !== null ||
    filters.minMileageMil !== null ||
    filters.maxMileageMil !== null
  );
}
