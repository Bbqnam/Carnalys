"use client";

import { useSyncExternalStore } from "react";
import {
  AutomaticTransmissionIcon,
  CalendarFilterIcon,
  DieselFuelIcon,
  ElectricFuelIcon,
  OdometerIcon,
  PetrolFuelIcon,
  PlugInFuelIcon,
  StorefrontIcon,
  TagIcon,
} from "./icons";
import { uiCopy, type Locale } from "./copy";
import type { SearchFilters } from "./types";

/** One-tap presets that write straight into the existing filter state, so they
 *  stay in sync with the filter panel and the active-filter chips. Every
 *  preset here is an explicit filter — no sort shortcuts. */
const lowMileageCeilingMil = 4_000;

interface QuickFiltersProps {
  locale: Locale;
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

interface Preset {
  id: string;
  label: string;
  Icon: typeof TagIcon;
  active: boolean;
  toggle: () => void;
}

function shuffle<T>(items: readonly T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}

/**
 * The row shows a random 3–4 of the pool below, chosen once per page load and
 * held in a module store read through useSyncExternalStore — the same
 * hydration-safe shape as useFavorites/useTheme. SSR and the first client
 * commit both render the same fixed three; the client then re-renders once
 * with the random pick. A reload reshuffles; ordinary re-renders don't.
 */
const poolIds = [
  "max-price-100",
  "max-price-200",
  "low-mileage",
  "automatic",
  "electric",
  "petrol",
  "diesel",
  "plugin",
  "dealer",
  "recent",
];
const serverPick = poolIds.slice(0, 3);
let clientPick: string[] | null = null;

function subscribePick() {
  return () => {};
}

function getPick() {
  if (!clientPick) {
    const count = Math.random() < 0.5 ? 3 : 4;
    clientPick = shuffle(poolIds).slice(0, count);
  }
  return clientPick;
}

function getServerPick() {
  return serverPick;
}

export function QuickFilters({ locale, filters, onChange }: QuickFiltersProps) {
  const copy = uiCopy[locale].results.quickFilters;
  const fuels = uiCopy[locale].filters.fuels;
  const sellerTypes = uiCopy[locale].filters.sellerTypes;
  const postedOptions = uiCopy[locale].results.postedOptions;

  const priceToggle = (ceiling: number) => () =>
    onChange({
      ...filters,
      maxPrice: filters.maxPrice === ceiling ? null : ceiling,
    });
  const fuelToggle = (fuel: SearchFilters["fuelType"]) => () =>
    onChange({ ...filters, fuelType: filters.fuelType === fuel ? "" : fuel });

  const byId: Record<string, Preset> = {
    "max-price-100": {
      id: "max-price-100",
      label: copy.maxPrice,
      Icon: TagIcon,
      active: filters.maxPrice === 100_000,
      toggle: priceToggle(100_000),
    },
    "max-price-200": {
      id: "max-price-200",
      label: copy.maxPrice200,
      Icon: TagIcon,
      active: filters.maxPrice === 200_000,
      toggle: priceToggle(200_000),
    },
    "low-mileage": {
      id: "low-mileage",
      label: copy.lowMileage,
      Icon: OdometerIcon,
      active: filters.maxMileageMil === lowMileageCeilingMil,
      toggle: () =>
        onChange({
          ...filters,
          maxMileageMil:
            filters.maxMileageMil === lowMileageCeilingMil ? null : lowMileageCeilingMil,
        }),
    },
    automatic: {
      id: "automatic",
      label: copy.automatic,
      Icon: AutomaticTransmissionIcon,
      active: filters.transmission === "automatic",
      toggle: () =>
        onChange({
          ...filters,
          transmission: filters.transmission === "automatic" ? "" : "automatic",
        }),
    },
    electric: {
      id: "electric",
      label: fuels.electric,
      Icon: ElectricFuelIcon,
      active: filters.fuelType === "electric",
      toggle: fuelToggle("electric"),
    },
    petrol: {
      id: "petrol",
      label: fuels.petrol,
      Icon: PetrolFuelIcon,
      active: filters.fuelType === "petrol",
      toggle: fuelToggle("petrol"),
    },
    diesel: {
      id: "diesel",
      label: fuels.diesel,
      Icon: DieselFuelIcon,
      active: filters.fuelType === "diesel",
      toggle: fuelToggle("diesel"),
    },
    plugin: {
      id: "plugin",
      label: fuels.plug_in_hybrid,
      Icon: PlugInFuelIcon,
      active: filters.fuelType === "plug_in_hybrid",
      toggle: fuelToggle("plug_in_hybrid"),
    },
    dealer: {
      id: "dealer",
      label: sellerTypes.dealer,
      Icon: StorefrontIcon,
      active: filters.sellerType === "dealer",
      toggle: () =>
        onChange({
          ...filters,
          sellerType: filters.sellerType === "dealer" ? "" : "dealer",
        }),
    },
    recent: {
      id: "recent",
      label: postedOptions.week,
      Icon: CalendarFilterIcon,
      active: filters.postedWithin === "week",
      toggle: () =>
        onChange({
          ...filters,
          postedWithin: filters.postedWithin === "week" ? "" : "week",
        }),
    },
  };

  const pick = useSyncExternalStore(subscribePick, getPick, getServerPick);
  const presets = pick.map((id) => byId[id]).filter(Boolean);

  return (
    <div aria-label={copy.label} className="flex flex-wrap items-center gap-2">
      {presets.map(({ id, label, Icon, active, toggle }) => (
        <button
          aria-pressed={active}
          className={`flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
            active
              ? "border-accent/50 bg-accent-soft text-accent-strong"
              : "border-border bg-surface text-ink hover:border-border-strong"
          }`}
          key={id}
          onClick={toggle}
          type="button"
        >
          <Icon className={`size-4 shrink-0 ${active ? "" : "text-ink-subtle"}`} />
          {label}
        </button>
      ))}
    </div>
  );
}
