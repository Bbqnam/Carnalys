import type { FuelType } from "../specifications";

/** A valuation-relevant powertrain class, finer than the public fuel filter. */
export type PowertrainClass =
  | "bev"
  | "phev"
  | "mhev"
  | "hev"
  | "combustion"
  | "hydrogen"
  | "unknown";

export interface PowertrainClassification {
  type: PowertrainClass;
  /** The text and structured source enum describe incompatible systems. */
  conflict: boolean;
}

const PHEV = /\b(?:plug[\s-]?in(?:\s+hybrid)?|plugin|phev|laddhybrid|twin engine)\b/i;
const MHEV = /\b(?:mild[\s-]?hybrid|mhev|48\s?v(?:olt)?)\b/i;
const HEV = /\b(?:self[\s-]?charging|full[\s-]?hybrid|hev|sj[äa]lvladdande\s+hybrid)\b/i;
const BEV = /\b(?:bev|helelektrisk|elbil|battery electric)\b/i;

/**
 * Explicit technology tokens win because some sources file hybrids under the
 * base petrol/diesel fuel. That common representation is not itself a
 * conflict; impossible pairs such as electric + PHEV are.
 */
export function classifyPowertrain(input: {
  fuelType: FuelType;
  text?: string | null;
}): PowertrainClassification {
  const text = input.text ?? "";
  const textType: PowertrainClass | null = PHEV.test(text)
    ? "phev"
    : MHEV.test(text)
      ? "mhev"
      : HEV.test(text)
        ? "hev"
        : BEV.test(text)
          ? "bev"
          : null;

  const sourceType: PowertrainClass =
    input.fuelType === "electric"
      ? "bev"
      : input.fuelType === "plug_in_hybrid"
        ? "phev"
        : input.fuelType === "self_charging_hybrid"
          ? "hev"
          : input.fuelType === "hydrogen"
            ? "hydrogen"
            : input.fuelType === "petrol" ||
                input.fuelType === "diesel" ||
                input.fuelType === "ethanol"
              ? "combustion"
              : "unknown";

  if (!textType) return { type: sourceType, conflict: false };

  const combustionHybrid =
    sourceType === "combustion" &&
    (textType === "phev" || textType === "mhev" || textType === "hev");
  const compatibleHybrid =
    sourceType === "hev" && (textType === "hev" || textType === "mhev");
  const conflict =
    sourceType !== "unknown" &&
    sourceType !== textType &&
    !combustionHybrid &&
    !compatibleHybrid;

  return { type: textType, conflict };
}
