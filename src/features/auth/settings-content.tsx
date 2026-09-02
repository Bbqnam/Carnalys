"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSavedSearchAction,
  updatePasswordAction,
  updateSettingsAction,
  type SettingsActionState,
} from "./actions";
import type { AccountUser } from "./session";
import { SiteHeader } from "@/features/search/site-header";
import { useFavorites } from "@/features/search/use-favorites";
import { useCompare } from "@/features/search/use-compare";
import { useLocaleCookie } from "@/features/search/use-locale-cookie";
import { setStoredTheme } from "@/features/search/theme";
import { setLocaleCookie } from "@/features/search/locale";
import { setStoredViewMode } from "@/features/search/use-view-mode";
import { BookmarkIcon, HeartIcon, SettingsIcon, UserIcon } from "@/features/search/icons";

const initialState: SettingsActionState = {};

interface SavedSearchSummary {
  id: string;
  name: string;
  url: string;
  updatedAt: string;
}

export function SettingsContent({
  account,
  savedSearches,
}: {
  account: AccountUser;
  savedSearches: readonly SavedSearchSummary[];
}) {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { compared } = useCompare();
  const [locale, writeLocale] = useLocaleCookie();
  const [settingsState, settingsAction, settingsPending] = useActionState(updateSettingsAction, initialState);
  const [passwordState, passwordAction, passwordPending] = useActionState(updatePasswordAction, initialState);
  const en = locale === "en";

  useEffect(() => {
    if (!settingsState.success) return;
    const form = document.querySelector<HTMLFormElement>("#preferences-form");
    if (!form) return;
    const data = new FormData(form);
    const nextLocale = data.get("locale") === "sv" ? "sv" : "en";
    const theme = data.get("theme");
    const viewMode = data.get("viewMode") === "list" ? "list" : "grid";
    setLocaleCookie(nextLocale);
    setStoredTheme(theme === "light" || theme === "dark" ? theme : undefined);
    setStoredViewMode(viewMode);
    document.documentElement.lang = nextLocale;
    router.refresh();
  }, [router, settingsState.success]);

  function changeLocale(nextLocale: "en" | "sv") {
    writeLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  const fieldClass = "mt-2 h-11 w-full rounded-xl border border-border bg-surface-subtle px-3.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";

  return (
    <div>
      <SiteHeader
        compareCount={compared.length}
        locale={locale}
        onLocaleChange={changeLocale}
        savedCount={favorites.size}
      />
      <main className="mx-auto max-w-[1120px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10 lg:px-12">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
            {en ? "Your account" : "Ditt konto"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
            {en ? "Settings" : "Inställningar"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {en ? `Signed in as ${account.username}` : `Inloggad som ${account.username}`}
          </p>
          {account.isAdmin ? (
            <Link className="mt-4 inline-flex rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90" href="/admin/market-report">
              {en ? "Open market control" : "Öppna marknadskontroll"}
            </Link>
          ) : null}
        </header>

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          {[
            [UserIcon, account.username, en ? "Username" : "Användarnamn"],
            [HeartIcon, favorites.size.toString(), en ? "Saved cars" : "Sparade bilar"],
            [BookmarkIcon, savedSearches.length.toString(), en ? "Saved searches" : "Sparade sökningar"],
          ].map(([Icon, value, label]) => (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_30px_rgba(26,35,29,0.04)]" key={String(label)}>
              <Icon className="size-5 text-accent-strong" />
              <p className="mt-4 truncate text-xl font-semibold text-ink">{String(value)}</p>
              <p className="mt-1 text-xs text-ink-subtle">{String(label)}</p>
            </div>
          ))}
        </section>

        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-[1.5rem] border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(26,35,29,0.045)]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong"><SettingsIcon className="size-5" /></span>
              <div>
                <h2 className="text-lg font-semibold text-ink">{en ? "Preferences" : "Preferenser"}</h2>
                <p className="text-xs text-ink-subtle">{en ? "Used whenever you sign in." : "Används när du loggar in."}</p>
              </div>
            </div>
            <form action={settingsAction} className="mt-6 space-y-5" id="preferences-form">
              <label className="block text-sm font-semibold text-ink">
                {en ? "Language" : "Språk"}
                <select className={fieldClass} defaultValue={account.locale} name="locale">
                  <option value="en">English</option>
                  <option value="sv">Svenska</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-ink">
                {en ? "Theme" : "Tema"}
                <select className={fieldClass} defaultValue={account.theme} name="theme">
                  <option value="light">{en ? "Light" : "Ljust"}</option>
                  <option value="dark">{en ? "Dark" : "Mörkt"}</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-ink">
                {en ? "Default results view" : "Standardvy för resultat"}
                <select className={fieldClass} defaultValue={account.viewMode} name="viewMode">
                  <option value="grid">{en ? "Cards" : "Kort"}</option>
                  <option value="list">{en ? "List" : "Lista"}</option>
                </select>
              </label>
              <button className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60" disabled={settingsPending} type="submit">
                {settingsPending ? (en ? "Saving…" : "Sparar…") : en ? "Save preferences" : "Spara preferenser"}
              </button>
              {settingsState.success ? <span className="ml-3 text-sm text-positive">{en ? "Saved" : "Sparat"}</span> : null}
            </form>
          </section>

          <section className="rounded-[1.5rem] border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(26,35,29,0.045)]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong"><UserIcon className="size-5" /></span>
              <div>
                <h2 className="text-lg font-semibold text-ink">{en ? "Password" : "Lösenord"}</h2>
                <p className="text-xs text-ink-subtle">{en ? "Change your account password." : "Ändra lösenordet för kontot."}</p>
              </div>
            </div>
            <form action={passwordAction} className="mt-6 space-y-5">
              <label className="block text-sm font-semibold text-ink">
                {en ? "Current password" : "Nuvarande lösenord"}
                <input autoComplete="current-password" className={fieldClass} name="currentPassword" required type="password" />
              </label>
              <label className="block text-sm font-semibold text-ink">
                {en ? "New password" : "Nytt lösenord"}
                <input autoComplete="new-password" className={fieldClass} minLength={8} name="newPassword" required type="password" />
              </label>
              {passwordState.error ? <p className="text-sm text-negative" role="alert">{passwordState.error}</p> : null}
              <button className="h-11 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted disabled:opacity-60" disabled={passwordPending} type="submit">
                {passwordPending ? (en ? "Updating…" : "Uppdaterar…") : en ? "Update password" : "Uppdatera lösenord"}
              </button>
              {passwordState.success ? <span className="ml-3 text-sm text-positive">{en ? "Updated" : "Uppdaterat"}</span> : null}
            </form>
          </section>
        </div>

        <section className="mt-6 rounded-[1.5rem] border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(26,35,29,0.045)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{en ? "Saved searches" : "Sparade sökningar"}</h2>
              <p className="mt-1 text-sm text-ink-muted">{en ? "Open a saved set of filters whenever you want." : "Öppna en sparad uppsättning filter när du vill."}</p>
            </div>
            <Link className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted" href="/#cars">
              {en ? "Create from search" : "Skapa från sökning"}
            </Link>
          </div>

          {savedSearches.length ? (
            <div className="mt-5 divide-y divide-border rounded-xl border border-border">
              {savedSearches.map((search) => (
                <div className="flex items-center gap-3 p-3.5 sm:p-4" key={search.id}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong"><BookmarkIcon className="size-4" /></span>
                  <Link className="min-w-0 flex-1" href={search.url}>
                    <span className="block truncate text-sm font-semibold text-ink">{search.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-subtle">{new Date(search.updatedAt).toLocaleDateString(en ? "en-SE" : "sv-SE")}</span>
                  </Link>
                  <form action={deleteSavedSearchAction}>
                    <input name="id" type="hidden" value={search.id} />
                    <button className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-muted transition hover:bg-surface-muted hover:text-negative" type="submit">
                      {en ? "Remove" : "Ta bort"}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-surface-subtle px-5 py-8 text-center text-sm text-ink-muted">
              {en ? "You have not saved any searches yet." : "Du har inte sparat några sökningar ännu."}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
