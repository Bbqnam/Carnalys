/**
 * How comparable is *this specific candidate* to the target car — not just
 * "same make/model", but same generation, same facelift, same drivetrain,
 * a plausible trim/performance match, and a nearby year/mileage.
 *
 * This replaces the old boolean tier cascade (`tier1`/`tier1Wide`/`tier1Fuel`)
 * with a single continuous score. The tier cascade could only ever say "in" or
 * "out"; it had no way to say "this facelift model is somewhat relevant but
 * should not dominate", which is exactly the failure mode that let a cohort
 * mixing pre-facelift and facelift (or base and M-Sport-equivalent) cars pull
 * a valuation upward. See `docs/` / the BMW X3 regression test for the
 * concrete case this fixes.
 *
 * Every sub-score is normalized to 0..1, where 0.5 always means "we don't
 * know" rather than "confirmed different" — an unpopulated field (most makes
 * have no generation/facelift calibration yet) must never be read as a
 * mismatch. The weights below are a starting calibration, not a claim of
 * precision; they encode relative importance (generation/mileage matter far
 * more than seller type), not an exact market model.
 */

export type ComparableTier = "A" | "B" | "C" | "D";

export interface SimilarityVehicle {
  fuelType: string;
  powertrainType?: string | null;
  transmission: string;
  drivetrain: string | null;
  bodyStyle: string;
  generation: string | null;
  facelift: boolean | null;
  trim: string | null;
  performanceVariant: string | null;
  modelYear: number;
}

export interface SimilarityTarget extends SimilarityVehicle {
  mileageKm: number;
  sellerType: string;
}

export interface SimilarityCandidate extends SimilarityVehicle {
  mileageKm: number;
  sellerType: string;
  /** When this listing's state was last confirmed — drives the recency score. */
  observedAt: Date;
}

export interface SimilarityResult {
  /** 0..100. */
  score: number;
  tier: ComparableTier;
  /** Human-readable, most-significant first — for future comparable explainability (UI). */
  reasons: string[];
  /** `true` when the candidate must be excluded outright (different fuel type). */
  hardReject: boolean;
}

const WEIGHTS = {
  generation: 14,
  facelift: 6,
  drivetrain: 14,
  transmission: 6,
  trim: 7,
  performanceVariant: 8,
  body: 6,
  modelYear: 12,
  mileage: 18,
  sellerType: 4,
  recency: 5,
} as const;

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0); // 100

/** Beyond this year gap a comparable carries no year-proximity credit at all. */
const MODEL_YEAR_SPREAD = 6;
/** Beyond this mileage gap a comparable carries no mileage-proximity credit. */
const MILEAGE_SPREAD_KM = 60_000;
/** Recency half-life for the *scoring* component (a small nudge into tiering). */
export const RECENCY_HALF_LIFE_DAYS = 45;

const TIER_A_MIN = 82;
const TIER_B_MIN = 65;
const TIER_C_MIN = 45;

function decay(diff: number, spread: number): number {
  return Math.max(0, 1 - Math.abs(diff) / spread);
}

/**
 * Exponential recency decay, `0.5` at `halfLifeDays`. Used both as a small
 * component of the similarity score and, more importantly, as a direct
 * multiplier on a comparable's weight in the valuation itself — so a
 * nine-month-old observation can still explain the market's shape but can no
 * longer move today's estimate much. See `docs` Phase 9.
 */
export function recencyDecayFactor(
  observedAt: Date,
  now: Date,
  halfLifeDays = RECENCY_HALF_LIFE_DAYS,
): number {
  const ageDays = Math.max(0, (now.getTime() - observedAt.getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function eq(a: string | null, b: string | null): boolean {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

/**
 * Unknown defaults to 0.75, not 0.5: most makes have no generation/facelift
 * calibration yet and many listings lack a parsed drivetrain, so "we don't
 * know" is the common case, not a rare edge case. Treating it as only
 * half-confidence compounds across several components at once and can keep
 * an otherwise identical car out of Tier A — the absence of a signal is not
 * evidence of a mismatch.
 */
function scoreComponent(
  targetValue: string | null,
  candidateValue: string | null,
  matchScore: number,
  mismatchScore: number,
  unknownScore = 0.75,
): number {
  if (targetValue == null || candidateValue == null) return unknownScore;
  return eq(targetValue, candidateValue) ? matchScore : mismatchScore;
}

export function scoreComparable(
  target: SimilarityTarget,
  candidate: SimilarityCandidate,
  now: Date = new Date(),
): SimilarityResult {
  // A classified powertrain is the strongest gate. It lets a source that
  // files an MHEV under petrol compare with another correctly identified MHEV,
  // while still separating HEV/PHEV/MHEV/BEV. Legacy rows without the finer
  // class fall back to the public fuel enum.
  const targetPowertrain = target.powertrainType;
  const candidatePowertrain = candidate.powertrainType;
  if (
    targetPowertrain &&
    candidatePowertrain &&
    targetPowertrain !== "unknown" &&
    candidatePowertrain !== "unknown" &&
    targetPowertrain !== candidatePowertrain
  ) {
    return { score: 0, tier: "D", reasons: ["Different powertrain class"], hardReject: true };
  }
  if (
    (!targetPowertrain || targetPowertrain === "unknown" ||
      !candidatePowertrain || candidatePowertrain === "unknown") &&
    target.fuelType !== "other" &&
    candidate.fuelType !== "other" &&
    target.fuelType !== candidate.fuelType
  ) {
    return { score: 0, tier: "D", reasons: ["Different fuel type"], hardReject: true };
  }

  const reasons: string[] = [];
  let weighted = 0;

  // --- generation + facelift ---
  const generationScore = scoreComponent(target.generation, candidate.generation, 1, 0);
  weighted += WEIGHTS.generation * generationScore;
  if (target.generation && candidate.generation) {
    reasons.push(
      generationScore === 1
        ? `Same generation (${target.generation})`
        : `Different generation (${target.generation} vs ${candidate.generation})`,
    );
  }

  let faceliftScore = 0.75;
  if (target.facelift != null && candidate.facelift != null) {
    faceliftScore = target.facelift === candidate.facelift ? 1 : 0.25;
    reasons.push(
      faceliftScore === 1
        ? `Same facelift status (${target.facelift ? "facelift" : "pre-facelift"})`
        : `Different facelift status (${target.facelift ? "facelift" : "pre-facelift"} vs ${candidate.facelift ? "facelift" : "pre-facelift"})`,
    );
  }
  weighted += WEIGHTS.facelift * faceliftScore;

  // --- drivetrain + transmission ---
  const drivetrainScore = scoreComponent(target.drivetrain, candidate.drivetrain, 1, 0);
  weighted += WEIGHTS.drivetrain * drivetrainScore;
  if (target.drivetrain && candidate.drivetrain) {
    reasons.push(
      drivetrainScore === 1 ? `Same drivetrain (${target.drivetrain})` : "Different drivetrain",
    );
  }

  const transmissionScore = scoreComponent(target.transmission, candidate.transmission, 1, 0);
  weighted += WEIGHTS.transmission * transmissionScore;
  if (transmissionScore === 1 && target.transmission !== "other") {
    reasons.push(`Same transmission (${target.transmission})`);
  }

  // --- trim + performance variant ---
  // `trim` vocab coverage is partial, so "both null" is genuinely ambiguous;
  // `performanceVariant` detection is a confident whole-token match, so "both
  // null" reliably means "both base cars" and earns full credit.
  const trimScore = scoreComponent(target.trim, candidate.trim, 1, 0.2, 0.65);
  weighted += WEIGHTS.trim * trimScore;
  if (target.trim && candidate.trim) {
    reasons.push(trimScore === 1 ? `Same trim (${target.trim})` : `Different trim (${target.trim} vs ${candidate.trim})`);
  }

  const performanceScore =
    target.performanceVariant == null && candidate.performanceVariant == null
      ? 1
      : eq(target.performanceVariant, candidate.performanceVariant)
        ? 1
        : 0.15;
  weighted += WEIGHTS.performanceVariant * performanceScore;
  if (performanceScore < 1 && (target.performanceVariant || candidate.performanceVariant)) {
    reasons.push(
      `Different performance variant (${target.performanceVariant ?? "base"} vs ${candidate.performanceVariant ?? "base"})`,
    );
  }

  // --- body style ---
  const bodyScore =
    target.bodyStyle === "other" || candidate.bodyStyle === "other"
      ? 0.6
      : target.bodyStyle === candidate.bodyStyle
        ? 1
        : 0.1;
  weighted += WEIGHTS.body * bodyScore;

  // --- model year proximity ---
  const yearScore = decay(target.modelYear - candidate.modelYear, MODEL_YEAR_SPREAD);
  weighted += WEIGHTS.modelYear * yearScore;

  // --- mileage proximity ---
  const mileageDiff = Math.abs(target.mileageKm - candidate.mileageKm);
  const mileageScore = decay(mileageDiff, MILEAGE_SPREAD_KM);
  weighted += WEIGHTS.mileage * mileageScore;
  if (mileageScore >= 0.75) {
    reasons.unshift(`Mileage within ${Math.round(mileageDiff / 100) * 100} km`);
  }

  // --- seller type ---
  const sellerScore = target.sellerType === candidate.sellerType ? 1 : 0.6;
  weighted += WEIGHTS.sellerType * sellerScore;

  // --- recency ---
  const recencyScore = recencyDecayFactor(candidate.observedAt, now, RECENCY_HALF_LIFE_DAYS);
  weighted += WEIGHTS.recency * recencyScore;

  const score = Math.round((weighted / TOTAL_WEIGHT) * 100);
  const tier: ComparableTier =
    score >= TIER_A_MIN ? "A" : score >= TIER_B_MIN ? "B" : score >= TIER_C_MIN ? "C" : "D";

  if (yearScore >= 0.83) reasons.unshift(`Same model year (${target.modelYear})`);

  return { score, tier, reasons: reasons.slice(0, 6), hardReject: false };
}

/** How much a comparable's price influences the valuation, before recency. */
export function tierWeight(tier: ComparableTier): number {
  switch (tier) {
    case "A":
      return 1.0;
    case "B":
      return 0.65;
    case "C":
      return 0.35;
    case "D":
      return 0.15;
  }
}
