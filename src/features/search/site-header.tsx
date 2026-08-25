import Link from "next/link";
import { CarnalysMark } from "./carnalys-mark";
import {
  CompareIcon,
  HeartIcon,
  MapPinIcon,
  MarketAnalysisIcon,
} from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { uiCopy, type Locale } from "./copy";

import type { LocationStatus } from "./use-current-location";

interface SiteHeaderProps {
  activePage?: "cars" | "saved" | "compare" | "analysis";
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
          <CarnalysMark className="size-8 text-ink transition-transform duration-300 group-hover:scale-105" />
          <span className="text-[15px] font-semibold uppercase tracking-[0.16em] text-ink max-[390px]:hidden">
            Carnalys
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-5">
          {/* These read as controls now rather than as muted words in a row.
              Each nav item carries its icon, sits on its own surface with a
              border, and takes full-strength ink — the previous
              `text-ink-muted` on bare text made the whole header look like a
              caption. Colour is doing one job only: a count above zero is
              live state, so it gets the accent; a count of zero stays quiet.
              An empty Compare or Saved is not news. */}
          <nav className="hidden items-center gap-2 text-sm md:flex">
            {onRequestLocation ? (
              <button
                aria-live="polite"
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 font-semibold shadow-sm transition ${
                  locationStatus === "ready"
                    ? "border-accent/40 bg-accent-soft text-accent-strong"
                    : "border-border bg-surface text-ink hover:border-border-strong hover:shadow-md"
                } disabled:opacity-60`}
                disabled={locationStatus === "locating"}
                onClick={onRequestLocation}
                type="button"
              >
                <MapPinIcon className="size-4" />
                {locationLabel}
              </button>
            ) : null}
            {(
              [
                ["analysis", "/analysis", copy.nav.analysis, MarketAnalysisIcon, null],
                ["compare", "/compare", copy.nav.compare, CompareIcon, compareCount],
                ["saved", "/saved", copy.nav.saved, HeartIcon, savedCount],
              ] as const
            ).map(([page, href, label, Icon, count]) => {
              const isActive = activePage === page;
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 font-semibold shadow-sm transition ${
                    isActive
                      ? "border-ink bg-ink text-surface"
                      : "border-border bg-surface text-ink hover:border-border-strong hover:shadow-md"
                  }`}
                  href={href}
                  key={page}
                >
                  <Icon className="size-4" />
                  {label}
                  {count !== null ? (
                    <span
                      className={`grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums ${
                        count > 0
                          ? "bg-accent text-surface"
                          : isActive
                            ? "text-surface/60"
                            : "text-ink-subtle"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
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
                  ? "border-accent/40 bg-accent-soft text-accent-strong"
                  : "border-border-strong bg-surface text-ink hover:border-ink"
              }`}
              disabled={locationStatus === "locating"}
              onClick={onRequestLocation}
              type="button"
            >
              <MapPinIcon className="size-[18px]" strokeWidth={2.1} />
            </button>
          ) : null}

          <Link
            aria-label={copy.nav.analysis}
            aria-current={activePage === "analysis" ? "page" : undefined}
            className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition md:hidden ${
              activePage === "analysis"
                ? "border-ink bg-ink text-surface"
                : "border-border-strong bg-surface text-ink hover:border-ink"
            }`}
            href="/analysis"
          >
            <MarketAnalysisIcon className="size-[18px]" strokeWidth={2.1} />
          </Link>

          <Link
            aria-label={copy.nav.compareCars(compareCount)}
            aria-current={activePage === "compare" ? "page" : undefined}
            className={`relative grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition md:hidden ${
              activePage === "compare"
                ? "border-ink bg-ink text-surface"
                : "border-border-strong bg-surface text-ink hover:border-ink"
            }`}
            href="/compare"
          >
            <CompareIcon className="size-[18px]" strokeWidth={2.1} />
            {compareCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-surface ring-2 ring-background"
              >
                {compareCount}
              </span>
            ) : null}
          </Link>

          <Link
            aria-label={copy.nav.savedCars(savedCount)}
            aria-current={activePage === "saved" ? "page" : undefined}
            className={`relative grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition md:hidden ${
              activePage === "saved"
                ? "border-ink bg-ink text-surface"
                : "border-border-strong bg-surface text-ink hover:border-ink"
            }`}
            href="/saved"
          >
            <HeartIcon className="size-[18px]" strokeWidth={2.1} />
            {savedCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-surface ring-2 ring-background"
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
