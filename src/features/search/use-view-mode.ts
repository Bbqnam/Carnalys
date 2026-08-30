"use client";

import { useCallback, useSyncExternalStore } from "react";

const storageKey = "carnalys:view-mode:v1";
const listeners = new Set<() => void>();

export type VehicleViewMode = "grid" | "list";

function readStoredViewMode(): VehicleViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    return window.localStorage.getItem(storageKey) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

let cachedSnapshot: VehicleViewMode = readStoredViewMode();

function writeStoredViewMode(mode: VehicleViewMode) {
  cachedSnapshot = mode;
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // localStorage unavailable (private browsing, quota); the choice still
    // applies for this session, it just won't be remembered.
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

function getServerSnapshot(): VehicleViewMode {
  return "grid";
}

/** Remembers the results layout (grid or list) per viewer. Same
 *  module-store + useSyncExternalStore shape as useFavorites, so it stays
 *  hydration-safe with no first-paint flash handling in the component. */
export function useViewMode(): [VehicleViewMode, (mode: VehicleViewMode) => void] {
  const viewMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setViewMode = useCallback((mode: VehicleViewMode) => writeStoredViewMode(mode), []);
  return [viewMode, setViewMode];
}
