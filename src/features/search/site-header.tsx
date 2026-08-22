import Image from "next/image";
import Link from "next/link";
import { CompareIcon, HeartIcon, MapPinIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { uiCopy, type Locale } from "./copy";

import type { LocationStatus } from "./use-current-location";

interface SiteHeaderProps {
  activePage?: "cars" | "saved" | "compare";
  locale: Locale;
  savedCount: number;
  compareCount: number;
  onLocaleChange: (locale: Locale) => void;
  logoHref?: string;
  locationStatus?: LocationStatus;
  onRequestLocation?: () => void;
}

export function SiteHeader({
  activePage,
  locale,
  savedCount,
  compareCount,
  onLocaleChange,
  logoHref = "/",
  locationStatus,
  onRequestLocation,
}: SiteHeaderProps) {
  const copy = uiCopy[locale];
  const locationLabel =
    locationStatus === "locating"
      ? copy.results.locating
      : locationStatus === "ready"
        ? copy.results.locationOn
        : locationStatus === "denied"
          ? copy.results.locationDenied
          : locationStatus === "unavailable"
            ? copy.results.locationUnavailable
            : copy.results.useCurrentLocation;

  return (
    <header className="relative border-b border-border">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
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
          <nav className="hidden items-center gap-6 text-sm text-ink-muted md:flex">
            {onRequestLocation ? (
              <button
                aria-live="polite"
                className={`flex items-center gap-1.5 rounded-full px-3 py-2 font-medium transition-colors ${
                  locationStatus === "ready"
                    ? "text-positive"
                    : "text-ink-muted hover:bg-surface/55 hover:text-ink"
                }`}
                disabled={locationStatus === "locating"}
                onClick={onRequestLocation}
                type="button"
              >
                <MapPinIcon className="size-4" />
                {locationLabel}
              </button>
            ) : null}
            <Link
              aria-current={activePage === "compare" ? "page" : undefined}
              className={`rounded-full px-3 py-2 font-medium transition-colors ${
                activePage === "compare"
                  ? "bg-surface/80 text-ink shadow-sm"
                  : "text-ink-muted hover:bg-surface/55 hover:text-ink"
              }`}
              href="/compare"
            >
              {copy.nav.compare}{" "}
              <span className="text-ink-subtle">{compareCount}</span>
            </Link>
            <Link
              aria-current={activePage === "saved" ? "page" : undefined}
              className={`rounded-full px-3 py-2 font-medium transition-colors ${
                activePage === "saved"
                  ? "bg-surface/80 text-ink shadow-sm"
                  : "text-ink-muted hover:bg-surface/55 hover:text-ink"
              }`}
              href="/saved"
            >
              {copy.nav.saved}{" "}
              <span className="text-ink-subtle">{savedCount}</span>
            </Link>
          </nav>

          <div
            aria-label={copy.languageSwitchLabel}
            className="flex rounded-full border border-border bg-surface/65 p-0.5 text-[11px] font-semibold shadow-sm backdrop-blur"
            role="group"
          >
            {(["en", "sv"] as const).map((language) => (
              <button
                aria-pressed={locale === language}
                className={`min-h-8 rounded-full px-2.5 transition ${
                  locale === language
                    ? "bg-ink text-surface shadow-sm"
                    : "text-ink-subtle hover:text-ink"
                }`}
                key={language}
                onClick={() => onLocaleChange(language)}
                type="button"
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>

          <ThemeToggle
            ariaLabel={copy.themeSwitchLabel}
            darkLabel={copy.darkTheme}
            lightLabel={copy.lightTheme}
            className="hidden sm:flex"
          />

          {onRequestLocation ? (
            <button
              aria-label={locationLabel}
              className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition md:hidden ${
                locationStatus === "ready"
                  ? "border-accent/40 bg-accent-soft text-positive"
                  : "border-border bg-surface/70 text-ink hover:bg-surface"
              }`}
              disabled={locationStatus === "locating"}
              onClick={onRequestLocation}
              type="button"
            >
              <MapPinIcon className="size-4" />
            </button>
          ) : null}

          <Link
            aria-label={copy.nav.compareCars(compareCount)}
            aria-current={activePage === "compare" ? "page" : undefined}
            className={`relative grid size-10 place-items-center rounded-full border text-ink shadow-sm backdrop-blur transition md:hidden ${
              activePage === "compare"
                ? "border-border-strong bg-surface"
                : "border-border bg-surface/70 hover:bg-surface"
            }`}
            href="/compare"
          >
            <CompareIcon className="size-4" />
            {compareCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-bold leading-none text-surface ring-2 ring-background"
              >
                {compareCount}
              </span>
            ) : null}
          </Link>

          <Link
            aria-label={copy.nav.savedCars(savedCount)}
            aria-current={activePage === "saved" ? "page" : undefined}
            className={`relative grid size-10 place-items-center rounded-full border text-ink shadow-sm backdrop-blur transition md:hidden ${
              activePage === "saved"
                ? "border-border-strong bg-surface"
                : "border-border bg-surface/70 hover:bg-surface"
            }`}
            href="/saved"
          >
            <HeartIcon className="size-4" />
            {savedCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-bold leading-none text-surface ring-2 ring-background"
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
