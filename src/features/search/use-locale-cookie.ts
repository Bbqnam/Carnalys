"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "./copy";
import { defaultLocale, readLocaleCookie, setLocaleCookie } from "./locale";

const localeListeners = new Set<() => void>();

function subscribeToLocale(listener: () => void) {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

function getLocaleSnapshot(): Locale {
  return readLocaleCookie() ?? defaultLocale;
}

function getServerLocaleSnapshot(): Locale {
  return defaultLocale;
}

/**
 * Client-side only, for pages with no server component to pass an
 * `initialLocale` prop (e.g. /saved, /compare). Renders `defaultLocale` on
 * both server and first client paint to avoid a hydration mismatch, then
 * corrects to the stored cookie value — the same pattern used by
 * useFavorites/useCompare for the same reason.
 */
export function useLocaleCookie(): [Locale, (locale: Locale) => void] {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot,
  );

  function writeLocale(nextLocale: Locale) {
    setLocaleCookie(nextLocale);
    localeListeners.forEach((listener) => listener());
  }

  return [locale, writeLocale];
}
