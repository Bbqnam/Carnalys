import type { BodyStyle, FuelType } from "@/domain/vehicle/specifications";

/**
 * Per-make canonicalization rules.
 *
 * Only makes the production audit proved are fragmented or collapsed carry
 * `models` rules; every other make gets the generic pipeline
 * (`canonical-vehicle.ts`): make-alias resolution + universal suffix stripping +
 * token-based body/fuel fill. The rule table is deliberately small — structured
 * fields and token vocab do most of the work.
 */

export interface GenerationBand {
  readonly from: number;
  readonly to: number;
  readonly label: string;
  /**
   * Model year from which this generation's mid-cycle refresh (facelift/LCI)
   * applies. Omit when the generation has no known facelift split, or the
   * split isn't calibrated yet — `facelift` then stays `null`, never `false`,
   * so "unknown" is never read as "confirmed pre-facelift" by comparability
   * scoring.
   */
  readonly faceliftFrom?: number;
}

export interface ModelRule {
  /** Canonical family produced when `match` hits (and `except` does not). */
  readonly family: string;
  /** Tested against the tidied raw model, case-insensitive. First hit wins. */
  readonly match: RegExp;
  /** If this also matches, the rule is skipped — lets `XCeed` beat `Ceed`. */
  readonly except?: RegExp;
  /** Model-year → generation label, applied only when the family is the base. */
  readonly generationByYear?: readonly GenerationBand[];
  /** Force a body style (still only fills when the source value is `other`). */
  readonly bodyHint?: BodyStyle;
  /** Force a fuel type (still only fills when the source value is `other`). */
  readonly fuelHint?: FuelType;
}

export interface MakeRule {
  readonly canonical: string;
  /** Lowercased, non-alphanumeric stripped. */
  readonly aliases: readonly string[];
  readonly models?: readonly ModelRule[];
}

const GOLF_GENERATIONS: readonly GenerationBand[] = [
  { from: 1974, to: 1983, label: "Mk1" },
  { from: 1983, to: 1992, label: "Mk2" },
  { from: 1991, to: 1997, label: "Mk3" },
  { from: 1997, to: 2004, label: "Mk4" },
  { from: 2003, to: 2009, label: "Mk5" },
  { from: 2008, to: 2013, label: "Mk6" },
  // Mk7.5 facelift arrived for MY2018.
  { from: 2012, to: 2020, label: "Mk7", faceliftFrom: 2018 },
  { from: 2019, to: 2031, label: "Mk8" },
];

const MEGANE_GENERATIONS: readonly GenerationBand[] = [
  { from: 1995, to: 2003, label: "I" },
  { from: 2002, to: 2009, label: "II" },
  { from: 2008, to: 2016, label: "III" },
  { from: 2015, to: 2023, label: "IV" },
  { from: 2022, to: 2031, label: "E-Tech" },
];

/** Approximate — refine as production data exposes edge cases, same as the
 *  bands above. Octavia Mk3 facelifted for MY2017. */
const OCTAVIA_GENERATIONS: readonly GenerationBand[] = [
  { from: 2004, to: 2013, label: "Mk2" },
  { from: 2012, to: 2020, label: "Mk3", faceliftFrom: 2017 },
  { from: 2019, to: 2031, label: "Mk4" },
];

/** Ceed Mk3 (CD) facelifted for MY2022. */
const CEED_GENERATIONS: readonly GenerationBand[] = [
  { from: 2006, to: 2012, label: "Mk1" },
  { from: 2012, to: 2018, label: "Mk2" },
  { from: 2018, to: 2031, label: "Mk3", faceliftFrom: 2022 },
];

/** Volvo V60 Mk2 (2018-) facelifted for MY2023. */
const V60_GENERATIONS: readonly GenerationBand[] = [
  { from: 2010, to: 2018, label: "Mk1" },
  { from: 2018, to: 2031, label: "Mk2", faceliftFrom: 2023 },
];

/** Volvo XC60 Mk2 (2017-) facelifted for MY2022. */
const XC60_GENERATIONS: readonly GenerationBand[] = [
  { from: 2008, to: 2017, label: "Mk1" },
  { from: 2017, to: 2031, label: "Mk2", faceliftFrom: 2022 },
];

/** BMW X3 G01 (2017-) facelifted (LCI) for MY2022. */
const X3_GENERATIONS: readonly GenerationBand[] = [
  { from: 2003, to: 2010, label: "E83" },
  { from: 2010, to: 2017, label: "F25" },
  { from: 2017, to: 2024, label: "G01", faceliftFrom: 2022 },
  { from: 2023, to: 2031, label: "G45" },
];

export const MAKE_RULES: readonly MakeRule[] = [
  {
    canonical: "Kia",
    aliases: ["kia"],
    models: [
      // XCeed / ProCeed are distinct models — must be checked before Ceed.
      { family: "XCeed", match: /\bx[\s_-]?cee'?d\b/i },
      { family: "ProCeed", match: /\bpro[\s_-]?cee'?d\b/i },
      {
        family: "Ceed",
        match: /\bcee'?d\b/i,
        except: /\bx[\s_-]?cee'?d\b|\bpro[\s_-]?cee'?d\b/i,
        generationByYear: CEED_GENERATIONS,
      },
      { family: "Niro", match: /\b(?:e[\s-]?)?niro\b/i },
    ],
  },
  {
    canonical: "Volkswagen",
    aliases: ["volkswagen", "vw"],
    models: [
      // Distinct sub-models first.
      { family: "Golf Sportsvan", match: /\bgolf\b.*\bsportsvan\b|\bsportsvan\b/i, bodyHint: "minivan" },
      { family: "Golf Plus", match: /\bgolf\b.*\bplus\b/i, bodyHint: "minivan" },
      { family: "Golf Alltrack", match: /\bgolf\b.*\balltrack\b/i, bodyHint: "estate" },
      // Everything else "Golf …" (incl. the mislabelled "Golf I") is the family
      // Golf; the roman numeral in the string is not trusted (audit: "Golf I"
      // has model years up to 2027), the generation comes from the model year.
      { family: "Golf", match: /\bgolf\b/i, generationByYear: GOLF_GENERATIONS },
    ],
  },
  {
    canonical: "Volvo",
    aliases: ["volvo"],
    models: [
      { family: "V60 Cross Country", match: /\bv60\b.*\bcross country\b/i, bodyHint: "estate" },
      { family: "V90 Cross Country", match: /\bv90\b.*\bcross country\b/i, bodyHint: "estate" },
      { family: "V60", match: /\bv60\b/i, bodyHint: "estate", generationByYear: V60_GENERATIONS },
      { family: "V90", match: /\bv90\b/i, bodyHint: "estate" },
      { family: "V70", match: /\bv70\b/i, bodyHint: "estate" },
      { family: "XC60", match: /\bxc\s?60\b/i, bodyHint: "suv", generationByYear: XC60_GENERATIONS },
      { family: "XC90", match: /\bxc\s?90\b/i, bodyHint: "suv" },
      { family: "XC40", match: /\bxc\s?40\b/i, bodyHint: "suv" },
    ],
  },
  {
    canonical: "Toyota",
    aliases: ["toyota"],
    models: [
      // Cross (SUV) and Verso (MPV) are different vehicles from the Corolla.
      { family: "Corolla Cross", match: /\bcorolla\b.*\bcross\b/i },
      { family: "Corolla Verso", match: /\bcorolla\b.*\bverso\b/i },
      { family: "Corolla", match: /\bcorolla\b/i, except: /\bcross\b|\bverso\b/i },
      { family: "RAV4", match: /\brav\s?4\b/i },
      { family: "ProAce", match: /\bpro\s?ace\b/i },
    ],
  },
  {
    canonical: "Renault",
    aliases: ["renault"],
    models: [
      { family: "Megane", match: /\bm[eé]gane\b/i, generationByYear: MEGANE_GENERATIONS },
      { family: "Clio", match: /\bclio\b/i },
      { family: "Scenic", match: /\bsc[eé]nic\b/i, except: /\bgrand\b/i },
    ],
  },
  {
    canonical: "Hyundai",
    aliases: ["hyundai"],
    models: [
      { family: "Ioniq 5", match: /\bioniq\s?5\b/i },
      { family: "Ioniq 6", match: /\bioniq\s?6\b/i },
      { family: "Ioniq", match: /\bioniq\b/i, except: /\bioniq\s?[56]\b/i },
      { family: "i30", match: /\bi\s?30\b/i },
    ],
  },
  {
    canonical: "Mercedes-Benz",
    aliases: ["mercedesbenz", "mercedes", "merc"],
    models: [
      // Blocket bakes the engine/tonnage code into the model for the vans.
      { family: "Sprinter", match: /\bsprinter\b/i, bodyHint: "van" },
      { family: "Vito", match: /\bvito\b/i, bodyHint: "van" },
      { family: "Citan", match: /\bcitan\b/i },
      { family: "V-Class", match: /\bv[\s-]?class\b|\bv\s?250\b|\bv\s?300\b|\bv\s?220\b/i, bodyHint: "minivan" },
    ],
  },
  {
    canonical: "Porsche",
    aliases: ["porsche"],
    models: [
      // Trim/performance ("Carrera", "GT3", "Turbo S") is not a separate model.
      { family: "911", match: /\b911\b|\bcarrera\b/i },
      { family: "Cayenne", match: /\bcayenne\b/i },
      { family: "Macan", match: /\bmacan\b/i },
      { family: "Panamera", match: /\bpanamera\b/i },
      { family: "Taycan", match: /\btaycan\b/i },
    ],
  },
  // Alias-only entries: no model rules, just canonical brand styling.
  { canonical: "SEAT", aliases: ["seat"] },
  { canonical: "CUPRA", aliases: ["cupra"] },
  {
    canonical: "BMW",
    aliases: ["bmw"],
    models: [
      // "X3 M" (the M performance model) is a materially different car from a
      // regular X3 and must not share its generation calibration.
      { family: "X3 M", match: /\bx3\s?m\b/i },
      { family: "X3", match: /\bx3\b/i, bodyHint: "suv", generationByYear: X3_GENERATIONS },
    ],
  },
  { canonical: "Audi", aliases: ["audi"] },
  {
    canonical: "Skoda",
    aliases: ["skoda", "škoda"],
    models: [
      { family: "Octavia", match: /\boctavia\b/i, generationByYear: OCTAVIA_GENERATIONS },
    ],
  },
  { canonical: "Nissan", aliases: ["nissan"] },
  { canonical: "Peugeot", aliases: ["peugeot"] },
  { canonical: "Citroen", aliases: ["citroen", "citroën"] },
  { canonical: "Ford", aliases: ["ford"] },
  { canonical: "Opel", aliases: ["opel"] },
  { canonical: "Tesla", aliases: ["tesla"] },
  { canonical: "Mazda", aliases: ["mazda"] },
  { canonical: "Honda", aliases: ["honda"] },
  { canonical: "Mitsubishi", aliases: ["mitsubishi"] },
  { canonical: "Subaru", aliases: ["subaru"] },
  { canonical: "Suzuki", aliases: ["suzuki"] },
  { canonical: "Land Rover", aliases: ["landrover"] },
  { canonical: "Jaguar", aliases: ["jaguar"] },
  { canonical: "MINI", aliases: ["mini"] },
  { canonical: "Dacia", aliases: ["dacia"] },
  { canonical: "Polestar", aliases: ["polestar"] },
  { canonical: "BYD", aliases: ["byd"] },
  { canonical: "XPeng", aliases: ["xpeng"] },
  { canonical: "NIO", aliases: ["nio"] },
  { canonical: "Rolls-Royce", aliases: ["rollsroyce"] },
  { canonical: "Alfa Romeo", aliases: ["alfaromeo"] },
  { canonical: "Lynk & Co", aliases: ["lynkco", "lynkandco"] },
  { canonical: "DS", aliases: ["ds", "dsautomobiles"] },
];

const RULE_BY_ALIAS = new Map<string, MakeRule>();
for (const rule of MAKE_RULES) {
  for (const alias of rule.aliases) RULE_BY_ALIAS.set(alias, rule);
}

export function makeAliasKey(make: string): string {
  return make.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findMakeRule(make: string): MakeRule | undefined {
  return RULE_BY_ALIAS.get(makeAliasKey(make));
}
