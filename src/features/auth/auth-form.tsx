"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction, signUpAction, type AuthActionState } from "./actions";
import type { Locale } from "@/features/search/copy";

const initialState: AuthActionState = {};

export function AuthForm({
  initialMode,
  locale,
  redirectTo,
}: {
  initialMode: "login" | "register";
  locale: Locale;
  redirectTo: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [loginState, loginAction, loginPending] = useActionState(signInAction, initialState);
  const [registerState, registerAction, registerPending] = useActionState(signUpAction, initialState);
  const state = mode === "login" ? loginState : registerState;
  const pending = mode === "login" ? loginPending : registerPending;
  const en = locale === "en";

  return (
    <div className="w-full max-w-md rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_22px_70px_rgba(26,35,29,0.10)] sm:p-8">
      <div className="flex rounded-xl bg-surface-muted p-1" role="tablist">
        {(["login", "register"] as const).map((value) => (
          <button
            aria-selected={mode === value}
            className={`h-10 flex-1 rounded-lg text-sm font-semibold transition ${
              mode === value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
            key={value}
            onClick={() => setMode(value)}
            role="tab"
            type="button"
          >
            {value === "login" ? (en ? "Sign in" : "Logga in") : en ? "Create account" : "Skapa konto"}
          </button>
        ))}
      </div>

      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
          {en ? "Your Carnalys account" : "Ditt Carnalys-konto"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
          {mode === "login"
            ? en ? "Welcome back" : "Välkommen tillbaka"
            : en ? "Keep your car search" : "Spara din bilsökning"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {mode === "login"
            ? en ? "Sign in with your username and password." : "Logga in med användarnamn och lösenord."
            : en ? "No email needed. Your saved cars, searches and settings stay with this account." : "Ingen e-post behövs. Sparade bilar, sökningar och inställningar följer kontot."}
        </p>
      </div>

      <form action={mode === "login" ? loginAction : registerAction} className="mt-7 space-y-5">
        <input name="redirectTo" type="hidden" value={redirectTo} />
        <input name="locale" type="hidden" value={locale} />
        <label className="block">
          <span className="text-sm font-semibold text-ink">{en ? "Username" : "Användarnamn"}</span>
          <input
            autoCapitalize="none"
            autoComplete="username"
            className="mt-2 h-12 w-full rounded-xl border border-border bg-surface-subtle px-4 text-base text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent focus:ring-3 focus:ring-accent-soft"
            maxLength={24}
            minLength={3}
            name="username"
            placeholder={en ? "e.g. erik_cars" : "t.ex. erik_bilar"}
            required
          />
          {state.fieldErrors?.username ? <span className="mt-1.5 block text-xs text-negative">{state.fieldErrors.username}</span> : null}
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink">{en ? "Password" : "Lösenord"}</span>
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-2 h-12 w-full rounded-xl border border-border bg-surface-subtle px-4 text-base text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent focus:ring-3 focus:ring-accent-soft"
            maxLength={128}
            minLength={8}
            name="password"
            required
            type="password"
          />
          {state.fieldErrors?.password ? <span className="mt-1.5 block text-xs text-negative">{state.fieldErrors.password}</span> : null}
        </label>
        {mode === "register" ? (
          <div className="rounded-xl border border-border bg-surface-subtle p-4">
            <p className="text-sm font-semibold text-ink">
              {en ? "Insurance profile (optional)" : "Försäkringsprofil (valfritt)"}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {en
                ? "Used only to simulate insurance cost closer to a realistic value for you. Never shared, no personal identifiers."
                : "Används bara för att simulera försäkringskostnaden närmare ett realistiskt värde för dig. Delas aldrig, inga personuppgifter."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-ink">
                {en ? "Age band" : "Åldersgrupp"}
                <select
                  className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft"
                  defaultValue=""
                  name="insuranceAgeBand"
                >
                  <option value="">{en ? "Not set" : "Ej angivet"}</option>
                  {["18-24", "25-29", "30-39", "40-49", "50-64", "65+"].map((band) => (
                    <option key={band} value={band}>
                      {band}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-ink">
                {en ? "Licence years" : "År med körkort"}
                <input
                  className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent focus:ring-3 focus:ring-accent-soft"
                  min={0}
                  name="insuranceLicenceYears"
                  type="number"
                />
              </label>
              <label className="block text-xs font-semibold text-ink">
                {en ? "City" : "Stad"}
                <input
                  className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent focus:ring-3 focus:ring-accent-soft"
                  name="insuranceRegion"
                  placeholder={en ? "e.g. Stockholm" : "t.ex. Stockholm"}
                />
              </label>
            </div>
          </div>
        ) : null}
        {state.error ? (
          <p className="rounded-xl border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative" role="alert">{state.error}</p>
        ) : null}
        <button
          className="h-12 w-full rounded-xl bg-ink px-5 text-sm font-semibold text-surface shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending
            ? en ? "One moment…" : "Ett ögonblick…"
            : mode === "login"
              ? en ? "Sign in" : "Logga in"
              : en ? "Create account" : "Skapa konto"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs leading-5 text-ink-subtle">
        {en ? "This simple account uses only a username and password." : "Detta enkla konto använder bara användarnamn och lösenord."}
      </p>
      <Link className="mt-4 block text-center text-sm font-medium text-ink-muted hover:text-ink" href="/">
        ← {en ? "Back to cars" : "Tillbaka till bilar"}
      </Link>
    </div>
  );
}
