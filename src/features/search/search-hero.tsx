import Image from "next/image";
import { ArrowRightIcon, HeartIcon, SearchIcon } from "./icons";
import { uiCopy, type Locale } from "./copy";

interface SearchHeroProps {
  locale: Locale;
  query: string;
  totalListings: number;
  savedCount: number;
  onLocaleChange: (locale: Locale) => void;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}

export function SearchHero({
  locale,
  query,
  totalListings,
  savedCount,
  onLocaleChange,
  onQueryChange,
  onSearch,
}: SearchHeroProps) {
  const copy = uiCopy[locale];

  return (
    <section className="relative border-b border-[#26382d]/[0.07] bg-[#f4f1ea]">
      <header className="relative mx-auto flex h-16 max-w-[1440px] items-center justify-between border-b border-[#24362b]/[0.06] px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
        <a className="group flex items-center gap-2.5 rounded-lg" href="#top" aria-label={copy.nav.home}>
          <Image
            alt=""
            aria-hidden="true"
            className="size-9 object-contain transition-transform duration-300 group-hover:scale-105"
            height={36}
            priority
            src="/brand/car-finder-mark.png"
            width={36}
          />
          <span className="text-[17px] font-semibold tracking-[-0.035em] text-[#17221c]">
            Car Finder
          </span>
        </a>

        <div className="flex items-center gap-2 sm:gap-5">
          <nav className="hidden items-center gap-6 text-sm text-[#59635d] md:flex">
            <a className="transition-colors hover:text-[#17221c]" href="#cars">
              {copy.nav.findCars}
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
        className="relative mx-auto max-w-[1440px] px-5 py-5 sm:px-8 sm:py-6 lg:px-12"
      >
        <form
          className="mx-auto flex max-w-5xl flex-col gap-2 rounded-[1.2rem] border border-[#e1e3dc] bg-white p-1.5 shadow-[0_8px_28px_rgba(42,53,46,0.08)] transition-[box-shadow,border-color] duration-200 focus-within:border-[#9eafa4] focus-within:shadow-[0_10px_32px_rgba(42,53,46,0.12)] sm:flex-row sm:rounded-full"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="flex min-h-12 flex-1 items-center gap-3 px-3 sm:px-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef2ed] text-[#52675b]">
              <SearchIcon className="size-4" />
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
            className="group flex min-h-12 items-center justify-center gap-2 rounded-[0.95rem] bg-[#17221c] px-6 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(23,34,28,0.14)] transition duration-200 hover:bg-[#2b3b32] hover:shadow-[0_8px_20px_rgba(23,34,28,0.18)] active:scale-[0.99] sm:rounded-full"
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
