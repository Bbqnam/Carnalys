import type { Locale } from "@/features/search/copy";
import { intlLocale } from "@/features/search/format";

/**
 * Axis and cell labels have to stay readable at 11px in a grid that can be
 * seven columns wide, so prices are abbreviated rather than written out in
 * full. `exact` gives the unabbreviated figure for tooltips and headline
 * numbers, where there is room and precision is the point.
 */
export function compactMoney(value: number, locale: Locale, exact = false) {
  if (exact) {
    return `${Math.round(value).toLocaleString(intlLocale(locale))} kr`;
  }
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    const digits = Math.abs(millions) >= 10 ? 0 : 1;
    return `${millions.toLocaleString(intlLocale(locale), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })} ${locale === "en" ? "M" : "mkr"}`;
  }
  const thousands = Math.round(value / 1_000);
  return `${thousands.toLocaleString(intlLocale(locale))} ${locale === "en" ? "k" : "tkr"}`;
}

/** Kilometres in, Swedish mil out (1 mil = 10 km) — the unit every listing uses. */
export function formatMil(mileageKm: number, locale: Locale) {
  return Math.round(mileageKm / 10).toLocaleString(intlLocale(locale));
}

export function formatNumber(value: number, locale: Locale) {
  return Math.round(value).toLocaleString(intlLocale(locale));
}

export function formatPercent(value: number, locale: Locale, digits = 1) {
  const formatted = Math.abs(value).toLocaleString(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatted}${locale === "en" ? "%" : " %"}`;
}

export function formatSignedMoney(value: number, locale: Locale) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(Math.round(value)).toLocaleString(intlLocale(locale))} kr`;
}

export function formatMonthYear(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));
}
