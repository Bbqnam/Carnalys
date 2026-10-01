import type { BodyStyle, Drivetrain, FuelType, TransmissionType } from "../specifications";
import type { PowertrainClass } from "../taxonomy/powertrain-classification";
import { minimumPlausibleAskingPrice } from "../pricing";
import { assessMileage } from "./listing-assessment";

export type ListingQualityReasonCode =
  | "PRICE_NOT_POSITIVE"
  | "PRICE_BELOW_MODEL_YEAR_FLOOR"
  | "PRICE_ABOVE_VALUATION_LIMIT"
  | "LEASE_OR_MONTHLY_PRICE"
  | "VAT_EXCLUSIVE_PRICE"
  | "MILEAGE_OUT_OF_RANGE"
  | "MILEAGE_IMPLAUSIBLE_FOR_AGE"
  | "MODEL_YEAR_OUT_OF_RANGE"
  | "HORSEPOWER_OUT_OF_RANGE"
  | "POWERTRAIN_CLASSIFICATION_CONFLICT"
  | "MODEL_MISSING"
  | "FUEL_TYPE_UNKNOWN"
  | "BODY_STYLE_UNKNOWN"
  | "TRANSMISSION_UNKNOWN"
  | "DRIVETRAIN_UNKNOWN"
  | "GENERATION_UNKNOWN"
  | "DEALER_IDENTITY_MISSING";

export interface ListingQualityAssessment {
  status: "valid" | "warning" | "rejected";
  valuationEligible: boolean;
  reasonCodes: readonly ListingQualityReasonCode[];
}

export interface ListingQualityInput {
  priceAmount: number;
  monthlyCostAmount?: number | null;
  mileageKm: number;
  modelYear: number;
  make: string;
  model: string;
  title?: string | null;
  variant?: string | null;
  description?: string | null;
  fuelType: FuelType;
  powertrainType: PowertrainClass;
  powertrainConflict: boolean;
  bodyStyle: BodyStyle;
  transmission: TransmissionType;
  drivetrain?: Drivetrain | null;
  horsepower?: number | null;
  generation?: string | null;
  sellerType: "dealer" | "private";
  sellerName?: string | null;
  currentYear: number;
}

const REJECT_REASONS = new Set<ListingQualityReasonCode>([
  "PRICE_NOT_POSITIVE",
  "PRICE_BELOW_MODEL_YEAR_FLOOR",
  "PRICE_ABOVE_VALUATION_LIMIT",
  "LEASE_OR_MONTHLY_PRICE",
  "VAT_EXCLUSIVE_PRICE",
  "MILEAGE_OUT_OF_RANGE",
  "MILEAGE_IMPLAUSIBLE_FOR_AGE",
  "MODEL_YEAR_OUT_OF_RANGE",
  "HORSEPOWER_OUT_OF_RANGE",
  "POWERTRAIN_CLASSIFICATION_CONFLICT",
  "MODEL_MISSING",
]);

const LEASE_WORDING =
  /\b(?:privatleasing|f[öo]retagsleasing|billeasing|leasingpris|kontantinsats|handpenning|m[åa]nadskostnad)\b/i;
const VAT_EXCLUSIVE_WORDING =
  /\b(?:exkl\.?\s*moms|exklusive\s+moms|moms\s+tillkommer|pris\s+ex\.?\s*moms)\b/i;

/** Pure validation stage between normalization and comparable selection. */
export function assessListingDataQuality(
  input: ListingQualityInput,
): ListingQualityAssessment {
  const reasons: ListingQualityReasonCode[] = [];
  const text = `${input.title ?? ""} ${input.variant ?? ""} ${input.description ?? ""}`;
  const ageYears = Math.max(0, input.currentYear - input.modelYear);

  if (!Number.isFinite(input.priceAmount) || input.priceAmount <= 0) {
    reasons.push("PRICE_NOT_POSITIVE");
  } else {
    if (input.priceAmount < minimumPlausibleAskingPrice(input.modelYear, input.currentYear)) {
      reasons.push("PRICE_BELOW_MODEL_YEAR_FLOOR");
    }
    if (input.priceAmount > 3_000_000) reasons.push("PRICE_ABOVE_VALUATION_LIMIT");
  }
  if (
    (input.monthlyCostAmount &&
      input.monthlyCostAmount > 0 &&
      input.priceAmount < input.monthlyCostAmount * 12) ||
    (LEASE_WORDING.test(text) && input.priceAmount < 50_000)
  ) {
    reasons.push("LEASE_OR_MONTHLY_PRICE");
  }
  if (VAT_EXCLUSIVE_WORDING.test(text)) reasons.push("VAT_EXCLUSIVE_PRICE");

  if (!Number.isFinite(input.mileageKm) || input.mileageKm < 0 || input.mileageKm > 1_000_000) {
    reasons.push("MILEAGE_OUT_OF_RANGE");
  } else if (assessMileage(input.mileageKm, ageYears, text) === "suspicious") {
    reasons.push("MILEAGE_IMPLAUSIBLE_FOR_AGE");
  }

  if (
    !Number.isInteger(input.modelYear) ||
    input.modelYear < 1886 ||
    input.modelYear > input.currentYear + 2
  ) {
    reasons.push("MODEL_YEAR_OUT_OF_RANGE");
  }
  if (
    input.horsepower != null &&
    (!Number.isFinite(input.horsepower) || input.horsepower < 1 || input.horsepower > 2_000)
  ) {
    reasons.push("HORSEPOWER_OUT_OF_RANGE");
  }
  if (input.powertrainConflict) reasons.push("POWERTRAIN_CLASSIFICATION_CONFLICT");
  if (!input.make.trim() || !input.model.trim()) reasons.push("MODEL_MISSING");

  if (input.fuelType === "other" || input.powertrainType === "unknown") {
    reasons.push("FUEL_TYPE_UNKNOWN");
  }
  if (input.bodyStyle === "other") reasons.push("BODY_STYLE_UNKNOWN");
  if (input.transmission === "other") reasons.push("TRANSMISSION_UNKNOWN");
  if (!input.drivetrain || input.drivetrain === "other") reasons.push("DRIVETRAIN_UNKNOWN");
  if (!input.generation) reasons.push("GENERATION_UNKNOWN");
  if (input.sellerType === "dealer" && !input.sellerName?.trim()) {
    reasons.push("DEALER_IDENTITY_MISSING");
  }

  const uniqueReasons = [...new Set(reasons)];
  const rejected = uniqueReasons.some((reason) => REJECT_REASONS.has(reason));
  return {
    status: rejected ? "rejected" : uniqueReasons.length > 0 ? "warning" : "valid",
    valuationEligible: !rejected,
    reasonCodes: uniqueReasons,
  };
}
