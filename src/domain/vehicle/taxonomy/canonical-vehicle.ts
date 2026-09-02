import type { BodyStyle, FuelType } from "@/domain/vehicle/specifications";
import { findMakeRule, type GenerationBand, type ModelRule } from "./rules";
import {
  ABSORBABLE_MODEL_SUFFIXES,
  BODY_TOKENS,
  FUEL_TOKENS,
  normalizeEngineBadge,
  PERFORMANCE_FALSE_FRIENDS,
  PERFORMANCE_TOKENS,
  TRIM_TOKENS,
  tidyEngineBadgeCasing,
  tidyModelString,
} from "./tokens";

/**
 * Bump when the rules or pipeline change in a way that should re-classify
 * stored vehicles. The backfill targets rows below this; ingestion writes it.
 */
export const CURRENT_NORMALIZATION_VERSION = 1;

export interface CanonicalVehicleInput {
  make: string;
  model: string;
  variant?: string | null;
  /** Listing title — extra context for token detection (Blocket often lacks it). */
  title?: string | null;
  bodyStyle: BodyStyle;
  fuelType: FuelType;
  modelYear?: number | null;
}

export interface CanonicalVehicle {
  make: string;
  model: string;
  /** Source variant, tidied but content-preserved (provenance). */
  variant: string | null;
  generation: string | null;
  trim: string | null;
  performanceVariant: string | null;
  bodyStyle: BodyStyle;
  fuelType: FuelType;
  rawMake: string;
  rawModel: string;
  normalizationVersion: number;
  /**
   * Dimensions where a token disagreed with a *set* source enum. Not applied
   * (conservative), surfaced for the future data-quality diagnostic.
   */
  contradictions: readonly string[];
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase());
}

function canonicalMake(raw: string): string {
  const rule = findMakeRule(raw);
  if (rule) return rule.canonical;
  const trimmed = raw.trim();
  // Unknown make: only fix the obvious ALLCAPS case, otherwise leave it.
  if (/^[A-ZÅÄÖ0-9 .&-]{3,}$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
    return titleCase(trimmed);
  }
  return trimmed;
}

function generationFromYear(
  bands: readonly GenerationBand[],
  modelYear: number | null | undefined,
): string | null {
  if (!modelYear) return null;
  // Prefer the band whose window centre is closest — bands overlap by a year.
  let best: { label: string; distance: number } | null = null;
  for (const band of bands) {
    if (modelYear < band.from || modelYear >= band.to) continue;
    const centre = (band.from + band.to) / 2;
    const distance = Math.abs(modelYear - centre);
    if (!best || distance < best.distance) best = { label: band.label, distance };
  }
  return best?.label ?? null;
}

/** Strip a universal body/powertrain suffix from a family string. */
function stripAbsorbableSuffix(family: string): {
  family: string;
  body?: BodyStyle;
  fuel?: FuelType;
} {
  let current = family;
  let body: BodyStyle | undefined;
  let fuel: FuelType | undefined;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of ABSORBABLE_MODEL_SUFFIXES) {
      if (suffix.re.test(current)) {
        current = current.replace(suffix.re, "").trim();
        if (suffix.body) body = suffix.body;
        if (suffix.fuel) fuel = suffix.fuel;
        changed = true;
      }
    }
  }
  return { family: current || family, body, fuel };
}

function detectBody(haystack: string): BodyStyle | undefined {
  for (const token of BODY_TOKENS) if (token.re.test(haystack)) return token.body;
  return undefined;
}

function detectFuel(haystack: string): FuelType | undefined {
  for (const token of FUEL_TOKENS) if (token.re.test(haystack)) return token.fuel;
  return undefined;
}

function detectFromVocab(source: string, vocab: readonly string[]): string | null {
  const lower = source.toLowerCase();
  for (const term of vocab) {
    // Boundary excludes `-` so a standalone token ("R", "S") never matches the
    // hyphenated appearance package ("R-Line", "S-line"); includes `|` for the
    // pipe-delimited variant strings some sources use.
    const re = new RegExp(`(?:^|[\\s(/|])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase()}(?:$|[\\s)/|])`);
    if (re.test(lower)) return term;
  }
  return null;
}

function applyModelRule(
  tidyModel: string,
  ruleHaystack: string,
  modelYear: number | null | undefined,
  rules: readonly ModelRule[] | undefined,
): { family: string; generation: string | null; body?: BodyStyle; fuel?: FuelType } | null {
  if (!rules) return null;
  for (const rule of rules) {
    // `match` sees model + variant + title so a sub-model named only in the
    // variant ("Golf I" whose variant says "Sportsvan") is still caught;
    // `except` stays on the model string alone so a stray variant word can't
    // exclude a correct family.
    if (rule.except?.test(tidyModel)) continue;
    if (!rule.match.test(ruleHaystack)) continue;
    return {
      family: rule.family,
      generation: rule.generationByYear
        ? generationFromYear(rule.generationByYear, modelYear)
        : null,
      body: rule.bodyHint,
      fuel: rule.fuelHint,
    };
  }
  return null;
}

/**
 * The single canonical taxonomy transform. Pure and deterministic. Runs
 * downstream of every marketplace normalizer (in `writeListing`) and over
 * stored rows in the backfill, so marketplace naming never defines identity.
 *
 * Every inference is conservative: `generation` / `trim` / `performanceVariant`
 * are `null` unless a confident match exists, and `bodyStyle` / `fuelType` are
 * only ever filled when the source value is `other` — a set source enum is
 * never overwritten (a disagreement is recorded in `contradictions`).
 */
export function canonicalizeVehicle(input: CanonicalVehicleInput): CanonicalVehicle {
  const rawMake = input.make;
  const rawModel = input.model;
  const variant = input.variant?.trim() || null;

  const make = canonicalMake(rawMake);
  const rule = findMakeRule(rawMake);

  const tidyModel = normalizeEngineBadge(
    make,
    tidyEngineBadgeCasing(tidyModelString(rawModel)),
  );
  const tidyVariant = variant ? tidyModelString(variant) : "";
  const haystack = [tidyModel, tidyVariant, input.title ?? ""].join(" ").toLowerCase();
  const ruleHaystack = [tidyModel, tidyVariant, input.title ?? ""].join(" ");

  // --- model family + generation + body/fuel hints ---
  let family = tidyModel;
  let generation: string | null = null;
  const hintBody: BodyStyle[] = [];
  const hintFuel: FuelType[] = [];

  const ruled = applyModelRule(tidyModel, ruleHaystack, input.modelYear, rule?.models);
  if (ruled) {
    family = ruled.family;
    generation = ruled.generation;
    if (ruled.body) hintBody.push(ruled.body);
    if (ruled.fuel) hintFuel.push(ruled.fuel);
  } else {
    const stripped = stripAbsorbableSuffix(family);
    family = stripped.family;
    if (stripped.body) hintBody.push(stripped.body);
    if (stripped.fuel) hintFuel.push(stripped.fuel);
  }
  // Universal suffix strip also runs on ruled families that kept a suffix
  // (e.g. a rule family that itself ends in "Plug-In Hybrid" — none today, but
  // cheap insurance and idempotent).
  const strippedRuled = stripAbsorbableSuffix(family);
  family = strippedRuled.family;
  if (strippedRuled.body) hintBody.push(strippedRuled.body);
  if (strippedRuled.fuel) hintFuel.push(strippedRuled.fuel);

  const tokenBody = detectBody(haystack);
  if (tokenBody) hintBody.push(tokenBody);
  const tokenFuel = detectFuel(haystack);
  if (tokenFuel) hintFuel.push(tokenFuel);

  // --- body style: fill only when source is `other` ---
  const contradictions: string[] = [];
  let bodyStyle = input.bodyStyle;
  if (bodyStyle === "other" && hintBody.length > 0) {
    bodyStyle = hintBody[0];
  } else if (bodyStyle !== "other" && hintBody.length > 0 && !hintBody.includes(bodyStyle)) {
    contradictions.push(`bodyStyle: source=${input.bodyStyle} tokens=${[...new Set(hintBody)].join("/")}`);
  }

  // --- fuel type: fill only when source is `other` ---
  let fuelType = input.fuelType;
  if (fuelType === "other" && hintFuel.length > 0) {
    fuelType = hintFuel[0];
  } else if (fuelType !== "other" && hintFuel.length > 0 && !hintFuel.includes(fuelType)) {
    contradictions.push(`fuelType: source=${input.fuelType} tokens=${[...new Set(hintFuel)].join("/")}`);
  }

  // --- trim + performance variant (from variant, then title) ---
  const trimSource = [variant ?? "", input.title ?? ""].join(" ");
  // An appearance package ("R-Line", "AMG Line", "S line") is a trim, never a
  // performance variant — strip those before looking for a real perf badge.
  const perfSource = trimSource.replace(PERFORMANCE_FALSE_FRIENDS, " ");
  const performanceVariant = detectFromVocab(perfSource, PERFORMANCE_TOKENS);
  let trim = detectFromVocab(trimSource, TRIM_TOKENS);
  // A performance variant is not also a trim ("R" / "GTI" etc.).
  if (trim && performanceVariant && trim.toLowerCase() === performanceVariant.toLowerCase()) {
    trim = null;
  }
  // "GTE" performance line is a plug-in hybrid.
  if (performanceVariant && /^gte$/i.test(performanceVariant) && fuelType === "other") {
    fuelType = "plug_in_hybrid";
  }

  return {
    make,
    model: family.trim() || tidyModel,
    variant,
    generation,
    trim,
    performanceVariant,
    bodyStyle,
    fuelType,
    rawMake,
    rawModel,
    normalizationVersion: CURRENT_NORMALIZATION_VERSION,
    contradictions,
  };
}
