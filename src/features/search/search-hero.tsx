import { ArrowRightIcon, CheckIcon, HeartIcon, SearchIcon } from "./icons";
import { uiCopy, type Locale } from "./copy";

interface SearchHeroProps {
  locale: Locale;
  query: string;
  totalListings: number;
  savedCount: number;
  suggestions: readonly string[];
  onLocaleChange: (locale: Locale) => void;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onSuggestionSelect: (suggestion: string) => void;
}

export function SearchHero({
  locale,
  query,
  totalListings,
  savedCount,
  suggestions,
  onLocaleChange,
  onQueryChange,
  onSearch,
  onSuggestionSelect,
}: SearchHeroProps) {
  const copy = uiCopy[locale];

  return (
    <section className="relative overflow-hidden border-b border-[#26382d]/[0.07] bg-[#f4f1ea]">
      <div className="pointer-events-none absolute inset-0 hero-glow" />
      <header className="relative mx-auto flex h-16 max-w-[1440px] items-center justify-between border-b border-[#24362b]/[0.06] px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
        <a className="group flex items-center gap-2.5 rounded-lg" href="#top" aria-label={copy.nav.home}>
          <span className="grid size-8 place-items-center rounded-full bg-[#17221c] text-white shadow-sm">
            <span className="size-2.5 rounded-full border-2 border-white transition-transform duration-300 group-hover:scale-75" />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.035em] text-[#17221c]">
            Car Finder
          </span>
        </a>

        <div className="flex items-center gap-2 sm:gap-5">
          <nav className="hidden items-center gap-6 text-sm text-[#59635d] md:flex">
            <a className="transition-colors hover:text-[#17221c]" href="#cars">
              {copy.nav.findCars}
            </a>
            <a className="transition-colors hover:text-[#17221c]" href="#how-it-works">
              {copy.nav.howItWorks}
            </a>
            <button
              className="rounded-full px-2 py-2 font-medium text-[#354139] transition-colors hover:text-[#17221c]"
              type="button"
            >
              {copy.nav.saved} <span className="text-[#8c948f]">{savedCount}</span>
            </button>
          </nav>

          <div
            aria-label={copy.languageSwitchLabel}
            className="flex rounded-full border border-[#d6d5cf] bg-white/65 p-0.5 text-[11px] font-semibold shadow-sm backdrop-blur"
            role="group"
          >
            {(["en", "sv"] as const).map((language) => (
              <button
                aria-pressed={locale === language}
                className={`min-h-8 rounded-full px-2.5 transition ${
                  locale === language
                    ? "bg-[#17221c] text-white shadow-sm"
                    : "text-[#68716b] hover:text-[#17221c]"
                }`}
                key={language}
                onClick={() => onLocaleChange(language)}
                type="button"
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            aria-label={copy.nav.savedCars(savedCount)}
            className="grid size-10 place-items-center rounded-full border border-[#d9d7d0] bg-white/70 text-[#17221c] shadow-sm backdrop-blur transition hover:bg-white md:hidden"
            type="button"
          >
            <HeartIcon className="size-4" />
          </button>
        </div>
      </header>

      <div
        id="top"
        className="relative mx-auto max-w-[1440px] px-5 pb-9 pt-9 sm:px-8 sm:pb-11 sm:pt-11 lg:px-12 lg:pb-12 lg:pt-12"
      >
        <div className="max-w-4xl">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.17em] text-[#617269] sm:text-xs">
            <span className="h-px w-6 bg-[#82998c]" />
            {copy.hero.eyebrow}
          </p>
          <h1 className="max-w-3xl text-balance text-[clamp(2.55rem,5.2vw,4.7rem)] font-medium leading-[0.96] tracking-[-0.06em] text-[#152019]">
            {copy.hero.title}
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-[#5c655f] sm:text-lg">
            {copy.hero.description}
          </p>
        </div>

        <form
          className="mt-6 flex max-w-4xl flex-col gap-2 rounded-[1.35rem] border border-white/90 bg-white p-2 shadow-[0_18px_55px_rgba(42,53,46,0.13)] transition-[box-shadow,border-color,transform] duration-300 focus-within:-translate-y-0.5 focus-within:border-[#aebeb4] focus-within:shadow-[0_24px_65px_rgba(42,53,46,0.17)] sm:flex-row sm:rounded-full"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-h-14 flex-1 items-center gap-3 px-3 sm:px-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eef2ed] text-[#52675b]">
              <SearchIcon className="size-[18px]" />
            </span>
            <span className="sr-only">{copy.hero.searchLabel}</span>
            <input
              autoComplete="off"
              className="w-full bg-transparent text-base font-medium text-[#17221c] outline-none placeholder:font-normal placeholder:text-[#929993]"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={copy.hero.searchPlaceholder}
              type="search"
              value={query}
            />
          </label>
          <button
            className="group flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#17221c] px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(23,34,28,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#2b3b32] hover:shadow-[0_12px_24px_rgba(23,34,28,0.2)] active:translate-y-0 sm:rounded-full"
            type="submit"
          >
            {copy.hero.showCars(totalListings)}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        <div className="mt-3 flex max-w-4xl items-center gap-2 overflow-x-auto pb-1" aria-label={copy.hero.suggestionsLabel}>
          <span className="shrink-0 text-xs font-medium text-[#7b837e]">{copy.hero.popular}:</span>
          {suggestions.map((suggestion) => (
            <button
              className="shrink-0 rounded-full border border-[#d8dad4] bg-white/60 px-3 py-1.5 text-xs font-medium text-[#536058] transition hover:border-[#b8c1ba] hover:bg-white hover:text-[#17221c]"
              key={suggestion}
              onClick={() => onSuggestionSelect(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div
          id="how-it-works"
          className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#657068] sm:text-sm"
        >
          {copy.hero.benefits.map((item) => (
            <span className="flex items-center gap-1.5" key={item}>
              <span className="grid size-[18px] place-items-center rounded-full bg-[#dce5de] text-[#3f6550]">
                <CheckIcon className="size-2.5" />
              </span>
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
