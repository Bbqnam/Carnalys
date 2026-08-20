import type { VehicleSpecification } from "./specifications";
import type { ISODate, VehicleId } from "./types";

export interface VehicleIdentity {
  make: string;
  model: string;
  variant?: string;
  modelYear: number;
  registrationYear?: number;
}

/**
 * Marketplace-independent vehicle facts. Source-specific claims and calculated
 * analysis deliberately live in separate models.
 */
export interface Vehicle {
  id: VehicleId;
  identity: VehicleIdentity;
  specification: VehicleSpecification;
  registrationNumber?: string;
  vin?: string;
  firstRegistrationDate?: ISODate;
}
