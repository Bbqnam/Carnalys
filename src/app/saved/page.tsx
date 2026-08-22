"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSavedListings } from "@/app/actions";
import { CompareTray } from "@/features/search/compare-tray";
import { uiCopy, type Locale } from "@/features/search/copy";
import { ArrowRightIcon } from "@/features/search/icons";
import { useLocaleCookie } from "@/features/search/use-locale-cookie";
import { SiteHeader } from "@/features/search/site-header";
import { useCompare } from "@/features/search/use-compare";
import { useFavorites } from "@/features/search/use-favorites";
import { VehicleCard } from "@/features/search/vehicle-card";
import type { VehicleSearchResult } from "@/features/search/types";

export default function SavedPage() {
  const router = useRouter();
  const { favorites, toggle } = useFavorites();
  const {
    compared,
    toggle: toggleCompare,
    remove: removeCompare,
    clear: clearCompare,
    isFull: compareFull,
  } = useCompare();
  const comparedIds = new Set(compared.map((vehicle) => vehicle.id));
  const [locale, writeLocale] = useLocaleCookie();
  const [listings, setListings] = useState<VehicleSearchResult[] | null>(null);
  const copy = uiCopy[locale];

  useEffect(() => {
    if (favorites.size === 0) return;
    let cancelled = false;
    getSavedListings([...favorites]).then((result) => {
      if (!cancelled) setListings(result);
    });
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  const visibleListings = favorites.size === 0 ? [] : listings;

  function changeLocale(nextLocale: Locale) {
    writeLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  return (
    <div>
      <SiteHeader
        activePage="saved"
        locale={locale}
        onLocaleChange={changeLocale}
        savedCount={favorites.size}
        compareCount={compared.length}
      />

      <div className="mx-auto max-w-[1800px] px-5 py-8 sm:px-8 lg:px-12">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          onClick={() => router.back()}
          type="button"
        >
          <ArrowRightIcon className="size-4 rotate-180" />
          {copy.detail.back}
        </button>

        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-ink">
          {copy.nav.saved}
        </h1>

        {visibleListings === null ? (
          <p className="mt-6 text-sm text-ink-muted">…</p>
        ) : visibleListings.length === 0 ? (
          <p className="mt-6 text-sm text-ink-muted">{copy.results.noResultsBody}</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleListings.map((result) => (
              <VehicleCard
                isFavorite={favorites.has(result.listing.id)}
                isCompared={comparedIds.has(result.listing.id)}
                compareDisabled={compareFull && !comparedIds.has(result.listing.id)}
                key={result.listing.id}
                locale={locale}
                onToggleFavorite={() => toggle(result.listing.id)}
                onToggleCompare={() =>
                  toggleCompare({
                    id: result.listing.id,
                    make: result.vehicle.identity.make,
                    model: result.vehicle.identity.model,
                    variant: result.vehicle.identity.variant,
                    imageUrl: result.listing.images[0]?.url,
                  })
                }
                result={result}
              />
            ))}
          </div>
        )}
      </div>

      <CompareTray
        compared={compared}
        locale={locale}
        onClear={clearCompare}
        onRemove={removeCompare}
      />
    </div>
  );
}
