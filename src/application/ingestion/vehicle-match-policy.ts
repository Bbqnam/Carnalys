import type { NormalizedVehicleListing } from "./types";

export type VehicleMatchMethod =
  | "exact_registration"
  | "exact_vin"
  | "source_listing";

export interface VehicleMatchEvidence {
  method: VehicleMatchMethod;
  confidence: number;
}

/**
 * Only identifiers that identify a physical vehicle deterministically are
 * allowed to merge listing rows. Similar-looking cars remain separate until a
 * future reviewable fuzzy-matching layer exists.
 */
export function exactVehicleMatchEvidence(
  vehicle: NormalizedVehicleListing["vehicle"],
): VehicleMatchEvidence {
  if (vehicle.registrationNumber) {
    return { method: "exact_registration", confidence: 1 };
  }
  if (vehicle.vin) return { method: "exact_vin", confidence: 1 };
  return { method: "source_listing", confidence: 0 };
}
