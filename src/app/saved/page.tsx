"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSavedListings } from "@/app/actions";
import { uiCopy, type Locale } from "@/features/search/copy";
import { ArrowRightIcon } from "@/features/search/icons";
import { defaultLocale, readLocaleCookie, setLocaleCookie } from "@/features/search/locale";
import { SiteHeader } from "@/features/search/site-header";
import { useFavorites } from "@/features/search/use-favorites";
import { VehicleCard } from "@/features/search/vehicle-card";
import type { VehicleSearchResult } from "@/features/search/types";

export default function SavedPage() {
  const router = useRouter();
  const { favorites, toggle } = useFavorites();
  const [locale, setLocale] = useState<Locale>(() => readLocaleCookie() ?? defaultLocale);
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
    setLocale(nextLocale);
    setLocaleCookie(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  return (
    <div>
      <SiteHeader
        activePage="saved"
        locale={locale}
        onLocaleChange={changeLocale}
        savedCount={favorites.size}
      />

      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#526058] hover:text-[#19231d]"
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
                key={result.listing.id}
                locale={locale}
                onToggleFavorite={() => toggle(result.listing.id)}
                result={result}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
