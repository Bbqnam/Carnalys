export type InsuranceCoverageLevel = "trafik" | "halv" | "hel";

/**
 * One manually-collected quote, already reduced to the attributes the
 * comparable-lookup estimator reasons about. Money fields are plain numbers
 * (SEK), matching `comparable-valuation.ts` rather than the `Money` wrapper
 * used for user-facing ownership-cost output — this is an internal
 * estimation input, not a rendered figure.
 */
export interface InsuranceQuoteComparable {
  make: string;
  model: string;
  variant: string | null;
  modelYear: number;
  bodyStyle: string;
  fuelType: string;
  drivetrain: string | null;
  horsepower: number | null;
  vehicleValueAmount: number;
  insurer: string;
  monthlyPremiumAmount: number;
}

export interface InsuranceEstimateTarget {
  make: string;
  model: string;
  bodyStyle: string;
  fuelType: string;
  drivetrain?: string | null;
  horsepower?: number | null;
  vehicleValueAmount: number;
}
