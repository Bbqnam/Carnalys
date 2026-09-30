import type { FuelType } from "@/domain/vehicle/specifications";

export interface FuelClassificationInput {
  sourceFuelType: FuelType;
  title?: string | null;
  model?: string | null;
  variant?: string | null;
  description?: string | null;
  engineDescription?: string | null;
  horsepower?: number | null;
  powerKw?: number | null;
  electricRangeKm?: number | null;
}

export interface FuelClassification {
  fuelType: FuelType;
  confidence: number;
  evidence: string[];
  contradictions: string[];
}

type ScoreMap = Record<"petrol" | "diesel" | "self_charging_hybrid" | "plug_in_hybrid" | "electric", number>;

const emptyScores = (): ScoreMap => ({
  petrol: 0,
  diesel: 0,
  self_charging_hybrid: 0,
  plug_in_hybrid: 0,
  electric: 0,
});

function add(scores: ScoreMap, evidence: string[], type: keyof ScoreMap, weight: number, reason: string) {
  scores[type] += weight;
  evidence.push(reason);
}

export function classifyFuelType(input: FuelClassificationInput): FuelClassification {
  const scores = emptyScores();
  const evidence: string[] = [];
  const contradictions: string[] = [];
  const text = [input.model, input.variant, input.title, input.description, input.engineDescription]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("sv-SE");

  const explicitPhev = /\bplug[\s-]?in\b|\bphev\b|\bladdhybrid\b|\bplugin\b|\btwin engine\b/.test(text);
  const genericHybrid = /\bhybrid\b|\belhybrid\b|\bself[\s-]?charging\b|\bmhev\b|\bmild[\s-]?hybrid\b/.test(text);
  const explicitBev = /\bbev\b|\belbil\b|\bfull[\s-]?electric\b|\bfully electric\b/.test(text);

  if (explicitPhev) add(scores, evidence, "plug_in_hybrid", 7, "explicit plug in or PHEV wording");
  if (genericHybrid && !explicitPhev) add(scores, evidence, "self_charging_hybrid", 4, "generic hybrid wording without plug in evidence");
  if (explicitBev) add(scores, evidence, "electric", 7, "explicit BEV or electric car wording");
  if (/\bdiesel\b/.test(text)) add(scores, evidence, "diesel", 4, "diesel wording");
  if (/\bbensin\b|\bpetrol\b|\bgasoline\b/.test(text) && !genericHybrid && !explicitPhev) {
    add(scores, evidence, "petrol", 4, "petrol wording");
  }

  if (input.electricRangeKm && input.electricRangeKm > 0) {
    if (explicitPhev) add(scores, evidence, "plug_in_hybrid", 2, "electric range with explicit plug in identification");
    else evidence.push("electric range present but ignored for PHEV without plug in identification");
  }

  switch (input.sourceFuelType) {
    case "electric": add(scores, evidence, "electric", 6, "structured source fuel type electric"); break;
    case "diesel": add(scores, evidence, "diesel", 6, "structured source fuel type diesel"); break;
    case "petrol": add(scores, evidence, "petrol", 6, "structured source fuel type petrol"); break;
    case "self_charging_hybrid": add(scores, evidence, "self_charging_hybrid", 5, "structured source fuel type hybrid"); break;
    case "plug_in_hybrid":
      // A normalized PHEV enum is useful evidence, but cannot by itself beat
      // explicit generic HEV wording. Some marketplaces collapse "el + bensin"
      // into a hybrid bucket before this canonical layer sees it.
      add(scores, evidence, "plug_in_hybrid", explicitPhev ? 6 : 2.5, explicitPhev
        ? "structured PHEV agrees with explicit plug in wording"
        : "structured PHEV without independent plug in evidence");
      break;
  }

  const ranked = (Object.entries(scores) as [keyof ScoreMap, number][])
    .sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] <= 0) {
    return { fuelType: "other", confidence: 0, evidence, contradictions };
  }

  if (second && second[1] > 0 && best[0] !== second[0]) {
    contradictions.push(`fuel evidence conflict: ${best[0]}=${best[1]} vs ${second[0]}=${second[1]}`);
  }

  const margin = best[1] - (second?.[1] ?? 0);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);
  const confidence = Math.max(0, Math.min(0.99, 0.55 + 0.4 * (best[1] / Math.max(1, total)) + 0.04 * margin));

  // Never guess PHEV from generic hybrid evidence. If PHEV wins without any
  // independent plug in signal and another powertrain has meaningful support,
  // preserve ambiguity instead of contaminating valuation cohorts.
  if (best[0] === "plug_in_hybrid" && !explicitPhev && second && second[1] >= 2) {
    return { fuelType: "other", confidence: Math.min(confidence, 0.49), evidence, contradictions };
  }
  if (margin <= 1 && second && second[1] > 0) {
    return { fuelType: "other", confidence: Math.min(confidence, 0.49), evidence, contradictions };
  }

  return { fuelType: best[0], confidence, evidence, contradictions };
}
