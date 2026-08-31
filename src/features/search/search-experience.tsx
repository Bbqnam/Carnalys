"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { uiCopy, type Locale } from "./copy";
import { CompareMobileBar, CompareTrayPanel } from "./compare-tray";
import { FilterPanel } from "./filter-panel";
import {
  CloseIcon,
  GridIcon,
  ListIcon,
  SearchEmptyIcon,
  SearchIcon,
  SlidersIcon,
} from "./icons";
import { QuickFilters } from "./quick-filters";
import { SearchHero } from "./search-hero";
import { SingleChoiceDropdown } from "./single-choice-dropdown";
import { SiteHeader } from "./site-header";
import { SynchronizationButton } from "./synchronization-button";
import { defaultSearchFilters, vehicleSearchUrl } from "./search-state";
import { setLocaleCookie } from "./locale";
import { useCompare } from "./use-compare";
import { useCurrentLocation } from "./use-current-location";
import { useFavorites } from "./use-favorites";
import { useViewMode } from "./use-view-mode";
import type {
  AvailableVehicleFilters,
  SearchFilters,
  SearchSort,
  VehiclePageSize,
  VehicleSearchResult,
} from "./types";
import { VehicleCard } from "./vehicle-card";
import { VehicleRow } from "./vehicle-row";

const savedSearchKey = "carnalys:search-state:v1";

/** The saved search is a set of filters and a sort order, never a scroll
 *  position — dropping `page` keeps a returning visitor from landing deep in
 *  pagination (e.g. page 20) on a bare visit to "/". */
function withoutPageParam(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.delete("page");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function saveSearchState(url: string) {
  try {
    window.localStorage.setItem(savedSearchKey, withoutPageParam(url));
  } catch {
    // Search still works when storage is unavailable or disabled.
  }
}

interface SearchExperienceProps {
  activeSynchronization?: {
    mode: string;
    fetchedCount: number;
  };
  initialLocale: Locale;
  listings: readonly VehicleSearchResult[];
  initialFilters: SearchFilters;
  initialSort: SearchSort;
  lastSynchronizedAt?: string;
  availableFilters: AvailableVehicleFilters;
  pagination: {
    page: number;
    pageSize: VehiclePageSize;
    totalListings: number;
    totalPages: number;
  };
}

type PaginationItem = number | `ellipsis-${"start" | "end"}`;

function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (currentPage >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  }

  const visiblePages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: PaginationItem[] = [];

  visiblePages.forEach((page, index) => {
    const previous = visiblePages[index - 1];
    if (previous && page - previous > 1) {
      items.push(index === 1 ? "ellipsis-start" : "ellipsis-end");
    }
    items.push(page);
  });

  return items;
}

function formatSynchronizedAt(value: string, locale: Locale) {
  const formatLocale = locale === "en" ? "en-SE" : "sv-SE";
  const parts = new Intl.DateTimeFormat(formatLocale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Stockholm",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("day")} ${part("month")} ${part("hour")}:${part("minute")}`;
}

export function SearchExperience({
  activeSynchronization,
  availableFilters,
  initialLocale,
  initialFilters,
  initialSort,
  listings,
  lastSynchronizedAt,
  pagination,
}: SearchExperienceProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [sort, setSort] = useState<SearchSort>(initialSort);
  const incomingSearchState = vehicleSearchUrl({
    filters: initialFilters,
    sort: initialSort,
    page: 1,
    pageSize: pagination.pageSize,
  });
  const [renderedSearchState, setRenderedSearchState] = useState(incomingSearchState);
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const {
    compared,
    toggle: toggleCompare,
    remove: removeCompare,
    clear: clearCompare,
    isFull: compareFull,
  } = useCompare();
  const comparedIds = new Set(compared.map((vehicle) => vehicle.id));
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, changeViewMode] = useViewMode();
  const {
    location: userLocation,
    status: locationStatus,
    requestCurrentLocation,
  } = useCurrentLocation();
  const [isUpdating, startTransition] = useTransition();
  const closeFiltersRef = useRef<HTMLButtonElement>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = uiCopy[locale];
  const formatLocale = locale === "en" ? "en-SE" : "sv-SE";
  const showHero = pagination.page <= 1;
  // A neutral fallback analysis means this server payload was produced before
  // the background analysis row existed. It is different from a deliberately
  // unrated Deal Score, whose current methodology version is still present.
  const hasPendingAnalyses = listings.some(
    (result) => result.analysis.methodologyVersion === "stored-neutral-1.0",
  );

  if (renderedSearchState !== incomingSearchState) {
    setRenderedSearchState(incomingSearchState);
    setFilters(initialFilters);
    setSort(initialSort);
  }

  const results = useMemo(() => {
    if (sort === "deal_score") {
      // Unrated (null) sorts last, mirroring the server's `nulls: "last"`.
      return listings.toSorted(
        (left, right) =>
          (right.analysis.dealScore.value ?? -1) -
          (left.analysis.dealScore.value ?? -1),
      );
    }
    if (sort === "buy_confidence") {
      return listings.toSorted(
        (left, right) =>
          right.analysis.buyConfidenceScore.value -
          left.analysis.buyConfidenceScore.value,
      );
    }
    return listings;
  }, [listings, sort]);

  const activeFilterCount =
    filters.brands.length +
    filters.models.length +
    filters.sources.length +
    [
      filters.minPrice,
      filters.maxPrice,
      filters.minYear,
      filters.maxYear,
      filters.fuelType,
      filters.transmission,
      filters.minMileageMil,
      filters.maxMileageMil,
      filters.bodyStyle,
      filters.postedWithin,
    ].filter((value) => value !== "" && value !== null).length;
  const firstListingNumber =
    pagination.totalListings === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const lastListingNumber = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalListings,
  );
  const pages = useMemo(
    () => paginationItems(pagination.page, pagination.totalPages),
    [pagination.page, pagination.totalPages],
  );

  const activeFilters = useMemo(() => {
    const labels: {
      id: string;
      key: keyof SearchFilters;
      label: string;
      value?: string | number;
    }[] = [];

    if (filters.minPrice !== null) {
      labels.push({
        id: "minPrice",
        key: "minPrice",
        label: `${copy.filterLabels.from} ${filters.minPrice.toLocaleString(formatLocale)} SEK`,
      });
    }
    if (filters.maxPrice !== null) {
      labels.push({
        id: "maxPrice",
        key: "maxPrice",
        label: `${copy.filterLabels.max} ${filters.maxPrice.toLocaleString(formatLocale)} SEK`,
      });
    }
    filters.brands.forEach((brand) =>
      labels.push({ id: `brand-${brand}`, key: "brands", label: brand, value: brand }),
    );
    filters.models.forEach((model) =>
      labels.push({ id: `model-${model}`, key: "models", label: model, value: model }),
    );
    filters.sources.forEach((source) =>
      labels.push({
        id: `source-${source}`,
        key: "sources",
        label: source === "blocket_unofficial" ? "Blocket" : source === "wayke" ? "Wayke" : source,
        value: source,
      }),
    );
    if (filters.fuelType) {
      labels.push({
        id: "fuelType",
        key: "fuelType",
        label: copy.filters.fuels[filters.fuelType],
      });
    }
    if (filters.transmission && filters.transmission !== "other") {
      labels.push({
        id: "transmission",
        key: "transmission",
        label: copy.filters.transmissions[filters.transmission],
      });
    }
    if (filters.minYear !== null) {
      labels.push({
        id: "minYear",
        key: "minYear",
        label: `${copy.filterLabels.from} ${filters.minYear}`,
      });
    }
    if (filters.maxYear !== null) {
      labels.push({
        id: "maxYear",
        key: "maxYear",
        label:
          filters.maxYear === 1990
            ? locale === "en"
              ? "1990 or older"
              : "1990 eller äldre"
            : `${copy.filterLabels.max} ${filters.maxYear}`,
      });
    }
    if (filters.minMileageMil) {
      labels.push({
        id: "minMileageMil",
        key: "minMileageMil",
        label:
          `${copy.filterLabels.from} ${filters.minMileageMil.toLocaleString(formatLocale)} mil`,
      });
    }
    if (filters.maxMileageMil) {
      labels.push({
        id: "maxMileageMil",
        key: "maxMileageMil",
        label:
          `${copy.filterLabels.max} ${filters.maxMileageMil.toLocaleString(formatLocale)} mil`,
      });
    }
    if (filters.bodyStyle) {
      labels.push({
        id: "bodyStyle",
        key: "bodyStyle",
        label: copy.filters.bodies[filters.bodyStyle],
      });
    }
    if (filters.sellerType) {
      labels.push({
        id: "sellerType",
        key: "sellerType",
        label: copy.filters.sellerTypes[filters.sellerType],
      });
    }
    if (filters.postedWithin) {
      labels.push({
        id: "postedWithin",
        key: "postedWithin",
        label: copy.results.postedOptions[filters.postedWithin],
      });
    }

    return labels;
  }, [copy, filters, formatLocale, locale]);

  useEffect(
    () => () => {
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!hasPendingAnalyses) return;

    // The catalogue can stay mounted in the browser while a synchronization
    // finishes and writes its analyses. Refresh the server payload briefly so
    // cards pick up those stored scores without requiring a hard reload or a
    // visit to the detail page. Stop after two minutes to avoid polling forever
    // if analysis is unavailable; genuinely unrated cars never enter this path.
    let refreshCount = 0;
    const refreshPendingAnalyses = () => {
      if (document.visibilityState !== "visible" || refreshCount >= 8) return;
      refreshCount += 1;
      router.refresh();
    };

    refreshPendingAnalyses();
    const interval = window.setInterval(refreshPendingAnalyses, 15_000);
    return () => window.clearInterval(interval);
  }, [hasPendingAnalyses, router]);

  useEffect(() => {
    const currentUrl = `${window.location.pathname}${window.location.search}#cars`;

    if (window.location.search) {
      saveSearchState(currentUrl);
      return;
    }

    try {
      const savedUrl = window.localStorage.getItem(savedSearchKey);
      // Sanitize on read: drop `page` (a returning visitor shouldn't land deep
      // in pagination) and the `#cars` hash — a fresh visit restores the
      // filters but stays at the top of the page rather than jumping straight
      // to the results grid.
      const restoreUrl = savedUrl
        ? withoutPageParam(savedUrl).replace(/#.*$/, "")
        : null;
      if (restoreUrl && restoreUrl !== "/") {
        router.replace(restoreUrl, { scroll: false });
      }
    } catch {
      // Keep the server-provided defaults if storage cannot be read.
    }
  }, [router]);

  useEffect(() => {
    if (!showFilters) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // iOS Safari ignores `overflow: hidden` on <body> for touch scrolling, so a
    // drag that starts inside the drawer gets stolen by the page behind it —
    // which reads as "scrolling doesn't work in the filters". Pin the body in
    // place instead, remembering the scroll position to restore on close.
    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    closeFiltersRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowFilters(false);
      if (event.key !== "Tab") return;

      const dialog = document.getElementById("filters-drawer");
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [showFilters]);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setLocaleCookie(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  function navigateToSearch(
    nextFilters: SearchFilters,
    nextSort: SearchSort,
    delay = 0,
  ) {
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    const nextUrl = vehicleSearchUrl({
      filters: nextFilters,
      sort: nextSort,
      page: 1,
      pageSize: pagination.pageSize,
    });
    saveSearchState(nextUrl);
    navigationTimerRef.current = setTimeout(() => {
      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });
    }, delay);
  }

  function changeFilters(nextFilters: SearchFilters, delay = 180) {
    setFilters(nextFilters);
    navigateToSearch(nextFilters, sort, delay);
  }

  function changeSort(nextSort: SearchSort) {
    setSort(nextSort);
    navigateToSearch(filters, nextSort);
  }

  function resetFilters() {
    changeFilters({ ...defaultSearchFilters, query: filters.query }, 0);
  }

  function removeFilter(key: keyof SearchFilters, value?: string | number) {
    if (key === "brands" && typeof value === "string") {
      changeFilters(
        {
          ...filters,
          brands: filters.brands.filter((brand) => brand !== value),
          models: [],
        },
        0,
      );
      return;
    }
    if (key === "models" && typeof value === "string") {
      changeFilters(
        { ...filters, models: filters.models.filter((model) => model !== value) },
        0,
      );
      return;
    }
    if (key === "sources" && typeof value === "string") {
      changeFilters(
        { ...filters, sources: filters.sources.filter((source) => source !== value) },
        0,
      );
      return;
    }
    changeFilters({ ...filters, [key]: defaultSearchFilters[key] }, 0);
  }

  function scrollToResults() {
    document.getElementById("cars")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const quickFilters = (
    <QuickFilters filters={filters} locale={locale} onChange={changeFilters} />
  );

  const resultsBlock =
    results.length > 0 ? (
      <>
        {viewMode === "list" ? (
          <div className="flex min-w-0 flex-col gap-3">
            <AnimatePresence initial={false}>
              {results.map((result, index) => (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="min-w-0"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 8 }}
                  key={result.listing.id}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <VehicleRow
                    currentLocation={userLocation}
                    isFavorite={favorites.has(result.listing.id)}
                    isCompared={comparedIds.has(result.listing.id)}
                    compareDisabled={compareFull && !comparedIds.has(result.listing.id)}
                    locale={locale}
                    onToggleFavorite={() => toggleFavorite(result.listing.id)}
                    onToggleCompare={() =>
                      toggleCompare({
                        id: result.listing.id,
                        make: result.vehicle.identity.make,
                        model: result.vehicle.identity.model,
                        variant: result.vehicle.identity.variant,
                        imageUrl: result.listing.images[0]?.url,
                      })
                    }
                    priority={index < 3}
                    result={result}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* Column count follows the space rather than a breakpoint ladder:
             `auto-fill` with a floor keeps every card inside one sane band at
             every width, with or without the compare tray beside it. The
             `max(20rem, (100% - 4 gaps)/5)` term caps the row at five cards so
             the cards keep real breathing room on wide screens instead of
             shrinking to fit six or seven across. */
          <div className="grid min-w-0 gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,max(20rem,calc((100%_-_5rem)/5))),1fr))]">
            <AnimatePresence initial={false}>
              {results.map((result, index) => (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="min-w-0"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 8 }}
                  key={result.listing.id}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <VehicleCard
                    currentLocation={userLocation}
                    isFavorite={favorites.has(result.listing.id)}
                    isCompared={comparedIds.has(result.listing.id)}
                    compareDisabled={compareFull && !comparedIds.has(result.listing.id)}
                    locale={locale}
                    onToggleFavorite={() => toggleFavorite(result.listing.id)}
                    onToggleCompare={() =>
                      toggleCompare({
                        id: result.listing.id,
                        make: result.vehicle.identity.make,
                        model: result.vehicle.identity.model,
                        variant: result.vehicle.identity.variant,
                        imageUrl: result.listing.images[0]?.url,
                      })
                    }
                    priority={index < 2}
                    result={result}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {pagination.totalPages > 1 ? (
          <nav
            aria-label={copy.results.paginationLabel}
            className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-[0_8px_30px_rgba(26,35,29,0.04)] sm:p-4"
          >
            <div className="flex w-full min-w-0 items-center justify-between gap-1.5">
              {pagination.page > 1 ? (
                <Link
                  aria-label={copy.results.previousPage}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted active:scale-[0.98] sm:flex-none"
                  href={vehicleSearchUrl({
                    filters,
                    sort,
                    page: pagination.page - 1,
                    pageSize: pagination.pageSize,
                  })}
                  prefetch={false}
                >
                  <span className="sm:hidden">‹</span>
                  <span className="hidden sm:inline">{copy.results.previousPage}</span>
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex h-10 flex-1 cursor-not-allowed items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold text-ink-subtle sm:flex-none"
                >
                  <span className="sm:hidden">‹</span>
                  <span className="hidden sm:inline">{copy.results.previousPage}</span>
                </span>
              )}

              <div className="flex min-w-0 items-center gap-1" aria-label={copy.results.pageNumbers}>
                {pages.map((item) =>
                  typeof item === "number" ? (
                    item === pagination.page ? (
                      <span
                        aria-current="page"
                        className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-sm font-bold text-surface shadow-sm"
                        key={item}
                      >
                        {item}
                      </span>
                    ) : (
                      <Link
                        aria-label={copy.results.goToPage(item)}
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-ink-muted transition hover:bg-surface-muted hover:text-ink active:scale-[0.96]"
                        href={vehicleSearchUrl({
                          filters,
                          sort,
                          page: item,
                          pageSize: pagination.pageSize,
                        })}
                        key={item}
                        prefetch={false}
                      >
                        {item}
                      </Link>
                    )
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid size-6 shrink-0 place-items-center text-sm text-ink-subtle sm:size-8"
                      key={item}
                    >
                      …
                    </span>
                  ),
                )}
              </div>

              {pagination.page < pagination.totalPages ? (
                <Link
                  aria-label={copy.results.nextPage}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-ink px-3 text-sm font-semibold text-surface shadow-sm transition hover:opacity-90 hover:shadow-md active:scale-[0.98] sm:flex-none"
                  href={vehicleSearchUrl({
                    filters,
                    sort,
                    page: pagination.page + 1,
                    pageSize: pagination.pageSize,
                  })}
                  prefetch={false}
                >
                  <span className="sm:hidden">›</span>
                  <span className="hidden sm:inline">{copy.results.nextPage}</span>
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex h-10 flex-1 cursor-not-allowed items-center justify-center rounded-xl bg-surface-muted px-3 text-sm font-semibold text-ink-subtle sm:flex-none"
                >
                  <span className="sm:hidden">›</span>
                  <span className="hidden sm:inline">{copy.results.nextPage}</span>
                </span>
              )}
            </div>
          </nav>
        ) : null}
      </>
    ) : (
      <div className="grid min-h-96 place-items-center rounded-[1.6rem] border border-dashed border-border bg-surface p-8 text-center shadow-[0_12px_40px_rgba(26,35,29,0.035)]">
        <div className="max-w-sm">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-muted text-ink-muted">
            <SearchEmptyIcon className="size-6" />
          </span>
          <h3 className="mt-5 text-xl font-semibold text-ink">
            {copy.results.noResultsTitle}
          </h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {copy.results.noResultsBody}
          </p>
          <button
            className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90"
            onClick={() => changeFilters(defaultSearchFilters, 0)}
            type="button"
          >
            {copy.results.clearFilters}
          </button>
        </div>
      </div>
    );

  return (
    <main>
      <SiteHeader
        activePage="cars"
        locale={locale}
        locationStatus={locationStatus}
        onLocaleChange={changeLocale}
        onRequestLocation={requestCurrentLocation}
        savedCount={favorites.size}
        compareCount={compared.length}
      />

      {showHero ? (
        <SearchHero
          locale={locale}
          onQueryChange={(query) => changeFilters({ ...filters, query }, 300)}
          onSearch={scrollToResults}
          query={filters.query}
          totalListings={pagination.totalListings}
        >
          {quickFilters}
        </SearchHero>
      ) : (
        <div className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-5 py-3 sm:px-8 lg:px-12">
            <form
              className="flex h-11 max-w-xl items-center gap-2.5 rounded-full border border-border bg-surface-subtle px-4 transition focus-within:border-accent/50"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                scrollToResults();
              }}
            >
              <SearchIcon className="size-4 shrink-0 text-ink-subtle" />
              <span className="sr-only">{copy.results.searchAria}</span>
              <input
                autoComplete="off"
                className="w-full bg-transparent text-sm font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle"
                onChange={(event) => changeFilters({ ...filters, query: event.target.value }, 300)}
                placeholder={copy.hero.searchPlaceholder}
                type="search"
                value={filters.query}
              />
            </form>
            {quickFilters}
          </div>
        </div>
      )}

      <section
        aria-busy={isUpdating}
        className="scroll-mt-3 bg-background px-5 py-9 sm:px-8 sm:py-11 lg:px-12 lg:py-12"
        id="cars"
      >
        <div className="mx-auto max-w-[1800px]">
          <div className="mb-4 flex flex-col gap-4 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {/* The results page had no h1 at all — its outline began at h2, so a
                  screen reader navigating by heading landed mid-page with no
                  statement of what the page is. It stays visually hidden; the
                  search field above it is the visible statement of purpose. */}
              <h1 className="sr-only">{copy.results.title}</h1>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p aria-live="polite" className="text-sm font-medium text-ink-muted">
                  {copy.results.rangeCount(
                    firstListingNumber,
                    lastListingNumber,
                    pagination.totalListings,
                  )}
                </p>
                {lastSynchronizedAt ? (
                  <p className="text-xs text-ink-subtle">
                    {copy.results.synchronized} {formatSynchronizedAt(lastSynchronizedAt, locale)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <button
                aria-controls="filters-drawer"
                aria-expanded={showFilters}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-sm transition hover:border-border-strong hover:shadow-md active:scale-[0.98]"
                onClick={() => setShowFilters(true)}
                type="button"
              >
                <SlidersIcon className="size-4" />
                {copy.results.filterButton}
                {activeFilterCount > 0 ? (
                  <span className="grid size-5 place-items-center rounded-full bg-accent-strong text-[10px] text-surface">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <SynchronizationButton
                activeSynchronization={activeSynchronization}
                locale={locale}
              />
              <SingleChoiceDropdown
                ariaLabel={copy.results.sortAria}
                className="min-w-0 flex-1 sm:flex-none"
                inlineLabel={copy.results.sortLabel}
                onChange={changeSort}
                options={(Object.keys(copy.results.sorts) as SearchSort[]).map((sortValue) => ({
                  value: sortValue,
                  label: copy.results.sorts[sortValue],
                }))}
                value={sort}
              />
              <div
                aria-label={copy.results.viewToggleLabel}
                className="flex h-11 shrink-0 items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-sm"
                role="group"
              >
                {([
                  ["grid", GridIcon, copy.results.viewGrid],
                  ["list", ListIcon, copy.results.viewList],
                ] as const).map(([mode, Icon, label]) => (
                  <button
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    className={`grid size-9 place-items-center rounded-lg transition ${
                      viewMode === mode
                        ? "bg-ink text-surface"
                        : "text-ink-subtle hover:text-ink"
                    }`}
                    key={mode}
                    onClick={() => changeViewMode(mode)}
                    type="button"
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeFilters.length > 0 ? (
            <div
              className="scrollbar-none mb-5 flex min-h-9 items-center gap-2 overflow-x-auto overflow-y-hidden"
              aria-label={copy.results.activeFilters}
            >
              {activeFilters.map((filter) => (
                <button
                  aria-label={copy.results.removeFilter(filter.label)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong transition hover:border-accent/50 hover:bg-surface hover:text-ink"
                  key={filter.id}
                  onClick={() => removeFilter(filter.key, filter.value)}
                  type="button"
                >
                  {filter.label}
                  <CloseIcon className="size-3" />
                </button>
              ))}
              <button
                className="shrink-0 rounded-full px-2.5 text-xs font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                onClick={resetFilters}
                type="button"
              >
                {copy.filters.resetAll}
              </button>
            </div>
          ) : null}

          {compared.length > 0 ? (
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_260px] xl:gap-8">
              <div className="min-w-0">{resultsBlock}</div>
              <aside className="hidden min-w-0 self-stretch lg:block">
                <div className="sticky top-4">
                  <CompareTrayPanel
                    compared={compared}
                    locale={locale}
                    onClear={clearCompare}
                    onRemove={removeCompare}
                  />
                </div>
              </aside>
            </div>
          ) : (
            <div className="min-w-0">{resultsBlock}</div>
          )}
        </div>
      </section>

      <footer className="border-t border-border bg-background px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-2 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Carnalys. {copy.footer.tagline}</p>
          <p>{copy.footer.disclaimer}</p>
        </div>
      </footer>

      <AnimatePresence>
        {showFilters ? (
          <motion.div
            animate={{ opacity: 1 }}
            aria-labelledby="filters-drawer-title"
            aria-modal="true"
            className="fixed inset-0 z-50"
            exit={{ opacity: 0 }}
            id="filters-drawer"
            initial={{ opacity: 0 }}
            role="dialog"
          >
            <button
              aria-label={copy.results.closeFilters}
              className="absolute inset-0 bg-[#101712]/55"
              onClick={() => setShowFilters(false)}
              tabIndex={-1}
              type="button"
            />
            {/* The animated element carries a transform; iOS momentum scrolling
                on a transformed overflow container is unreliable, so the panel
                only slides — a plain inner <div> does the scrolling, with the
                header and footer pinned outside it. */}
            <motion.div
              animate={{ x: 0 }}
              className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[26rem] flex-col bg-background shadow-2xl"
              exit={{ x: "100%" }}
              initial={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between px-5 pb-3 pt-4">
                <h2
                  className="text-lg font-semibold tracking-[-0.025em] text-ink"
                  id="filters-drawer-title"
                >
                  {copy.results.mobileTitle}
                </h2>
                <button
                  aria-label={copy.results.closeFilters}
                  className="grid size-11 place-items-center rounded-full border border-border bg-surface text-ink shadow-sm transition hover:border-border-strong"
                  onClick={() => setShowFilters(false)}
                  ref={closeFiltersRef}
                  type="button"
                >
                  <CloseIcon className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 [-webkit-overflow-scrolling:touch]">
                <FilterPanel
                  brands={availableFilters.brands}
                  filters={filters}
                  locale={locale}
                  models={availableFilters.models}
                  onChange={changeFilters}
                  onReset={resetFilters}
                  resultCount={pagination.totalListings}
                  years={availableFilters.years}
                />
              </div>
              <div className="border-t border-border px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
                <button
                  className="h-13 w-full rounded-full bg-ink text-sm font-semibold text-surface shadow-[0_10px_30px_rgba(0,0,0,0.24)] transition hover:opacity-90 active:scale-[0.99]"
                  onClick={() => setShowFilters(false)}
                  type="button"
                >
                  {copy.hero.showCars(pagination.totalListings)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CompareMobileBar
        compared={compared}
        locale={locale}
        onClear={clearCompare}
        onRemove={removeCompare}
      />
    </main>
  );
}
