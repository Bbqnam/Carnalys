import type { Locale } from "./copy";

export function intlLocale(locale: Locale) {
  return locale === "en" ? "en-SE" : "sv-SE";
}

export function createMoneyFormatter(locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    currency: "SEK",
    maximumFractionDigits: 0,
    style: "currency",
  });
}

export function createNumberFormatter(locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale));
}

/** Great-circle distance in km between two lat/lng points (haversine formula). */
export function distanceBetweenKm(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function formatExactListingDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}

export function formatRelativeListingDate(value: string, locale: Locale) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  const suffix = locale === "en" ? "ago" : "sedan";

  if (elapsedMinutes < 1) return locale === "en" ? "just now" : "just nu";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ${suffix}`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ${suffix}`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays}d ${suffix}`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${elapsedMonths}${locale === "en" ? "mo" : " mån"} ${suffix}`;
  }

  const elapsedYears = Math.floor(elapsedDays / 365);
  return `${elapsedYears}${locale === "en" ? "y" : " år"} ${suffix}`;
}

/** Tailwind border/text color classes for a Deal Score or Buy Confidence badge. */
export function scoreTone(value: number) {
  if (value >= 80) return "border-positive/50 text-positive";
  if (value >= 65) return "border-ink-subtle/60 text-ink-muted";
  return "border-negative/50 text-negative";
}

/** Text color class for a score factor's impact (positive/neutral/negative). */
export function factorImpactTone(impact: "positive" | "neutral" | "negative") {
  if (impact === "positive") return "text-positive";
  if (impact === "negative") return "text-negative";
  return "text-ink-muted";
}

/** Index (0-4) into a 5-tier "well below average" → "well above average" label list. */
export function factorTierIndex(score: number) {
  if (score < 25) return 0;
  if (score < 45) return 1;
  if (score < 65) return 2;
  if (score < 80) return 3;
  return 4;
}

/** Tinted chip background + text classes for a factor's tier label. */
export function factorChipTone(impact: "positive" | "neutral" | "negative") {
  if (impact === "positive") return "bg-accent-soft text-positive";
  if (impact === "negative") return "bg-negative-soft text-negative";
  return "bg-surface-muted text-ink-muted";
}

/** Fill color class for a factor's mini benchmark bar. */
export function factorBarTone(impact: "positive" | "neutral" | "negative") {
  if (impact === "positive") return "bg-positive";
  if (impact === "negative") return "bg-negative";
  return "bg-ink-subtle";
}

/** Tailwind classes for the dealer/private seller badge. */
export function sellerTypeTone(type: "dealer" | "private") {
  return type === "dealer"
    ? "border-accent/40 bg-accent-soft text-accent-strong"
    : "border-gold/40 bg-gold/12 text-gold";
}

/**
 * Fixed-order categorical colors for the ownership cost breakdown, validated
 * for CVD-safe adjacent contrast at ΔE >= 8 (see the data-viz palette
 * reference). Order matters — it's the safety mechanism, not cosmetic.
 */
export function ownershipCostCategoryTone(
  category: "depreciation" | "energy" | "insurance" | "maintenance" | "tax",
) {
  switch (category) {
    case "depreciation":
      return "bg-[#2a78d6]";
    case "energy":
      return "bg-[#eb6834]";
    case "insurance":
      return "bg-[#1baf7a]";
    case "maintenance":
      return "bg-[#eda100]";
    case "tax":
      return "bg-[#e87ba4]";
  }
}
