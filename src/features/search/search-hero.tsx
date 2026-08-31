import type { ReactNode } from "react";
import { SearchIcon } from "./icons";
import { uiCopy, type Locale } from "./copy";

interface SearchHeroProps {
  locale: Locale;
  query: string;
  totalListings: number;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  /** The quick-filter row, rendered under the search field. */
  children?: ReactNode;
}

export function SearchHero({
  locale,
  query,
  totalListings,
  onQueryChange,
  onSearch,
  children,
}: SearchHeroProps) {
  const copy = uiCopy[locale];

  return (
    <section className="relative overflow-hidden border-b border-border bg-surface-subtle">
      {/* Marketing photo, bled off the right edge. A CSS background rather than
          <Image> so a missing file degrades to the plain band instead of a
          broken-image box. Asset lives at public/images/hero.png. The overlay
          is solid only at the far left and fully clear by ~40% across, so the
          car itself keeps full contrast instead of sitting under a veil. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] bg-cover bg-[position:68%_center] bg-no-repeat sm:block lg:w-[54%]"
        style={{ backgroundImage: "url(/images/hero.png)" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--surface-subtle) 0%, transparent 42%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-[360px] max-w-[1800px] items-center px-5 py-11 sm:min-h-[400px] sm:px-8 sm:py-12 lg:px-12">
        <div className="w-full max-w-xl">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
            {copy.hero.eyebrow}
          </span>

          <h1 className="mt-4 max-w-[34rem] text-balance text-[2rem] font-semibold leading-[1.12] tracking-[-0.03em] text-ink sm:text-[2.375rem] xl:text-[2.75rem]">
            <span className="block">{copy.hero.headlineLead}</span>
            <span className="block">
              {copy.hero.headlineRest}
              <span className="whitespace-nowrap text-accent">
                {copy.hero.headlineEmphasis}
              </span>
            </span>
          </h1>

          <p className="mt-3.5 text-sm font-medium text-ink-muted">
            {copy.hero.analysedCount(totalListings)}
          </p>

          <form
            className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 shadow-[0_8px_28px_rgba(42,53,46,0.1)] transition-[box-shadow,border-color] duration-200 focus-within:border-accent/50 focus-within:shadow-[0_10px_32px_rgba(42,53,46,0.14)]"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch();
            }}
          >
            <label className="flex min-h-11 flex-1 items-center gap-3 rounded-xl px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              <SearchIcon className="size-5 shrink-0 text-ink-subtle" />
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
              className="min-h-11 shrink-0 rounded-xl bg-accent px-6 text-sm font-semibold text-surface transition duration-200 hover:opacity-90 active:scale-[0.99]"
              type="submit"
            >
              {copy.hero.searchAction}
            </button>
          </form>

          {children ? <div className="mt-5">{children}</div> : null}

          {/* On mobile the photo can't bleed behind the copy without hurting
              legibility, so it rides along as its own framed band under the
              search field. CSS background (not <Image>) for the same reason as
              the desktop bleed: a missing file degrades to nothing, not a
              broken-image box. */}
          <div
            aria-hidden="true"
            className="mt-6 h-40 rounded-2xl border border-border bg-cover bg-[position:70%_center] bg-no-repeat sm:hidden"
            style={{ backgroundImage: "url(/images/hero.png)" }}
          />
        </div>
      </div>
    </section>
  );
}
