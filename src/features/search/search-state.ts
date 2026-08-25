import type {
  BodyStyle,
  FuelType,
  SellerType,
  TransmissionType,
} from "@/domain/vehicle";
import {
  type PostedWithin,
  type SearchFilters,
  type SearchSort,
  type VehiclePageSize,
  type VehicleSearchOptions,
} from "./types";

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
const sellerTypes = new Set<SellerType>(["dealer", "private"]);
const postedWithinValues = new Set<PostedWithin>(["today", "week", "month"]);

export const defaultSearchFilters: SearchFilters = {
  query: "",
  minPrice: null,
  maxPrice: null,
  brands: [],
  models: [],
  fuelType: "",
  transmission: "",
  minYear: null,
  maxYear: null,
  minMileageMil: null,
  maxMileageMil: null,
  bodyStyle: "",
  sellerType: "",
  postedWithin: "",
};

export const defaultSearchSort: SearchSort = "newest";
export const defaultVehiclePageSize: VehiclePageSize = 35;

function first(value: SearchParameterValue) {
  return Array.isArray(value) ? value[0] : value;
}

function stringValue(value: SearchParameterValue) {
  return first(value)?.trim() ?? "";
}

function stringValues(value: SearchParameterValue, maximumLength = 80) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values.map((item) => item.trim().slice(0, maximumLength)).filter(Boolean),
    ),
  ].slice(0, 40);
}

function nonNegativeInteger(value: SearchParameterValue) {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: SearchParameterValue) {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function positiveIntegers(value: SearchParameterValue) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values
        .map((item) => Number.parseInt(item, 10))
        .filter((item) => Number.isSafeInteger(item) && item > 0),
    ),
  ].slice(0, 100);
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
  const legacyYears = positiveIntegers(parameters.year);
  const minimumYear = positiveInteger(parameters.minYear);
  const maximumYear = positiveInteger(parameters.maxYear);
  const minimumMileage = positiveInteger(parameters.minMileage);
  const maximumMileage = positiveInteger(parameters.maxMileage ?? parameters.mileage);
  return {
    page: positiveInteger(parameters.page) ?? 1,
    pageSize: defaultVehiclePageSize,
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
      brands: stringValues(parameters.make),
      models: stringValues(parameters.model),
      fuelType: enumValue(parameters.fuel, fuelTypes),
      transmission: enumValue(parameters.transmission, transmissions),
      minYear:
        minimumYear !== null && (maximumYear === null || minimumYear <= maximumYear)
          ? minimumYear
          : minimumYear === null && legacyYears.length
            ? Math.min(...legacyYears)
            : null,
      maxYear: maximumYear ?? (legacyYears.length ? Math.max(...legacyYears) : null),
      minMileageMil:
        minimumMileage !== null &&
        (maximumMileage === null || minimumMileage <= maximumMileage)
          ? minimumMileage
          : null,
      maxMileageMil: maximumMileage,
      bodyStyle: enumValue(parameters.body, bodyStyles),
      sellerType: enumValue(parameters.seller, sellerTypes),
      postedWithin: enumValue(parameters.posted, postedWithinValues),
    },
  };
}

export function vehicleSearchUrl({ filters, sort, page }: VehicleSearchOptions) {
  const parameters = new URLSearchParams();

  if (filters.query.trim()) parameters.set("q", filters.query.trim());
  if (filters.minPrice !== null) parameters.set("minPrice", filters.minPrice.toString());
  if (filters.maxPrice !== null) parameters.set("maxPrice", filters.maxPrice.toString());
  filters.brands.forEach((brand) => parameters.append("make", brand));
  filters.models.forEach((model) => parameters.append("model", model));
  if (filters.fuelType) parameters.set("fuel", filters.fuelType);
  if (filters.transmission) parameters.set("transmission", filters.transmission);
  if (filters.minYear !== null) parameters.set("minYear", filters.minYear.toString());
  if (filters.maxYear !== null) parameters.set("maxYear", filters.maxYear.toString());
  if (filters.minMileageMil !== null) {
    parameters.set("minMileage", filters.minMileageMil.toString());
  }
  if (filters.maxMileageMil !== null) {
    parameters.set("maxMileage", filters.maxMileageMil.toString());
  }
  if (filters.bodyStyle) parameters.set("body", filters.bodyStyle);
  if (filters.sellerType) parameters.set("seller", filters.sellerType);
  if (filters.postedWithin) parameters.set("posted", filters.postedWithin);
  if (sort !== defaultSearchSort) parameters.set("sort", sort);
  if (page > 1) parameters.set("page", page.toString());

  const query = parameters.toString();
  return `${query ? `/?${query}` : "/"}#cars`;
}
