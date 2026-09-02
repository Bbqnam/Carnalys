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
  { from: 2012, to: 2020, label: "Mk7" },
  { from: 2019, to: 2031, label: "Mk8" },
];

const MEGANE_GENERATIONS: readonly GenerationBand[] = [
  { from: 1995, to: 2003, label: "I" },
  { from: 2002, to: 2009, label: "II" },
  { from: 2008, to: 2016, label: "III" },
  { from: 2015, to: 2023, label: "IV" },
  { from: 2022, to: 2031, label: "E-Tech" },
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
      { family: "V60", match: /\bv60\b/i, bodyHint: "estate" },
      { family: "V90", match: /\bv90\b/i, bodyHint: "estate" },
      { family: "V70", match: /\bv70\b/i, bodyHint: "estate" },
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
  { canonical: "BMW", aliases: ["bmw"] },
  { canonical: "Audi", aliases: ["audi"] },
  { canonical: "Skoda", aliases: ["skoda", "škoda"] },
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
