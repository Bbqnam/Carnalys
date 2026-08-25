"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { uiCopy, type Locale } from "./copy";
import { CompareMobileBar, CompareTrayPanel } from "./compare-tray";
import { FilterPanel } from "./filter-panel";
import { CloseIcon, SearchEmptyIcon, SlidersIcon } from "./icons";
import { SearchHero } from "./search-hero";
import { SingleChoiceDropdown } from "./single-choice-dropdown";
import { SynchronizationButton } from "./synchronization-button";
import { defaultSearchFilters, vehicleSearchUrl } from "./search-state";
import { setLocaleCookie } from "./locale";
import { useCompare } from "./use-compare";
import { useCurrentLocation } from "./use-current-location";
import { useFavorites } from "./use-favorites";
import type {
  AvailableVehicleFilters,
  SearchFilters,
  SearchSort,
  VehiclePageSize,
  VehicleSearchResult,
} from "./types";
import { VehicleCard } from "./vehicle-card";

const savedSearchKey = "carnalys:search-state:v1";

function saveSearchState(url: string) {
  try {
    window.localStorage.setItem(savedSearchKey, url);
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

  if (renderedSearchState !== incomingSearchState) {
    setRenderedSearchState(incomingSearchState);
    setFilters(initialFilters);
    setSort(initialSort);
  }

  const results = useMemo(() => {
    if (sort === "deal_score") {
      return listings.toSorted(
        (left, right) => right.analysis.dealScore.value - left.analysis.dealScore.value,
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
    const intervalMinutes = 5;
    const interval = setInterval(
      () => router.refresh(),
      intervalMinutes * 60 * 1_000,
    );
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    const currentUrl = `${window.location.pathname}${window.location.search}#cars`;

    if (window.location.search) {
      saveSearchState(currentUrl);
      return;
    }

    try {
      const savedUrl = window.localStorage.getItem(savedSearchKey);
      if (savedUrl && savedUrl !== "/#cars") {
        router.replace(savedUrl, { scroll: false });
      }
    } catch {
      // Keep the server-provided defaults if storage cannot be read.
    }
  }, [router]);

  useEffect(() => {
    if (!showFilters) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeFiltersRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowFilters(false);
      if (event.key !== "Tab") return;

      const dialog = document.getElementById("mobile-filters");
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
      document.body.style.overflow = previousOverflow;
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
    changeFilters({ ...filters, [key]: defaultSearchFilters[key] }, 0);
  }

  function scrollToResults() {
    document.getElementById("cars")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main>
      <SearchHero
        locale={locale}
        locationStatus={locationStatus}
        onLocaleChange={changeLocale}
        onQueryChange={(query) => changeFilters({ ...filters, query }, 300)}
        onRequestLocation={requestCurrentLocation}
        onSearch={scrollToResults}
        query={filters.query}
        savedCount={favorites.size}
        compareCount={compared.length}
        totalListings={pagination.totalListings}
      />

      <section
        aria-busy={isUpdating}
        className="scroll-mt-3 bg-background px-5 py-9 sm:px-8 sm:py-11 lg:px-12 lg:py-12"
        id="cars"
      >
        <div className="mx-auto max-w-[1800px]">
          <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
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
              <SynchronizationButton
                activeSynchronization={activeSynchronization}
                locale={locale}
              />
              <button
                aria-controls="mobile-filters"
                aria-expanded={showFilters}
                className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-sm transition hover:border-border-strong hover:shadow-md active:scale-[0.98] md:hidden"
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
              <SingleChoiceDropdown
                ariaLabel={copy.results.postedAria}
                inlineLabel={copy.results.postedLabel}
                onChange={(value) => changeFilters({ ...filters, postedWithin: value })}
                options={(
                  Object.keys(copy.results.postedOptions) as SearchFilters["postedWithin"][]
                ).map((value) => ({ value, label: copy.results.postedOptions[value] }))}
                value={filters.postedWithin}
              />
              <SingleChoiceDropdown
                ariaLabel={copy.results.sortAria}
                inlineLabel={copy.results.sortLabel}
                onChange={changeSort}
                options={(Object.keys(copy.results.sorts) as SearchSort[]).map((sortValue) => ({
                  value: sortValue,
                  label: copy.results.sorts[sortValue],
                }))}
                value={sort}
              />
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

          <div
            className={
              compared.length > 0
                ? "grid min-w-0 items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)_250px] xl:grid-cols-[280px_minmax(0,1fr)_260px] xl:gap-8"
                : "grid min-w-0 items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8"
            }
          >
            <aside className="hidden min-w-0 self-stretch md:block">
              {/* Deliberately not `overscroll-contain`. The panel is a sticky
                  column beside the results, not a modal: containing the scroll
                  chain meant a wheel gesture anywhere over the filters stopped
                  dead — including when the panel fits its column and has
                  nothing of its own to scroll — so the page appeared frozen
                  under the cursor. Chaining lets the panel scroll its own
                  overflow first and hand the rest to the page. */}
              <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-[0_8px_30px_rgba(26,35,29,0.04)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            </aside>

            <div className="min-w-0">
              {results.length > 0 ? (
                <>
                  {/* Column count follows the space rather than a breakpoint
                      ladder. The ladder gave one card per row everywhere below
                      1280px — a single 825px-wide card at 1200 — and then
                      halved the card from 515px to 273px across the 96px
                      between 1440 and 1536, because there was no three-column
                      step. `auto-fill` with a floor keeps every card inside one
                      sane band at every width, and needs no separate rule for
                      the narrower grid that the compare tray leaves behind. */}
                  <div
                    className="grid min-w-0 gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(19rem,100%),1fr))]"
                  >
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
              )}
            </div>

            {compared.length > 0 ? (
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
            ) : null}
          </div>
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
            aria-labelledby="mobile-filters-title"
            aria-modal="true"
            className="fixed inset-0 z-50 md:hidden"
            exit={{ opacity: 0 }}
            id="mobile-filters"
            initial={{ opacity: 0 }}
            role="dialog"
          >
            <button
              aria-label={copy.results.closeFilters}
              className="absolute inset-0 bg-[#101712]/45 backdrop-blur-sm"
              onClick={() => setShowFilters(false)}
              tabIndex={-1}
              type="button"
            />
            <motion.div
              animate={{ y: 0 }}
              className="absolute inset-x-0 bottom-0 z-10 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-x-6 sm:bottom-6 sm:rounded-[1.75rem] lg:inset-x-auto lg:right-6 lg:w-[400px] lg:max-h-[calc(100dvh-3rem)]"
              exit={{ y: "100%" }}
              initial={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
              <div className="mb-5 flex items-center justify-between">
                <h2
                  className="text-lg font-semibold tracking-[-0.025em] text-ink"
                  id="mobile-filters-title"
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
              <button
                className="sticky bottom-0 mt-7 h-13 w-full rounded-full bg-ink text-sm font-semibold text-surface shadow-[0_10px_30px_rgba(0,0,0,0.24)] transition hover:opacity-90 active:scale-[0.99]"
                onClick={() => setShowFilters(false)}
                type="button"
              >
                {copy.hero.showCars(pagination.totalListings)}
              </button>
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
