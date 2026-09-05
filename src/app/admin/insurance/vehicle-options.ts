// Mirrors src/domain/vehicle/specifications.ts so stored strings line up with
// the canonical taxonomy used across the rest of the catalog.
export const bodyStyleOptions = [
  "sedan",
  "estate",
  "hatchback",
  "suv",
  "coupe",
  "convertible",
  "minivan",
  "pickup",
  "van",
  "other",
] as const;

export const fuelTypeOptions = [
  "petrol",
  "diesel",
  "electric",
  "plug_in_hybrid",
  "self_charging_hybrid",
  "ethanol",
  "hydrogen",
  "other",
] as const;

export const transmissionOptions = ["automatic", "manual", "other"] as const;

export const drivetrainOptions = [
  "front_wheel_drive",
  "rear_wheel_drive",
  "all_wheel_drive",
  "other",
] as const;

export const coverageLevelOptions = ["trafik", "halv", "hel"] as const;
