"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "./icons";
import { uiCopy, type Locale } from "./copy";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { useCompare } from "./use-compare";
import { useFavorites } from "./use-favorites";
import { useLocaleCookie } from "./use-locale-cookie";

/** Shared chrome for simple content pages (About, How it works, Disclaimer).
 *  Same header/footer wiring as every other page, just no results grid in
 *  between. Kept as its own component rather than copied three times.
 *  Content is passed as a render function so each page can pick its
 *  English/Swedish copy from the same locale this shell already owns. */
export function StaticPageShell({ children }: { children: (locale: Locale) => ReactNode }) {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { compared } = useCompare();
  const [locale, writeLocale] = useLocaleCookie();
  const copy = uiCopy[locale];

  function changeLocale(nextLocale: typeof locale) {
    writeLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  return (
    <div>
      <SiteHeader
        compareCount={compared.length}
        locale={locale}
        onLocaleChange={changeLocale}
        savedCount={favorites.size}
      />

      <main className="mx-auto max-w-[760px] px-5 py-10 sm:px-8 sm:py-14">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          onClick={() => router.back()}
          type="button"
        >
          <ArrowRightIcon className="size-4 rotate-180" />
          {copy.detail.back}
        </button>

        <div className="mt-6">{children(locale)}</div>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
