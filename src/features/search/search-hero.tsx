import { ArrowRightIcon, SearchIcon } from "./icons";
import { uiCopy, type Locale } from "./copy";
import { SiteHeader } from "./site-header";
import type { LocationStatus } from "./use-current-location";

interface SearchHeroProps {
  locale: Locale;
  query: string;
  totalListings: number;
  savedCount: number;
  compareCount: number;
  locationStatus: LocationStatus;
  onLocaleChange: (locale: Locale) => void;
  onQueryChange: (query: string) => void;
  onRequestLocation: () => void;
  onSearch: () => void;
}

export function SearchHero({
  locale,
  query,
  totalListings,
  savedCount,
  compareCount,
  locationStatus,
  onLocaleChange,
  onQueryChange,
  onRequestLocation,
  onSearch,
}: SearchHeroProps) {
  const copy = uiCopy[locale];

  return (
    <section className="relative border-b border-border bg-surface-subtle">
      <SiteHeader
        activePage="cars"
        locale={locale}
        locationStatus={locationStatus}
        logoHref="#top"
        onLocaleChange={onLocaleChange}
        onRequestLocation={onRequestLocation}
        savedCount={savedCount}
        compareCount={compareCount}
      />

      <div
        id="top"
        className="relative mx-auto max-w-[1800px] px-5 py-5 sm:px-8 sm:py-6 lg:px-12"
      >
        <form
          className="mx-auto flex max-w-[1400px] flex-col gap-2 rounded-[1.2rem] border border-border bg-surface p-1.5 shadow-[0_8px_28px_rgba(42,53,46,0.08)] transition-[box-shadow,border-color] duration-200 focus-within:border-accent/50 focus-within:shadow-[0_10px_32px_rgba(42,53,46,0.12)] sm:flex-row sm:rounded-full"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-h-12 flex-1 items-center gap-3 px-3 sm:px-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <SearchIcon className="size-4" />
            </span>
            <span className="sr-only">{copy.hero.searchLabel}</span>
            <input
              autoComplete="off"
              className="w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={copy.hero.searchPlaceholder}
              type="search"
              value={query}
            />
          </label>
          <button
            className="group flex min-h-12 items-center justify-center gap-2 rounded-[0.95rem] bg-ink px-6 text-sm font-semibold text-surface shadow-[0_6px_16px_rgba(0,0,0,0.14)] transition duration-200 hover:opacity-90 hover:shadow-[0_8px_20px_rgba(0,0,0,0.18)] active:scale-[0.99] sm:rounded-full"
            type="submit"
          >
            {copy.hero.showCars(totalListings)}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>
      </div>
    </section>
  );
}
