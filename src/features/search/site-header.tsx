import Image from "next/image";
import Link from "next/link";
import { HeartIcon, SearchIcon } from "./icons";
import { uiCopy, type Locale } from "./copy";

interface SiteHeaderProps {
  activePage?: "cars" | "saved";
  locale: Locale;
  savedCount: number;
  onLocaleChange: (locale: Locale) => void;
  findCarsHref?: string;
  logoHref?: string;
}

export function SiteHeader({
  activePage,
  locale,
  savedCount,
  onLocaleChange,
  findCarsHref = "/#cars",
  logoHref = "/",
}: SiteHeaderProps) {
  const copy = uiCopy[locale];

  return (
    <header className="relative border-b border-[#24362b]/[0.06]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
        <Link
          aria-label={copy.nav.home}
          className="group flex items-center gap-2.5 rounded-lg"
          href={logoHref}
        >
          <Image
            alt=""
            aria-hidden="true"
            className="size-9 object-contain transition-transform duration-300 group-hover:scale-105"
            height={36}
            priority
            src="/brand/carnalysis-mark.png"
            width={36}
          />
          <span className="text-[17px] font-semibold tracking-[-0.035em] text-ink max-[390px]:hidden">
            Carnalysis
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-5">
          <nav className="hidden items-center gap-6 text-sm text-[#59635d] md:flex">
            <Link
              aria-current={activePage === "cars" ? "page" : undefined}
              className={`rounded-full px-3 py-2 transition-colors ${
                activePage === "cars"
                  ? "bg-white/80 font-medium text-ink shadow-sm"
                  : "hover:bg-white/55 hover:text-ink"
              }`}
              href={findCarsHref}
            >
              {copy.nav.findCars}
            </Link>
            <Link
              aria-current={activePage === "saved" ? "page" : undefined}
              className={`rounded-full px-3 py-2 font-medium transition-colors ${
                activePage === "saved"
                  ? "bg-white/80 text-ink shadow-sm"
                  : "text-[#354139] hover:bg-white/55 hover:text-ink"
              }`}
              href="/saved"
            >
              {copy.nav.saved}{" "}
              <span className="text-[#8c948f]">{savedCount}</span>
            </Link>
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
                    ? "bg-ink text-white shadow-sm"
                    : "text-[#68716b] hover:text-ink"
                }`}
                key={language}
                onClick={() => onLocaleChange(language)}
                type="button"
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>

          <Link
            aria-current={activePage === "cars" ? "page" : undefined}
            aria-label={copy.nav.findCars}
            className={`grid size-10 place-items-center rounded-full border text-ink shadow-sm backdrop-blur transition md:hidden ${
              activePage === "cars"
                ? "border-[#bcc8bf] bg-white"
                : "border-[#d9d7d0] bg-white/70 hover:bg-white"
            }`}
            href={findCarsHref}
          >
            <SearchIcon className="size-4" />
          </Link>

          <Link
            aria-label={copy.nav.savedCars(savedCount)}
            aria-current={activePage === "saved" ? "page" : undefined}
            className={`relative grid size-10 place-items-center rounded-full border text-ink shadow-sm backdrop-blur transition md:hidden ${
              activePage === "saved"
                ? "border-[#bcc8bf] bg-white"
                : "border-[#d9d7d0] bg-white/70 hover:bg-white"
            }`}
            href="/saved"
          >
            <HeartIcon className="size-4" />
            {savedCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#f4f1ea]"
              >
                {savedCount > 99 ? "99+" : savedCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
