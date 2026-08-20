import type { BodyStyle, FuelType, TransmissionType } from "@/domain/vehicle";
import type { SearchFilters, SearchSort, VehicleSearchOptions } from "./types";

export type SearchParameterValue = string | string[] | undefined;
export type SearchParameters = Record<string, SearchParameterValue>;

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
const bodyStyles = new Set<BodyStyle>([
  "convertible",
  "coupe",
  "estate",
  "hatchback",
  "minivan",
  "pickup",
  "sedan",
  "suv",
  "van",
  "other",
]);
const sorts = new Set<SearchSort>([
  "deal_score",
  "buy_confidence",
  "price_asc",
  "price_desc",
  "newest",
]);

export const defaultSearchFilters: SearchFilters = {
  query: "",
  minPrice: null,
  maxPrice: null,
  brand: "",
  model: "",
  fuelType: "",
  transmission: "",
  minYear: null,
  maxMileageMil: null,
  bodyStyle: "",
};

export const defaultSearchSort: SearchSort = "deal_score";

function first(value: SearchParameterValue) {
  return Array.isArray(value) ? value[0] : value;
}

function stringValue(value: SearchParameterValue) {
  return first(value)?.trim() ?? "";
}

function nonNegativeInteger(value: SearchParameterValue) {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: SearchParameterValue) {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function enumValue<T extends string>(value: SearchParameterValue, allowed: Set<T>) {
  const parsed = stringValue(value);
  return allowed.has(parsed as T) ? (parsed as T) : "";
}

export function parseVehicleSearchOptions(
  parameters: SearchParameters,
): VehicleSearchOptions {
  const minimumPrice = nonNegativeInteger(parameters.minPrice);
  const maximumPrice = nonNegativeInteger(parameters.maxPrice);

  return {
    page: positiveInteger(parameters.page) ?? 1,
    sort: sorts.has(stringValue(parameters.sort) as SearchSort)
      ? (stringValue(parameters.sort) as SearchSort)
      : defaultSearchSort,
    filters: {
      query: stringValue(parameters.q).slice(0, 100),
      minPrice:
        minimumPrice !== null && (maximumPrice === null || minimumPrice <= maximumPrice)
          ? minimumPrice
          : null,
      maxPrice: maximumPrice,
      brand: stringValue(parameters.make).slice(0, 80),
      model: stringValue(parameters.model).slice(0, 80),
      fuelType: enumValue(parameters.fuel, fuelTypes),
      transmission: enumValue(parameters.transmission, transmissions),
      minYear: positiveInteger(parameters.year),
      maxMileageMil: positiveInteger(parameters.mileage),
      bodyStyle: enumValue(parameters.body, bodyStyles),
    },
  };
}

export function vehicleSearchUrl({ filters, sort, page }: VehicleSearchOptions) {
  const parameters = new URLSearchParams();

  if (filters.query.trim()) parameters.set("q", filters.query.trim());
  if (filters.minPrice !== null) parameters.set("minPrice", filters.minPrice.toString());
  if (filters.maxPrice !== null) parameters.set("maxPrice", filters.maxPrice.toString());
  if (filters.brand) parameters.set("make", filters.brand);
  if (filters.model) parameters.set("model", filters.model);
  if (filters.fuelType) parameters.set("fuel", filters.fuelType);
  if (filters.transmission) parameters.set("transmission", filters.transmission);
  if (filters.minYear !== null) parameters.set("year", filters.minYear.toString());
  if (filters.maxMileageMil !== null) {
    parameters.set("mileage", filters.maxMileageMil.toString());
  }
  if (filters.bodyStyle) parameters.set("body", filters.bodyStyle);
  if (sort !== defaultSearchSort) parameters.set("sort", sort);
  if (page > 1) parameters.set("page", page.toString());

  const query = parameters.toString();
  return `${query ? `/?${query}` : "/"}#cars`;
}
