export const MARKET_COHORT_MINIMUM_SIZE = 10;
export const MARKET_NORMALIZATION_VERSION = "vehicle-normalization-v1";

export const MILEAGE_BUCKETS = [
  { key: 0, minimumKm: 0, maximumKm: 25_000 },
  { key: 1, minimumKm: 25_000, maximumKm: 50_000 },
  { key: 2, minimumKm: 50_000, maximumKm: 75_000 },
  { key: 3, minimumKm: 75_000, maximumKm: 100_000 },
  { key: 4, minimumKm: 100_000, maximumKm: 150_000 },
  { key: 5, minimumKm: 150_000, maximumKm: null },
] as const;

export type MarketCohortGranularity =
  | "model"
  | "fuel"
  | "transmission"
  | "model_year"
  | "mileage";

export interface HistoricalMarketSelection {
  make: string;
  model: string;
  fuelType?: string;
  transmission?: string;
  modelYear?: number;
  mileageBucket?: number;
}

export interface MarketCohortCandidate extends HistoricalMarketSelection {
  granularity: MarketCohortGranularity;
}

export function mileageBucketForKm(mileageKm: number) {
  const bucket = MILEAGE_BUCKETS.find(
    ({ minimumKm, maximumKm }) =>
      mileageKm >= minimumKm &&
      (maximumKm === null || mileageKm < maximumKm),
  );
  return bucket?.key ?? MILEAGE_BUCKETS[0].key;
}

/** Most specific requested cohort first, ending at make+model fallback. */
export function marketCohortCandidates(
  selection: HistoricalMarketSelection,
): readonly MarketCohortCandidate[] {
  const base = { make: selection.make, model: selection.model };
  const candidates: MarketCohortCandidate[] = [];

  if (
    selection.fuelType &&
    selection.transmission &&
    selection.modelYear !== undefined &&
    selection.mileageBucket !== undefined
  ) {
    candidates.push({
      ...base,
      fuelType: selection.fuelType,
      transmission: selection.transmission,
      modelYear: selection.modelYear,
      mileageBucket: selection.mileageBucket,
      granularity: "mileage",
    });
  }
  if (
    selection.fuelType &&
    selection.transmission &&
    selection.modelYear !== undefined
  ) {
    candidates.push({
      ...base,
      fuelType: selection.fuelType,
      transmission: selection.transmission,
      modelYear: selection.modelYear,
      granularity: "model_year",
    });
  }
  if (selection.fuelType && selection.transmission) {
    candidates.push({
      ...base,
      fuelType: selection.fuelType,
      transmission: selection.transmission,
      granularity: "transmission",
    });
  }
  if (selection.fuelType) {
    candidates.push({
      ...base,
      fuelType: selection.fuelType,
      granularity: "fuel",
    });
  }
  candidates.push({ ...base, granularity: "model" });
  return candidates;
}

export function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function addUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function previousCompletedUtcDate(now = new Date()) {
  return addUtcDays(startOfUtcDay(now), -1);
}
