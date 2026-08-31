"use client";

import { useSyncExternalStore } from "react";
import { readStoredTheme, setStoredTheme, type Theme } from "./theme";

const themeListeners = new Set<() => void>();

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function getThemeSnapshot(): Theme {
  return readStoredTheme() ?? "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

/** Client-side only. Renders "light" on both server and first client paint
    to avoid a hydration mismatch (the inline blocking script in <head>
    already applied the real theme visually before this hydrates), then
    corrects on the next render — same pattern as useLocaleCookie. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function writeTheme(nextTheme: Theme) {
    setStoredTheme(nextTheme);
    themeListeners.forEach((listener) => listener());
  }

  return [theme, writeTheme];
}
