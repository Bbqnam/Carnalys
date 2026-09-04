import type { BodyStyle, FuelType, SellerType, TransmissionType } from "@/domain/vehicle";
import { defaultSearchFilters } from "@/features/search/search-state";
import type { SearchFilters } from "@/features/search/types";
import type {
  AnalystContext,
  AnalystConversationMessage,
  AnalystLocale,
  AnalystRequest,
  AnalystToolName,
} from "./types";

export class AnalystValidationError extends Error {
  readonly code = "INVALID_REQUEST";
}

const listingIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const toolNames = new Set<AnalystToolName>([
  "get_listing_analysis",
  "analyse_listing_market",
  "search_inventory",
  "compare_listings",
]);
const fuels = new Set<FuelType>([
  "diesel", "electric", "ethanol", "hydrogen", "petrol",
  "plug_in_hybrid", "self_charging_hybrid", "other",
]);
const transmissions = new Set<TransmissionType>(["automatic", "manual", "other"]);
const bodyStyles = new Set<BodyStyle>([
  "convertible", "coupe", "estate", "hatchback", "minivan", "pickup",
  "sedan", "suv", "van", "other",
]);
const sellers = new Set<SellerType>(["dealer", "private"]);
const posted = new Set(["", "today", "week", "month"] as const);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalystValidationError("Expected an object.");
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new AnalystValidationError(`Unknown field: ${extras[0]}.`);
}

function text(value: unknown, name: string, maximum: number, allowEmpty = false) {
  if (typeof value !== "string") throw new AnalystValidationError(`${name} must be text.`);
  const result = value.trim().slice(0, maximum);
  if (!allowEmpty && !result) throw new AnalystValidationError(`${name} is required.`);
  return result;
}

function listingId(value: unknown) {
  const result = text(value, "listingId", 100);
  if (!listingIdPattern.test(result)) throw new AnalystValidationError("Invalid listingId.");
  return result;
}

function nullableInteger(value: unknown, name: string, maximum: number) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new AnalystValidationError(`${name} must be a valid non-negative integer.`);
  }
  return Number(value);
}

function stringList(value: unknown, name: string, maximumItems = 20) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new AnalystValidationError(`${name} must be a short list.`);
  }
  return [...new Set(value.map((item) => text(item, name, 80)))];
}

function fuelTypeList(value: unknown): FuelType[] {
  const items = stringList(value, "fuelTypes", fuels.size);
  const invalid = items.find((item) => !fuels.has(item as FuelType));
  if (invalid) throw new AnalystValidationError(`Invalid fuelTypes entry: ${invalid}.`);
  return items as FuelType[];
}

export function parseAnalystSearchFilters(value: unknown): SearchFilters {
  if (value === undefined) return { ...defaultSearchFilters };
  const input = object(value);
  // licensePlate is accepted (never rejected — the whole-object trusted
  // context sent from the search page naturally carries it) but never read:
  // see the hardcoded "" below.
  onlyKeys(input, [
    "query", "minPrice", "maxPrice", "brands", "models", "sources", "fuelType",
    "transmission", "minYear", "maxYear", "minMileageMil", "maxMileageMil",
    "bodyStyle", "sellerType", "postedWithin", "licensePlate",
  ]);
  const minPrice = nullableInteger(input.minPrice, "minPrice", 10_000_000);
  const maxPrice = nullableInteger(input.maxPrice, "maxPrice", 10_000_000);
  const minYear = nullableInteger(input.minYear, "minYear", 3_000);
  const maxYear = nullableInteger(input.maxYear, "maxYear", 3_000);
  const minMileageMil = nullableInteger(input.minMileageMil, "minMileageMil", 200_000);
  const maxMileageMil = nullableInteger(input.maxMileageMil, "maxMileageMil", 200_000);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw new AnalystValidationError("minPrice cannot exceed maxPrice.");
  }
  if (minYear !== null && maxYear !== null && minYear > maxYear) {
    throw new AnalystValidationError("minYear cannot exceed maxYear.");
  }
  if (minMileageMil !== null && maxMileageMil !== null && minMileageMil > maxMileageMil) {
    throw new AnalystValidationError("minMileageMil cannot exceed maxMileageMil.");
  }
  const fuelType = input.fuelType === undefined ? "" : text(input.fuelType, "fuelType", 40, true);
  const transmission = input.transmission === undefined ? "" : text(input.transmission, "transmission", 40, true);
  const bodyStyle = input.bodyStyle === undefined ? "" : text(input.bodyStyle, "bodyStyle", 40, true);
  const sellerType = input.sellerType === undefined ? "" : text(input.sellerType, "sellerType", 40, true);
  const postedWithin = input.postedWithin === undefined ? "" : text(input.postedWithin, "postedWithin", 20, true);
  if (fuelType && !fuels.has(fuelType as FuelType)) throw new AnalystValidationError("Invalid fuelType.");
  if (transmission && !transmissions.has(transmission as TransmissionType)) throw new AnalystValidationError("Invalid transmission.");
  if (bodyStyle && !bodyStyles.has(bodyStyle as BodyStyle)) throw new AnalystValidationError("Invalid bodyStyle.");
  if (sellerType && !sellers.has(sellerType as SellerType)) throw new AnalystValidationError("Invalid sellerType.");
  if (!posted.has(postedWithin as "" | "today" | "week" | "month")) throw new AnalystValidationError("Invalid postedWithin.");
  return {
    query: input.query === undefined ? "" : text(input.query, "query", 100, true),
    minPrice,
    maxPrice,
    brands: stringList(input.brands, "brands"),
    models: stringList(input.models, "models"),
    sources: stringList(input.sources, "sources"),
    fuelType: fuelType as SearchFilters["fuelType"],
    transmission: transmission as SearchFilters["transmission"],
    minYear,
    maxYear,
    minMileageMil,
    maxMileageMil,
    bodyStyle: bodyStyle as SearchFilters["bodyStyle"],
    sellerType: sellerType as SearchFilters["sellerType"],
    postedWithin: postedWithin as SearchFilters["postedWithin"],
    // Always "" regardless of what was sent (see the onlyKeys comment above):
    // licensePlate is absent from searchFiltersSchema's own properties, so the
    // model can never set it, and this function ignores it even when the
    // trusted search-page context includes it. The Analyst can never search
    // or see registration numbers.
    licensePlate: "",
  };
}

function parseContext(value: unknown): AnalystContext {
  const input = object(value);
  const surface = text(input.surface, "surface", 20);
  if (surface === "listing") {
    onlyKeys(input, ["surface", "listingId"]);
    return { surface, listingId: listingId(input.listingId) };
  }
  if (surface === "search") {
    onlyKeys(input, ["surface", "filters"]);
    return { surface, filters: parseAnalystSearchFilters(input.filters) };
  }
  if (surface === "comparison") {
    onlyKeys(input, ["surface", "listingIds"]);
    const ids = stringList(input.listingIds, "listingIds", 3).map(listingId);
    if (ids.length < 2 || ids.length > 3) {
      throw new AnalystValidationError("Comparison requires two or three listings.");
    }
    return { surface, listingIds: ids };
  }
  throw new AnalystValidationError("Invalid Analyst surface.");
}

function parseConversation(value: unknown): AnalystConversationMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) {
    throw new AnalystValidationError("Conversation must contain at most four recent messages.");
  }
  return value.map((entry) => {
    const message = object(entry);
    onlyKeys(message, ["role", "content"]);
    if (message.role !== "user" && message.role !== "assistant") {
      throw new AnalystValidationError("Invalid conversation role.");
    }
    return { role: message.role, content: text(message.content, "content", 1_200) };
  });
}

export function parseAnalystRequest(value: unknown): AnalystRequest {
  const input = object(value);
  onlyKeys(input, ["message", "locale", "context", "conversation"]);
  const locale = input.locale === "sv" ? "sv" : input.locale === "en" ? "en" : null;
  if (!locale) throw new AnalystValidationError("locale must be en or sv.");
  return {
    message: text(input.message, "message", 600),
    locale: locale as AnalystLocale,
    context: parseContext(input.context),
    conversation: parseConversation(input.conversation),
  };
}

export type ValidatedToolArguments =
  | { name: "get_listing_analysis"; arguments: { listingId: string; includeDescription: boolean } }
  | { name: "analyse_listing_market"; arguments: { listingId: string } }
  | { name: "search_inventory"; arguments: { filters: SearchFilters; finalistIds: string[]; excludeCommercialBodyStyles: boolean; fuelTypes: FuelType[]; minHorsepower: number | null; maxHorsepower: number | null } }
  | { name: "compare_listings"; arguments: { listingIds: string[] } };

export function validateToolArguments(name: string, value: unknown): ValidatedToolArguments {
  if (!toolNames.has(name as AnalystToolName)) throw new AnalystValidationError("Unknown tool.");
  const input = object(value);
  if (name === "get_listing_analysis") {
    onlyKeys(input, ["listingId", "includeDescription"]);
    if (input.includeDescription !== undefined && typeof input.includeDescription !== "boolean") {
      throw new AnalystValidationError("includeDescription must be boolean.");
    }
    return { name, arguments: { listingId: listingId(input.listingId), includeDescription: input.includeDescription === true } };
  }
  if (name === "analyse_listing_market") {
    onlyKeys(input, ["listingId"]);
    return { name, arguments: { listingId: listingId(input.listingId) } };
  }
  if (name === "search_inventory") {
    onlyKeys(input, ["filters", "finalistIds", "excludeCommercialBodyStyles", "fuelTypes", "minHorsepower", "maxHorsepower"]);
    const finalistIds = stringList(input.finalistIds, "finalistIds", 5).map(listingId);
    const excludeCommercialBodyStyles = input.excludeCommercialBodyStyles === true;
    const fuelTypes = fuelTypeList(input.fuelTypes);
    const minHorsepower = nullableInteger(input.minHorsepower, "minHorsepower", 2_000);
    const maxHorsepower = nullableInteger(input.maxHorsepower, "maxHorsepower", 2_000);
    if (minHorsepower !== null && maxHorsepower !== null && minHorsepower > maxHorsepower) {
      throw new AnalystValidationError("minHorsepower cannot exceed maxHorsepower.");
    }
    return { name, arguments: { filters: parseAnalystSearchFilters(input.filters), finalistIds, excludeCommercialBodyStyles, fuelTypes, minHorsepower, maxHorsepower } };
  }
  onlyKeys(input, ["listingIds"]);
  const ids = stringList(input.listingIds, "listingIds", 3).map(listingId);
  if (ids.length < 2 || ids.length > 3) throw new AnalystValidationError("Comparison requires two or three listings.");
  return { name: "compare_listings", arguments: { listingIds: ids } };
}

