"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { uiCopy, type Locale } from "./copy";
import { FilterPanel } from "./filter-panel";
import { ChevronDownIcon, CloseIcon, SearchEmptyIcon, SlidersIcon } from "./icons";
import { SearchHero } from "./search-hero";
import { defaultSearchFilters, vehicleSearchUrl } from "./search-state";
import type { SearchFilters, SearchSort, VehicleSearchResult } from "./types";
import { VehicleCard } from "./vehicle-card";

interface SearchExperienceProps {
  listings: readonly VehicleSearchResult[];
  initialFilters: SearchFilters;
  initialSort: SearchSort;
  lastSynchronizedAt?: string;
  availableFilters: {
    brands: readonly string[];
    models: readonly string[];
    priceRange: { minimum: number; maximum: number };
  };
  pagination: {
    page: number;
    pageSize: number;
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

export function SearchExperience({
  availableFilters,
  initialFilters,
  initialSort,
  listings,
  lastSynchronizedAt,
  pagination,
}: SearchExperienceProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [sort, setSort] = useState<SearchSort>(initialSort);
  const incomingSearchState = vehicleSearchUrl({
    filters: initialFilters,
    sort: initialSort,
    page: 1,
  });
  const [renderedSearchState, setRenderedSearchState] = useState(incomingSearchState);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
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

  const suggestions = useMemo(
    () =>
      listings.slice(0, 3).map(
        ({ vehicle }) => `${vehicle.identity.make} ${vehicle.identity.model}`,
      ),
    [listings],
  );

  const results = listings;

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => key !== "query" && value !== "" && value !== null,
  ).length;
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
    const labels: { key: keyof SearchFilters; label: string }[] = [];

    if (filters.minPrice !== null) {
      labels.push({
        key: "minPrice",
        label: `${copy.filterLabels.from} ${filters.minPrice.toLocaleString(formatLocale)} SEK`,
      });
    }
    if (filters.maxPrice !== null) {
      labels.push({
        key: "maxPrice",
        label: `${copy.filterLabels.max} ${filters.maxPrice.toLocaleString(formatLocale)} SEK`,
      });
    }
    if (filters.brand) labels.push({ key: "brand", label: filters.brand });
    if (filters.model) labels.push({ key: "model", label: filters.model });
    if (filters.fuelType) {
      labels.push({ key: "fuelType", label: copy.filters.fuels[filters.fuelType] });
    }
    if (filters.transmission && filters.transmission !== "other") {
      labels.push({
        key: "transmission",
        label: copy.filters.transmissions[filters.transmission],
      });
    }
    if (filters.minYear) {
      labels.push({ key: "minYear", label: `${copy.filterLabels.from} ${filters.minYear}` });
    }
    if (filters.maxMileageMil) {
      labels.push({
        key: "maxMileageMil",
        label:
          locale === "en"
            ? `${copy.filterLabels.max} ${(filters.maxMileageMil * 10).toLocaleString(formatLocale)} km`
            : `${copy.filterLabels.max} ${filters.maxMileageMil.toLocaleString(formatLocale)} mil`,
      });
    }
    if (filters.bodyStyle) {
      labels.push({ key: "bodyStyle", label: copy.filters.bodies[filters.bodyStyle] });
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
    if (!showMobileFilters) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeFiltersRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowMobileFilters(false);
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
  }, [showMobileFilters]);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  function navigateToSearch(
    nextFilters: SearchFilters,
    nextSort: SearchSort,
    delay = 0,
  ) {
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    navigationTimerRef.current = setTimeout(() => {
      startTransition(() => {
        router.replace(
          vehicleSearchUrl({ filters: nextFilters, sort: nextSort, page: 1 }),
          { scroll: false },
        );
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

  function removeFilter(key: keyof SearchFilters) {
    changeFilters({ ...filters, [key]: defaultSearchFilters[key] }, 0);
  }

  function toggleFavorite(listingId: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  }

  function scrollToResults() {
    document.getElementById("cars")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectSuggestion(suggestion: string) {
    changeFilters({ ...filters, query: suggestion }, 0);
    requestAnimationFrame(scrollToResults);
  }

  return (
    <main>
      <SearchHero
        locale={locale}
        onLocaleChange={changeLocale}
        onQueryChange={(query) => changeFilters({ ...filters, query }, 300)}
        onSearch={scrollToResults}
        onSuggestionSelect={selectSuggestion}
        query={filters.query}
        savedCount={favorites.size}
        suggestions={suggestions}
        totalListings={pagination.totalListings}
      />

      <section
        aria-busy={isUpdating}
        className="scroll-mt-3 bg-[#fafaf7] px-5 py-9 sm:px-8 sm:py-11 lg:px-12 lg:py-12"
        id="cars"
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d7b72]">
                {copy.results.eyebrow}
              </p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-3xl font-medium tracking-[-0.045em] text-[#17211b] sm:text-[2.1rem]">
                  {copy.results.title}
                </h2>
                <p aria-live="polite" className="text-sm text-[#69736d]">
                  {copy.results.rangeCount(
                    firstListingNumber,
                    lastListingNumber,
                    pagination.totalListings,
                  )}
                </p>
                {lastSynchronizedAt ? (
                  <p className="text-xs text-[#8a928d]">
                    {copy.results.synchronized} {new Intl.DateTimeFormat(formatLocale, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Stockholm",
                    }).format(new Date(lastSynchronizedAt))}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                aria-controls="mobile-filters"
                aria-expanded={showMobileFilters}
                className="flex h-11 items-center gap-2 rounded-xl border border-[#dedfd9] bg-white px-3.5 text-sm font-semibold text-[#28332c] shadow-sm transition hover:border-[#c6cbc4] hover:shadow-md active:scale-[0.98] md:hidden"
                onClick={() => setShowMobileFilters(true)}
                type="button"
              >
                <SlidersIcon className="size-4" />
                {copy.results.filterButton}
                {activeFilterCount > 0 ? (
                  <span className="grid size-5 place-items-center rounded-full bg-[#1c3827] text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <label className="relative flex h-11 items-center gap-2 rounded-xl border border-[#dedfd9] bg-white pl-3.5 shadow-sm transition hover:border-[#c6cbc4] hover:shadow-md focus-within:border-[#708b79] focus-within:ring-4 focus-within:ring-[#708b79]/10">
                <span className="hidden text-xs font-medium text-[#7a837d] sm:inline">
                  {copy.results.sortLabel}:
                </span>
                <select
                  aria-label={copy.results.sortAria}
                  className="h-full appearance-none bg-transparent py-0 pl-0 pr-9 text-sm font-semibold text-[#28332c] outline-none"
                  onChange={(event) => changeSort(event.target.value as SearchSort)}
                  value={sort}
                >
                  {(Object.keys(copy.results.sorts) as SearchSort[]).map((sortValue) => (
                    <option key={sortValue} value={sortValue}>
                      {copy.results.sorts[sortValue]}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[#78817b]" />
              </label>
            </div>
          </div>

          <div className="mb-5 h-9">
            {activeFilters.length > 0 ? (
              <div
                className="flex h-9 items-start gap-2 overflow-x-auto pb-1"
                aria-label={copy.results.activeFilters}
              >
                {activeFilters.map((filter) => (
                  <button
                    aria-label={copy.results.removeFilter(filter.label)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#ccd5ce] bg-[#f0f5f1] px-3 py-1.5 text-xs font-semibold text-[#354c3e] transition hover:border-[#9fb0a4] hover:bg-white hover:text-[#17211b]"
                    key={filter.key}
                    onClick={() => removeFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                    <CloseIcon className="size-3" />
                  </button>
                ))}
                <button
                  className="shrink-0 rounded-full px-2.5 text-xs font-semibold text-[#66736a] underline-offset-4 hover:text-[#17211b] hover:underline"
                  onClick={resetFilters}
                  type="button"
                >
                  {copy.filters.resetAll}
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid min-w-0 items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
            <aside className="hidden min-w-0 self-stretch md:block">
              <div className="sticky top-4 z-10 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[#e2e2dc] bg-white p-4 shadow-[0_8px_30px_rgba(26,35,29,0.04)]">
                <FilterPanel
                  brands={availableFilters.brands}
                  budgetRange={availableFilters.priceRange}
                  filters={filters}
                  locale={locale}
                  models={availableFilters.models}
                  onChange={changeFilters}
                  onReset={resetFilters}
                />
              </div>
            </aside>

            <div className="min-w-0">
              {results.length > 0 ? (
                <>
                  <motion.div className="grid min-w-0 gap-5 xl:grid-cols-2 2xl:grid-cols-3" layout>
                    <AnimatePresence initial={false} mode="popLayout">
                      {results.map((result, index) => (
                        <motion.div
                          animate={{ opacity: 1, y: 0 }}
                          className="min-w-0"
                          exit={{ opacity: 0, scale: 0.98 }}
                          initial={{ opacity: 0, y: 8 }}
                          key={result.listing.id}
                          layout
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          <VehicleCard
                            isFavorite={favorites.has(result.listing.id)}
                            locale={locale}
                            onToggleFavorite={() => toggleFavorite(result.listing.id)}
                            priority={index < 2}
                            result={result}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>

                  {pagination.totalPages > 1 ? (
                    <nav
                      aria-label={copy.results.paginationLabel}
                      className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-[#e2e2dc] bg-white p-3 shadow-[0_8px_30px_rgba(26,35,29,0.04)] sm:flex-row sm:p-4"
                    >
                      <p className="px-2 text-sm font-medium text-[#69736d]">
                        {copy.results.pageOf(pagination.page, pagination.totalPages)}
                      </p>
                      <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
                        {pagination.page > 1 ? (
                          <Link
                            aria-label={copy.results.previousPage}
                            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-[#d9ddd7] px-3 text-sm font-semibold text-[#334139] transition hover:border-[#aebbb2] hover:bg-[#f4f7f4] active:scale-[0.98] sm:flex-none"
                            href={vehicleSearchUrl({
                              filters,
                              sort,
                              page: pagination.page - 1,
                            })}
                            prefetch={false}
                          >
                            <span className="sm:hidden">‹</span>
                            <span className="hidden sm:inline">{copy.results.previousPage}</span>
                          </Link>
                        ) : (
                          <span
                            aria-disabled="true"
                            className="flex h-10 flex-1 cursor-not-allowed items-center justify-center rounded-xl border border-[#eceeea] px-3 text-sm font-semibold text-[#a7ada9] sm:flex-none"
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
                                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#254934] text-sm font-bold text-white shadow-sm"
                                  key={item}
                                >
                                  {item}
                                </span>
                              ) : (
                                <Link
                                  aria-label={copy.results.goToPage(item)}
                                  className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-[#526058] transition hover:bg-[#edf2ee] hover:text-[#17211b] active:scale-[0.96]"
                                  href={vehicleSearchUrl({ filters, sort, page: item })}
                                  key={item}
                                  prefetch={false}
                                >
                                  {item}
                                </Link>
                              )
                            ) : (
                              <span
                                aria-hidden="true"
                                className="grid size-6 shrink-0 place-items-center text-sm text-[#919a94] sm:size-8"
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
                            className="flex h-10 flex-1 items-center justify-center rounded-xl bg-[#17221c] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2b3b32] hover:shadow-md active:scale-[0.98] sm:flex-none"
                            href={vehicleSearchUrl({
                              filters,
                              sort,
                              page: pagination.page + 1,
                            })}
                            prefetch={false}
                          >
                            <span className="sm:hidden">›</span>
                            <span className="hidden sm:inline">{copy.results.nextPage}</span>
                          </Link>
                        ) : (
                          <span
                            aria-disabled="true"
                            className="flex h-10 flex-1 cursor-not-allowed items-center justify-center rounded-xl bg-[#e7eae6] px-3 text-sm font-semibold text-[#9ba29d] sm:flex-none"
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
                <div className="grid min-h-96 place-items-center rounded-[1.6rem] border border-dashed border-[#d6d9d2] bg-white p-8 text-center shadow-[0_12px_40px_rgba(26,35,29,0.035)]">
                  <div className="max-w-sm">
                    <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#eef1ec] text-[#526359]">
                      <SearchEmptyIcon className="size-6" />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold text-[#1d2821]">
                      {copy.results.noResultsTitle}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#69736d]">
                      {copy.results.noResultsBody}
                    </p>
                    <button
                      className="mt-5 rounded-full bg-[#1b2b21] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#304238]"
                      onClick={() => changeFilters(defaultSearchFilters, 0)}
                      type="button"
                    >
                      {copy.results.clearFilters}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e8e8e2] bg-[#fafaf7] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 text-xs text-[#747e78] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Car Finder. {copy.footer.tagline}</p>
          <p>{copy.footer.disclaimer}</p>
        </div>
      </footer>

      <AnimatePresence>
        {showMobileFilters ? (
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
              onClick={() => setShowMobileFilters(false)}
              tabIndex={-1}
              type="button"
            />
            <motion.div
              animate={{ y: 0 }}
              className="absolute inset-x-0 bottom-0 z-10 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-[#fafaf7] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:inset-x-6 sm:bottom-6 sm:rounded-[1.75rem]"
              exit={{ y: "100%" }}
              initial={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#c7cbc6]" />
              <div className="mb-5 flex items-center justify-between">
                <h2
                  className="text-lg font-semibold tracking-[-0.025em] text-[#17211b]"
                  id="mobile-filters-title"
                >
                  {copy.results.mobileTitle}
                </h2>
                <button
                  aria-label={copy.results.closeFilters}
                  className="grid size-11 place-items-center rounded-full border border-[#dedfd9] bg-white text-[#3c4840] shadow-sm transition hover:border-[#bdc6bf]"
                  onClick={() => setShowMobileFilters(false)}
                  ref={closeFiltersRef}
                  type="button"
                >
                  <CloseIcon className="size-5" />
                </button>
              </div>
              <FilterPanel
                brands={availableFilters.brands}
                budgetRange={availableFilters.priceRange}
                filters={filters}
                locale={locale}
                models={availableFilters.models}
                onChange={changeFilters}
                onReset={resetFilters}
              />
              <button
                className="sticky bottom-0 mt-7 h-13 w-full rounded-full bg-[#17221c] text-sm font-semibold text-white shadow-[0_10px_30px_rgba(23,34,28,0.24)] transition hover:bg-[#2b3b32] active:scale-[0.99]"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                {copy.hero.showCars(pagination.totalListings)}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
