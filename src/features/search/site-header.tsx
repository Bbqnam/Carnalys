"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CarnalysMark } from "./carnalys-mark";
import {
  CompareIcon,
  HeartIcon,
  MapPinIcon,
  MarketAnalysisIcon,
  MenuIcon,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

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

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const navItems = (
    [
      ["analysis", "/analysis", copy.nav.analysis, MarketAnalysisIcon, null],
      ["compare", "/compare", copy.nav.compare, CompareIcon, compareCount],
      ["saved", "/saved", copy.nav.saved, HeartIcon, savedCount],
    ] as const
  ).map(([page, href, label, Icon, count]) => ({
    page,
    href,
    label,
    Icon,
    count,
    isActive: activePage === page,
  }));

  return (
    <header className="relative border-b border-border">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
        <Link
          aria-label={copy.nav.home}
          className="group flex items-center gap-2.5 rounded-lg"
          href={logoHref}
        >
          <CarnalysMark className="size-8 text-ink transition-transform duration-300 group-hover:scale-105" />
          <span className="text-[15px] font-semibold uppercase tracking-[0.16em] text-ink max-[360px]:hidden">
            Carnalys
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Full labelled nav from lg up, where logo + cluster fits the
              content box. Below that the same items live in the menu. */}
          <nav className="hidden items-center gap-2 text-sm lg:flex">
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
            {navItems.map(({ page, href, label, Icon, count, isActive }) => (
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
            ))}
          </nav>

          <div className="hidden lg:flex lg:items-center lg:gap-4">
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
            />
          </div>

          {/* Below lg: at most two controls — the contextual location action,
              and one menu holding everything else. */}
          {onRequestLocation ? (
            <button
              aria-label={locationLabel}
              className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition lg:hidden ${
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

          <div className="relative lg:hidden" ref={menuRef}>
            <button
              aria-controls={menuId}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={copy.nav.menu}
              className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition ${
                menuOpen
                  ? "border-ink bg-ink text-surface"
                  : "border-border-strong bg-surface text-ink hover:border-ink"
              }`}
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              <MenuIcon className="size-[18px]" strokeWidth={2.1} />
            </button>

            {menuOpen ? (
              <div
                className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-60 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_48px_rgba(26,35,29,0.16)]"
                id={menuId}
                role="menu"
              >
                <div className="p-1.5">
                  {navItems.map(({ page, href, label, Icon, count, isActive }) => (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? "bg-ink text-surface"
                          : "text-ink hover:bg-surface-muted"
                      }`}
                      href={href}
                      key={page}
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                    >
                      <Icon className="size-[18px] shrink-0" />
                      <span className="flex-1">{label}</span>
                      {count !== null && count > 0 ? (
                        <span
                          className={`grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums ${
                            isActive ? "bg-surface/20 text-surface" : "bg-accent text-surface"
                          }`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-3">
                  <div
                    aria-label={copy.languageSwitchLabel}
                    className="flex rounded-full border border-border bg-surface-subtle p-0.5 text-[11px] font-semibold"
                    role="group"
                  >
                    {(["en", "sv"] as const).map((language) => (
                      <button
                        aria-pressed={locale === language}
                        className={`min-h-7 rounded-full px-3 transition ${
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
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
