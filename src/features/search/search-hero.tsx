import Link from "next/link";
import type { ReactNode } from "react";
import { uiCopy, type Locale } from "./copy";

interface SearchHeroProps {
  locale: Locale;
  totalListings: number;
  analyst: ReactNode;
}

export function SearchHero({
  locale,
  totalListings,
  analyst,
}: SearchHeroProps) {
  const copy = uiCopy[locale];

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-surface">
      {/* Marketing photo, bled off the right edge. A CSS background rather than
          <Image> so a missing file degrades to the plain band instead of a
          broken-image box. Asset lives at public/images/hero.png. The overlay
          is solid only at the far left and fully clear by ~40% across, so the
          car itself keeps full contrast instead of sitting under a veil. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[61%] bg-cover bg-[position:66%_center] bg-no-repeat sm:block lg:w-[58%]"
        style={{ backgroundImage: "url(/images/hero.png)" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--surface) 0%, var(--surface) 8%, transparent 48%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-[1800px] items-center px-5 py-9 sm:min-h-[410px] sm:px-8 sm:py-12 lg:px-12">
        <div className="w-full max-w-[39rem]">
          <p className="text-xs font-semibold tracking-[-0.01em] text-accent-strong">
            {copy.hero.eyebrow}
          </p>

          <h1 className="mt-4 max-w-[38rem] text-balance text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.045em] text-ink sm:text-[2.75rem] xl:text-[3.15rem]">
            <span className="block">{copy.hero.headlineLead}</span>
            <span className="block">
              {copy.hero.headlineRest}
              <span className="whitespace-nowrap text-accent">
                {copy.hero.headlineEmphasis}
              </span>
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-ink-muted">
            {copy.hero.description}
          </p>

          <form action="/#cars" className="mt-6 flex max-w-xl gap-2" role="search">
            <label className="sr-only" htmlFor="hero-search">{copy.hero.searchLabel}</label>
            <input
              className="h-12 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface/95 px-4 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
              id="hero-search"
              name="q"
              placeholder={copy.hero.searchPlaceholder}
              type="search"
            />
            <button
              className="h-12 shrink-0 rounded-xl bg-ink px-5 text-sm font-semibold text-surface shadow-sm transition hover:opacity-90 active:scale-[0.98]"
              type="submit"
            >
              {copy.hero.searchAction}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Link
              className="inline-flex h-11 items-center rounded-full border border-border-strong bg-surface/90 px-4 text-sm font-semibold text-ink shadow-sm transition hover:border-accent/50 hover:shadow-md"
              href="#cars"
            >
              {locale === "sv" ? "Hitta en bil" : "Find a car"}
            </Link>
            {analyst}
            <Link
              className="inline-flex h-11 items-center rounded-full border border-border-strong bg-surface/90 px-4 text-sm font-semibold text-ink shadow-sm transition hover:border-accent/50 hover:shadow-md"
              href="/?sort=deal_score#cars"
            >
              {locale === "sv" ? "Bästa köpen" : "Best deals"}
            </Link>
          </div>

          <p className="mt-4 text-xs font-medium text-ink-subtle">
            {copy.hero.analysedCount(totalListings)}
          </p>
        </div>
      </div>
    </section>
  );
}
