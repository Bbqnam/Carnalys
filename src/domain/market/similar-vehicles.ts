export interface SimilarVehicle {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  bodyStyle: string;
  fuelType: string;
  transmission: string;
  generation: string | null;
  horsepower: number | null;
  modelYear: number;
  mileageKm: number;
  mileageKnown: boolean;
  priceAmount: number;
}

/** A shopping budget, never an input to market-value estimation. */
export const similarVehicleBudgetRatio = 0.2;

export function rankSimilarVehicles(target: SimilarVehicle, candidates: readonly SimilarVehicle[]) {
  const used = new Set<string>([target.vehicleId]);
  return candidates.filter(candidate =>
    candidate.id !== target.id && candidate.vehicleId !== target.vehicleId &&
    candidate.priceAmount > 0 && candidate.mileageKnown &&
    candidate.bodyStyle !== "other" && candidate.bodyStyle === target.bodyStyle &&
    (target.fuelType === "other" || candidate.fuelType === target.fuelType) &&
    (target.transmission === "other" || candidate.transmission === target.transmission) &&
    Math.abs(candidate.priceAmount / target.priceAmount - 1) <= similarVehicleBudgetRatio &&
    !(candidate.make === target.make && candidate.model === target.model && target.generation && candidate.generation && target.generation !== candidate.generation),
  ).map(candidate => ({
    vehicle: candidate,
    distance: 3 * Math.abs(Math.log(candidate.priceAmount / target.priceAmount)) +
      Math.abs(candidate.modelYear - target.modelYear) / 6 +
      (target.mileageKnown ? Math.abs(candidate.mileageKm - target.mileageKm) / 100_000 : 0) +
      (candidate.make === target.make && candidate.model === target.model ? 0 : 0.5) +
      (candidate.horsepower && target.horsepower ? Math.abs(Math.log(candidate.horsepower / target.horsepower)) : 0.3),
  })).sort((a, b) => a.distance - b.distance || a.vehicle.id.localeCompare(b.vehicle.id))
    .filter(({ vehicle }) => { if (used.has(vehicle.vehicleId)) return false; used.add(vehicle.vehicleId); return true; })
    .map(({ vehicle }) => vehicle);
}

export interface SimilarVehicleRecommendation {
  id: string;
  title: string;
  priceAmount: number;
  modelYear: number;
  mileageKm: number;
  imageUrl: string | null;
  municipality: string;
  sourceName: string;
  sourceUrl: string;
  confirmedAt: string;
  sameModel: boolean;
}
