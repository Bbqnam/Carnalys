export type BodyStyle =
  | "convertible"
  | "coupe"
  | "estate"
  | "hatchback"
  | "minivan"
  | "pickup"
  | "sedan"
  | "suv"
  | "van"
  | "other";

export type FuelType =
  | "diesel"
  | "electric"
  | "ethanol"
  | "hydrogen"
  | "petrol"
  | "plug_in_hybrid"
  | "self_charging_hybrid"
  | "other";

export type TransmissionType = "automatic" | "manual" | "other";

export type Drivetrain =
  | "all_wheel_drive"
  | "front_wheel_drive"
  | "rear_wheel_drive"
  | "other";

export interface VehiclePowertrain {
  fuelType: FuelType;
  transmission: TransmissionType;
  drivetrain?: Drivetrain;
  engineDisplacementCc?: number;
  engineDescription?: string;
  powerKw?: number;
  powerHp?: number;
  batteryCapacityKwh?: number;
  electricRangeKm?: number;
}

export interface VehicleSpecification {
  bodyStyle: BodyStyle;
  powertrain: VehiclePowertrain;
  exteriorColor?: string;
  doors?: number;
  seats?: number;
  curbWeightKg?: number;
  towingCapacityKg?: number;
}
