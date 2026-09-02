import type { BodyStyle, FuelType } from "@/domain/vehicle/specifications";

/**
 * Token vocabularies shared by every make. These are the source-agnostic
 * signals: a marketplace can call a wagon Kia "Ceed SW", "Ceed Sportswagon" or
 * "Ceed Kombi", but the token always means the same canonical dimension.
 *
 * Frequencies in the comments are from the production audit (active listings).
 * Keep this list conservative: a token only earns a place here if it means the
 * same thing across makes. Make-specific quirks live in `rules.ts`.
 */

/** Body-style tokens. Matched against `model + variant + title`, lowercased. */
export const BODY_TOKENS: ReadonlyArray<{ re: RegExp; body: BodyStyle }> = [
  { re: /\bsportswagon\b/, body: "estate" }, // 202
  { re: /\bsportscombi\b/, body: "estate" }, // VW Golf/Passat wagon
  { re: /\btouring sports\b/, body: "estate" }, // 294 (Toyota)
  { re: /\bkombi\b/, body: "estate" }, // 3058
  { re: /\bavant\b/, body: "estate" }, // 2844 (Audi)
  { re: /\bvariant\b/, body: "estate" }, // VW/Skoda wagon suffix
  { re: /\b(?:sw|s\/w)\b/, body: "estate" }, // Kia/Peugeot "SW"
  { re: /\bestate\b/, body: "estate" },
  { re: /\bfarmari\b/, body: "estate" }, // Finnish, occasionally leaks in
  { re: /\bhalvkombi\b/, body: "hatchback" },
  { re: /\bhatchback\b/, body: "hatchback" },
  { re: /\bliftback\b/, body: "hatchback" },
  { re: /\b[35]-?d(?:örrar|örrars|oor|oors|rs)?\b/, body: "hatchback" }, // "5-dörrars"
  { re: /\bhalvkombi\b/, body: "hatchback" },
  { re: /\bshooting brake\b/, body: "estate" }, // Mercedes CLA/CLS wagon
  { re: /\bsedan\b/, body: "sedan" },
  { re: /\bcoup[eé]\b/, body: "coupe" },
  { re: /\bcabriolet\b|\bconvertible\b|\bcabrio\b/, body: "convertible" },
  { re: /\bpick[\s-]?up\b/, body: "pickup" },
  { re: /\bminibuss\b|\bfamiljebuss\b/, body: "minivan" },
  { re: /\btransportbil\b|\bsk[åa]p\b/, body: "van" },
];

/** Powertrain tokens. Only ever used to fill `fuelType` when it is `other`. */
export const FUEL_TOKENS: ReadonlyArray<{ re: RegExp; fuel: FuelType }> = [
  { re: /\bplug[\s-]?in hybrid\b|\bphev\b|\bladdhybrid\b|\bplugin\b/, fuel: "plug_in_hybrid" }, // ~5k
  { re: /\btwin engine\b/, fuel: "plug_in_hybrid" }, // Volvo's old PHEV name
  { re: /\brecharge\b.*\bt[68]\b|\bt[68]\b.*\brecharge\b/, fuel: "plug_in_hybrid" }, // Volvo Recharge T6/T8
  { re: /\bmild ?hybrid\b|\bmhev\b|\belhybrid\b/, fuel: "self_charging_hybrid" },
  { re: /\bself[\s-]?charging hybrid\b/, fuel: "self_charging_hybrid" },
  { re: /\bbev\b|\belbil\b|\belectric\b/, fuel: "electric" },
];

/**
 * Universal model-name suffixes that always denote a canonical dimension, never
 * a distinct model. `Kia Ceed SW`, `Toyota Corolla Touring Sports` and
 * `Kia Ceed Plug-In Hybrid` all collapse to the base family with the dimension
 * captured on `bodyStyle` / `fuelType`.
 *
 * Deliberately NOT here: `Cross Country`, `Alltrack`, `Allroad`, `Scout`,
 * `Sportsvan`, `e-tron`, `Recharge`(as a model line) — those are value-material
 * sub-models and stay in the family string (or are handled per-make).
 */
export const ABSORBABLE_MODEL_SUFFIXES: ReadonlyArray<{ re: RegExp; body?: BodyStyle; fuel?: FuelType }> = [
  { re: /\s+plug[\s-]?in hybrid$/i, fuel: "plug_in_hybrid" },
  { re: /\s+phev$/i, fuel: "plug_in_hybrid" },
  { re: /\s+sportswagon(?:\s+plug[\s-]?in hybrid)?$/i, body: "estate" },
  { re: /\s+touring sports$/i, body: "estate" },
  { re: /\s+sw(?:\s+plug[\s-]?in hybrid)?$/i, body: "estate" },
  { re: /\s+kombi$/i, body: "estate" },
];

/**
 * Equipment / trim level vocabulary. Longest-match-first (checked in order), so
 * "Advance Plus" beats "Advance". Only a confident, whole-token match sets
 * `trim` — otherwise it stays null.
 */
export const TRIM_TOKENS: readonly string[] = [
  "Advance Plus",
  "Advance",
  "Action",
  "GT-Line",
  "GT Line",
  "Momentum",
  "Momentum Advanced",
  "Inscription",
  "Inscription Expression",
  "R-Design",
  "M Sport",
  "M-Sport",
  "S line",
  "S-line",
  "Style",
  "Active",
  "Active Plus",
  "Executive",
  "Ultimate",
  "Premium",
  "Business",
  "Elegance",
  "Ambition",
  "Style Plus",
  "Core",
  "Plus",
  "Pro",
  "Life",
  "Move",
];

/**
 * Performance / high-output variants — priced well apart from the base model.
 * The cohort tiers gate on this ONLY when the target itself has one, so a base
 * car is never excluded for lacking it. Kept deliberately short and
 * unambiguous: an appearance/trim package that merely borrows the letter
 * ("R-Line", "R-Design", "AMG Line", "N Line") is NOT a performance variant, so
 * bare "R"/"AMG"/"N" are matched only as whole standalone tokens (see
 * `detectFromVocab`), and "R-Line"/"AMG Line" are excluded outright below.
 */
export const PERFORMANCE_TOKENS: readonly string[] = [
  "GT3 RS",
  "GT2 RS",
  "GT3",
  "Type R",
  "Black Series",
  "Polestar Engineered",
  "GTI",
  "GTE", // VW Golf/Passat PHEV performance line — also implies plug_in_hybrid
  "GTD",
  "T8", // Volvo top PHEV output — a genuine value step over T5/T6
  "M340i",
  "M240i",
  "M140i",
  "M135i",
  "Nismo",
  "quattro RS",
  "RS", // Audi/Ford RS — guarded to a standalone token
  "R", // VW Golf/Passat R — guarded; must not match "R-Line" / "R-Design"
];

/** Trim/appearance packages that must never be read as a performance variant. */
export const PERFORMANCE_FALSE_FRIENDS = /\bR[\s-]?line\b|\bR[\s-]?design\b|\bAMG[\s-]?line\b|\bN[\s-]?line\b|\bS[\s-]?line\b/i;

/** Non-destructive cleanup of a raw model string: whitespace + odd punctuation. */
export function tidyModelString(model: string): string {
  return model
    .replace(/[_]+/g, " ")
    .replace(/[´`]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .trim();
}

/** Lowercase a trailing engine-badge letter so `320D` === `320d`, `530D` === `530d`. */
export function tidyEngineBadgeCasing(model: string): string {
  return model.replace(/\b(\d{3})\s*([DdEeI i])\b/g, (_m, digits: string, letter: string) => `${digits}${letter.toLowerCase()}`);
}

/**
 * Collapse the many spellings of a German engine badge into one form, per the
 * make's own convention. Mercedes: `C 220 d` / `C220 d` / `C 220d` → `C220d`.
 * BMW: `320 D` / `320d` → `320d`; `M 340i` → `M340i`. Only the badge segment at
 * the start of the model is touched; anything after it is left intact.
 */
export function normalizeEngineBadge(canonicalMake: string, model: string): string {
  if (canonicalMake === "Mercedes-Benz") {
    return model.replace(
      /^([A-Za-z]{1,3})[\s-]*(\d{2,3})\s*(de|d|e)?\b/,
      (_m, cls: string, num: string, suffix: string | undefined) =>
        `${cls.toUpperCase()}${num}${(suffix ?? "").toLowerCase()}`,
    );
  }
  if (canonicalMake === "BMW") {
    return model
      .replace(/^(\d{3})\s*([A-Za-z]{1,2})?\b/, (_m, num: string, s: string | undefined) => `${num}${(s ?? "").toLowerCase()}`)
      .replace(/^(M)\s*(\d{2,3})\s*([A-Za-z])?\b/, (_m, m: string, num: string, s: string | undefined) => `${m}${num}${(s ?? "").toLowerCase()}`);
  }
  return model;
}
