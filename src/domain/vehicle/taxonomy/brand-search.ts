import { makeAliasKey, MAKE_RULES } from "./rules";

/**
 * Query-time brand matching.
 *
 * Ingestion already canonicalizes `vehicle.make` ("vw" → "Volkswagen") via the
 * MAKE_RULES alias table. This module does the same job the other way round: it
 * takes whatever the user typed — a filter chip, a search token — and resolves
 * it to the canonical brand so "VW", "vw", or the transposed typo "WV" all find
 * Volkswagen cars.
 *
 * Two layers:
 *  - exact alias-key match (lowercased, non-alphanumerics stripped), the same
 *    keys ingestion uses;
 *  - a bounded Damerau-Levenshtein fuzzy match for typos, deliberately tight so
 *    a model code ("a4") never gets pulled to a brand ("audi").
 */

export interface KnownBrand {
  canonical: string;
  /** All alias keys plus the canonical's own key. */
  keys: readonly string[];
}

export const KNOWN_BRANDS: readonly KnownBrand[] = MAKE_RULES.map((rule) => ({
  canonical: rule.canonical,
  keys: [...new Set([makeAliasKey(rule.canonical), ...rule.aliases.map(makeAliasKey)])].filter(Boolean),
}));

const BRAND_BY_KEY = new Map<string, KnownBrand>();
for (const brand of KNOWN_BRANDS) {
  for (const key of brand.keys) if (!BRAND_BY_KEY.has(key)) BRAND_BY_KEY.set(key, brand);
}

/** Damerau-Levenshtein distance, capped: returns `max + 1` once it's exceeded. */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  let beforePrevious = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    beforePrevious = previous.slice();
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length] <= max ? previous[b.length] : max + 1;
}

// Short strings tolerate one edit (covers the "wv" → "vw" transposition);
// longer ones tolerate two, which catches "mercedez" / "volkswagon" without
// letting a three-letter model wander into a brand.
function maxDistanceFor(key: string): number {
  return key.length <= 5 ? 1 : 2;
}

/**
 * Resolve typed brand text to a canonical brand name, or null when there is no
 * confident single match. Exact alias keys win; otherwise a unique fuzzy match
 * within the bounded distance wins.
 */
export function resolveBrandAlias(input: string): string | null {
  const key = makeAliasKey(input);
  if (key.length < 2) return null;

  const exact = BRAND_BY_KEY.get(key);
  if (exact) return exact.canonical;

  const max = maxDistanceFor(key);
  let bestDistance = max + 1;
  let winners = new Set<string>();
  for (const brand of KNOWN_BRANDS) {
    let brandBest = max + 1;
    for (const candidate of brand.keys) {
      const distance = boundedEditDistance(key, candidate, max);
      if (distance < brandBest) brandBest = distance;
    }
    if (brandBest > max) continue;
    if (brandBest < bestDistance) {
      bestDistance = brandBest;
      winners = new Set([brand.canonical]);
    } else if (brandBest === bestDistance) {
      winners.add(brand.canonical);
    }
  }
  return winners.size === 1 ? [...winners][0] : null;
}

/**
 * Does a brand option (its canonical name) match what the user typed into a
 * searchable brand filter? Covers substring hits ("merc" → Mercedes-Benz) and
 * the same fuzzy resolution as {@link resolveBrandAlias}.
 */
export function brandOptionMatchesQuery(canonical: string, rawQuery: string): boolean {
  const key = makeAliasKey(rawQuery);
  if (!key) return true;
  const brand = KNOWN_BRANDS.find((entry) => entry.canonical === canonical);
  const keys = brand?.keys ?? [makeAliasKey(canonical)];
  if (keys.some((candidate) => candidate.includes(key) || key.includes(candidate))) return true;
  return resolveBrandAlias(rawQuery) === canonical;
}
