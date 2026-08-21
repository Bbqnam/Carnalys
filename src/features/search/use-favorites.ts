"use client";

import { useCallback, useSyncExternalStore } from "react";

const storageKey = "carnalysis:favorites:v1";
const listeners = new Set<() => void>();

function readStoredFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

let cachedSnapshot = readStoredFavorites();

function writeStoredFavorites(favorites: Set<string>) {
  cachedSnapshot = favorites;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...favorites]));
  } catch {
    // localStorage unavailable (private browsing, quota); favorites won't persist.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return cachedSnapshot;
}

const emptySnapshot: Set<string> = new Set();

function getServerSnapshot(): Set<string> {
  return emptySnapshot;
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((listingId: string) => {
    const next = new Set(cachedSnapshot);
    if (next.has(listingId)) next.delete(listingId);
    else next.add(listingId);
    writeStoredFavorites(next);
  }, []);

  return { favorites, toggle };
}
