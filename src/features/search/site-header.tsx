"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CarnalysMark } from "./carnalys-mark";
import {
  CompareIcon,
  CloseIcon,
  HeartIcon,
  HomeIcon,
  MapPinIcon,
  MarketAnalysisIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "./icons";
import { signOutAction } from "@/features/auth/actions";
import { useAccount } from "@/features/auth/account-provider";
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
  /** Page-specific control shown at the start of the header's right cluster,
   *  beside the location button (the results page passes its "Update listings"
   *  button here). */
  syncSlot?: ReactNode;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onSearchSubmit?: () => void;
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
  syncSlot,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
}: SiteHeaderProps) {
  const router = useRouter();
  const { user } = useAccount();
  const copy = uiCopy[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery ?? "");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuId = useId();
  const accountId = useId();
  const searchId = useId();
  const effectiveSearchQuery = searchQuery ?? localSearchQuery;

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

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
    if (!menuOpen && !accountOpen && !searchOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
      if (accountOpen && !accountRef.current?.contains(target)) setAccountOpen(false);
      if (searchOpen && !searchRef.current?.contains(target)) setSearchOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setAccountOpen(false);
        setSearchOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, accountOpen, searchOpen]);

  const navItems = (
    [
      ["cars", "/", copy.nav.home, HomeIcon, null],
      ["saved", "/saved", copy.nav.saved, HeartIcon, savedCount],
      ["compare", "/compare", copy.nav.compare, CompareIcon, compareCount],
      ["analysis", "/analysis", copy.nav.analysis, MarketAnalysisIcon, null],
    ] as const
  ).map(([page, href, label, Icon, count]) => ({
    page,
    href,
    label,
    Icon,
    count,
    isActive: activePage === page,
  }));

  function updateSearchQuery(query: string) {
    setLocalSearchQuery(query);
    onSearchQueryChange?.(query);
  }

  function submitSearch() {
    if (onSearchSubmit) {
      onSearchSubmit();
      return;
    }
    const parameters = new URLSearchParams();
    if (effectiveSearchQuery.trim()) parameters.set("q", effectiveSearchQuery.trim());
    router.push(`/${parameters.size ? `?${parameters.toString()}` : ""}#cars`);
  }

  const searchForm = (mobile = false) => (
    <form
      className={mobile
        ? "flex items-center gap-2 rounded-xl border border-border bg-surface-subtle p-1.5"
        : "flex h-full w-full items-center border-b-2 border-accent"}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch();
        if (mobile) setMenuOpen(false);
      }}
    >
      <label className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
        <SearchIcon className="size-4 shrink-0 text-ink-subtle" />
        <span className="sr-only">{copy.hero.searchLabel}</span>
        <input
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle"
          id={mobile ? undefined : searchId}
          onChange={(event) => updateSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (!mobile && event.key === "Escape") setSearchOpen(false);
          }}
          placeholder={copy.hero.searchPlaceholder}
          ref={mobile ? undefined : searchInputRef}
          type="search"
          value={effectiveSearchQuery}
        />
      </label>
      {!mobile ? (
        <button
          aria-label={locale === "sv" ? "Stäng sökfältet" : "Close search"}
          className="grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-muted hover:text-ink"
          onClick={() => setSearchOpen(false)}
          type="button"
        >
          <CloseIcon className="size-3.5" />
        </button>
      ) : null}
      <button
        aria-label={copy.hero.searchAction}
        className={mobile
          ? "grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-surface"
          : "grid size-9 shrink-0 place-items-center rounded-full text-accent-strong transition hover:bg-accent-soft active:scale-95"}
        type="submit"
      >
        <SearchIcon className="size-4" />
      </button>
    </form>
  );

  return (
    <header className="relative z-30 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-[1800px] items-stretch justify-between gap-4 px-5 sm:h-[4.5rem] sm:px-8 lg:px-12">
        <div className="flex items-center gap-7">
          <Link
            aria-label={copy.nav.home}
            className="group flex shrink-0 items-center gap-2.5 rounded-lg"
            href={logoHref}
          >
            <CarnalysMark className="size-8 text-ink transition-transform duration-300 group-hover:scale-105" />
            <span className="text-[15px] font-semibold uppercase tracking-[0.16em] text-ink max-[360px]:hidden">
              Carnalys
            </span>
          </Link>

          {/* Full labelled nav from xl up. Below that the same items live in the
              menu. Active item carries an accent underline flush with the
              header's bottom border. */}
          <nav className="hidden h-full items-stretch gap-1 xl:flex">
            {navItems.map(({ page, href, label, Icon, count, isActive }) => (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex h-full items-center gap-2 border-b-2 px-2.5 text-sm font-medium transition ${
                  isActive
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
                href={href}
                key={page}
              >
                <Icon className="size-4" />
                {label}
                {count !== null && count > 0 ? (
                  <span className="grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold tabular-nums text-surface">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            ))}
            <div
              className="h-full shrink-0 overflow-hidden transition-[width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              ref={searchRef}
              style={{ width: searchOpen ? 288 : 72 }}
            >
              {searchOpen ? (
                <div className="fade-in h-full w-72" key="search-form">
                  {searchForm()}
                </div>
              ) : (
                <button
                  aria-controls={searchId}
                  aria-expanded="false"
                  className="fade-in inline-flex h-full w-[72px] items-center gap-2 border-b-2 border-transparent px-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
                  key="search-trigger"
                  onClick={() => setSearchOpen(true)}
                  type="button"
                >
                  <SearchIcon className="size-4 shrink-0" />
                  {copy.nav.search}
                </button>
              )}
            </div>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {syncSlot ? <div className="hidden xl:flex">{syncSlot}</div> : null}

          {onRequestLocation ? (
            <button
              aria-label={locationLabel}
              aria-live="polite"
              className={`hidden size-10 place-items-center rounded-full border shadow-sm transition xl:grid ${
                locationStatus === "ready"
                  ? "border-accent/40 bg-accent-soft text-accent-strong"
                  : "border-border bg-surface text-ink hover:border-border-strong hover:shadow-md"
              } disabled:opacity-60`}
              disabled={locationStatus === "locating"}
              onClick={onRequestLocation}
              type="button"
            >
              <MapPinIcon className="size-[18px]" />
            </button>
          ) : null}

          <div className="hidden xl:flex xl:items-center xl:gap-3">
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

          <div className="relative hidden xl:block" ref={accountRef}>
            <button
              aria-controls={accountOpen ? accountId : undefined}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label={copy.nav.account}
              className={`grid size-9 place-items-center rounded-full border shadow-sm transition ${
                accountOpen
                  ? "border-ink bg-ink text-surface"
                  : "border-border bg-surface text-ink hover:border-border-strong hover:shadow-md"
              }`}
              onClick={() => setAccountOpen((open) => !open)}
              type="button"
            >
              {user ? (
                <span className="text-xs font-bold uppercase">{user.username.slice(0, 2)}</span>
              ) : (
                <UserIcon className="size-[18px]" />
              )}
            </button>

            {accountOpen ? (
              <div
                className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-56 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_48px_rgba(26,35,29,0.16)]"
                id={accountId}
                role="menu"
              >
                {user ? (
                  <>
                    <div className="border-b border-border px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
                        {copy.nav.account}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-ink">{user.username}</p>
                    </div>
                    <Link
                      className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-muted"
                      href="/settings"
                      onClick={() => setAccountOpen(false)}
                      role="menuitem"
                    >
                      <SettingsIcon className="size-[18px] shrink-0" />
                      {copy.nav.settings}
                    </Link>
                    <form action={signOutAction}>
                      <button
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                        role="menuitem"
                        type="submit"
                      >
                        <UserIcon className="size-[18px] shrink-0" />
                        {copy.nav.signOut}
                      </button>
                    </form>
                  </>
                ) : (
                  <Link
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-muted"
                    href="/login"
                    onClick={() => setAccountOpen(false)}
                    role="menuitem"
                  >
                    <UserIcon className="size-[18px] shrink-0" />
                    {copy.nav.signIn}
                  </Link>
                )}
              </div>
            ) : null}
          </div>

          {/* Below xl: the page's sync action, the contextual location action,
              and one menu holding everything else. */}
          {syncSlot ? <div className="xl:hidden">{syncSlot}</div> : null}

          {onRequestLocation ? (
            <button
              aria-label={locationLabel}
              className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur transition xl:hidden ${
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

          <div className="relative xl:hidden" ref={menuRef}>
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
                  <div className="mt-1 border-t border-border pt-1.5">
                    {searchForm(true)}
                  </div>
                  {user ? (
                    <>
                      <Link
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-muted"
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        role="menuitem"
                      >
                        <SettingsIcon className="size-[18px] shrink-0" />
                        <span className="flex-1">{copy.nav.settings}</span>
                        <span className="max-w-24 truncate text-xs text-ink-subtle">{user.username}</span>
                      </Link>
                      <form action={signOutAction}>
                        <button
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-muted"
                          role="menuitem"
                          type="submit"
                        >
                          <UserIcon className="size-[18px] shrink-0" />
                          <span className="flex-1 text-left">{copy.nav.signOut}</span>
                        </button>
                      </form>
                    </>
                  ) : (
                    <Link
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-muted"
                      href="/login"
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                    >
                      <UserIcon className="size-[18px] shrink-0" />
                      <span className="flex-1 text-left">{copy.nav.signIn}</span>
                    </Link>
                  )}
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
