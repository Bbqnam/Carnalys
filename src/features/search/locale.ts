import type { Locale } from "./copy";

export const localeCookieName = "carnalys-locale";
export const defaultLocale: Locale = "en";

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "sv";
}

/** Client-side only: persists the user's language choice across navigations. */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** Client-side only: reads the persisted language choice, if any. */
export function readLocaleCookie(): Locale | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${localeCookieName}=([^;]+)`),
  );
  const value = match?.[1];
  return isLocale(value) ? value : undefined;
}
