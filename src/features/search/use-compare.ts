"use client";

import { useCallback, useSyncExternalStore } from "react";

export interface ComparedVehicle {
  id: string;
  make: string;
  model: string;
  variant?: string;
  imageUrl?: string;
}

const storageKey = "carnalys:compare:v2";
const maxCompared = 3;
const listeners = new Set<() => void>();

function isComparedVehicle(value: unknown): value is ComparedVehicle {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ComparedVehicle).id === "string" &&
    typeof (value as ComparedVehicle).make === "string" &&
    typeof (value as ComparedVehicle).model === "string"
  );
}

function readStoredCompared(): ComparedVehicle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isComparedVehicle).slice(0, maxCompared) : [];
  } catch {
    return [];
  }
}

let cachedSnapshot = readStoredCompared();

function writeStoredCompared(compared: ComparedVehicle[]) {
  cachedSnapshot = compared;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(compared));
  } catch {
    // localStorage unavailable (private browsing, quota); comparison won't persist.
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

const emptySnapshot: ComparedVehicle[] = [];

function getServerSnapshot(): ComparedVehicle[] {
  return emptySnapshot;
}

export function useCompare() {
  const compared = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isFull = compared.length >= maxCompared;

  const toggle = useCallback((vehicle: ComparedVehicle) => {
    const exists = cachedSnapshot.some((entry) => entry.id === vehicle.id);
    if (exists) {
      writeStoredCompared(cachedSnapshot.filter((entry) => entry.id !== vehicle.id));
      return;
    }
    if (cachedSnapshot.length >= maxCompared) return;
    writeStoredCompared([...cachedSnapshot, vehicle]);
  }, []);

  const remove = useCallback((id: string) => {
    writeStoredCompared(cachedSnapshot.filter((entry) => entry.id !== id));
  }, []);

  const clear = useCallback(() => {
    writeStoredCompared([]);
  }, []);

  return { compared, toggle, remove, clear, isFull, maxCompared };
}
