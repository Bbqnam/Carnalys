"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAccount } from "@/features/auth/account-provider";
import type { Locale } from "@/features/search/copy";
import { useAnalystChat, type ThreadMessage } from "./analyst-chat-provider";
import type { AnalystEvidence, AnalystListingPreview } from "./types";

function AnalystMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" fill="currentColor" />
    </svg>
  );
}

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m5 12 14-7-5.5 14-2.1-5.4L5 12Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m11.4 13.6 3.3-3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function StopIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect height="9" rx="2" stroke="currentColor" strokeWidth="1.8" width="9" x="7.5" y="7.5" />
    </svg>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CarGlyph({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M4 13.5 5.6 8A2 2 0 0 1 7.5 6.5h9A2 2 0 0 1 18.4 8L20 13.5m-16 0h16m-16 0v4h2.5v-2h11v2H20v-4M7 16.5h.01M17 16.5h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function suggestions(surface: "listing" | "search" | "comparison", locale: Locale) {
  const en = {
    listing: ["Does this car look OK?", "Is the asking price fair?", "What are the risks here?", "Show cheaper alternatives"],
    search: ["Best value right now", "Automatic estate under 180,000 SEK", "Reliable commuter, low running cost"],
    comparison: ["Which is the best buy?", "Which is cheapest to own?", "Which has the strongest resale?"],
  } as const;
  const sv = {
    listing: ["Ser den här bilen bra ut?", "Är priset rimligt?", "Vilka är riskerna?", "Visa billigare alternativ"],
    search: ["Bäst värde just nu", "Automatkombi under 180 000 kr", "Pålitlig pendlarbil, låg ägandekostnad"],
    comparison: ["Vilken är bästa köpet?", "Vilken är billigast att äga?", "Vilken håller värdet bäst?"],
  } as const;
  return (locale === "sv" ? sv : en)[surface];
}

function citedIds(text: string) {
  const ids = new Set<string>();
  for (const match of text.matchAll(/\[(E\d+)\]/g)) ids.add(match[1]);
  return ids;
}

// The analyst writes for people, not for the citation scheme: strip any
// Markdown it slips in, and remove the [E1] evidence markers entirely — the
// car cards below the message are the visible reference.
function cleanText(text: string) {
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\n)[ \t]*#{1,6}[ \t]+/g, "$1")
    .replace(/(^|\n)[ \t]*[*-][ \t]+/g, "$1• ")
    .replace(/ ?\[E\d+\]/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
}

function Answer({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-6 text-ink">
      {cleanText(text)}
      {streaming ? <span aria-hidden="true" className="ml-1 inline-block h-[1em] w-px animate-pulse bg-accent align-[-0.15em]" /> : null}
    </div>
  );
}

const SEK = { format: (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr` };

function fuelLabel(fuel: string, locale: Locale) {
  const sv: Record<string, string> = { petrol: "Bensin", diesel: "Diesel", electric: "El", plug_in_hybrid: "Laddhybrid", self_charging_hybrid: "Hybrid", ethanol: "Etanol", hydrogen: "Vätgas" };
  const en: Record<string, string> = { petrol: "Petrol", diesel: "Diesel", electric: "Electric", plug_in_hybrid: "Plug-in hybrid", self_charging_hybrid: "Hybrid", ethanol: "Ethanol", hydrogen: "Hydrogen" };
  return (locale === "sv" ? sv : en)[fuel] ?? fuel;
}

function transmissionLabel(transmission: string, locale: Locale) {
  if (transmission === "automatic") return locale === "sv" ? "Automat" : "Automatic";
  if (transmission === "manual") return locale === "sv" ? "Manuell" : "Manual";
  return transmission;
}

function DealScorePill({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-accent-soft text-accent-strong" : score >= 65 ? "bg-surface-muted text-ink-muted" : "bg-negative-soft text-negative";
  return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tone}`}>{score}</span>;
}

function ListingCard({ preview, href, index, locale }: { preview: AnalystListingPreview; href: string; index?: number; locale: Locale }) {
  const mil = Math.round(preview.mileageKm / 10).toLocaleString("sv-SE");
  const specs = [`${mil} mil`, fuelLabel(preview.fuelType, locale), transmissionLabel(preview.transmission, locale)];
  const delta = preview.marketValueAmount && preview.marketValueAmount > 0
    ? Math.round(((preview.priceAmount - preview.marketValueAmount) / preview.marketValueAmount) * 100)
    : null;
  return (
    <Link className="group flex gap-3 rounded-2xl border border-border bg-surface p-2.5 transition hover:border-border-strong hover:shadow-[0_10px_30px_rgba(26,35,29,0.10)]" href={href}>
      <div className="relative size-[4.25rem] shrink-0 overflow-hidden rounded-xl bg-surface-muted">
        {preview.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
            referrerPolicy="no-referrer"
            src={preview.imageUrl}
          />
        ) : null}
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-ink-subtle"><CarGlyph className="size-6" /></span>
        {index ? <span className="absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-ink text-[10px] font-bold text-surface">{index}</span> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-semibold text-ink">
            {preview.modelYear} {preview.name}{preview.variant ? ` ${preview.variant}` : ""}
          </p>
          {preview.dealScore != null ? <DealScorePill score={preview.dealScore} /> : null}
        </div>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-ink">{SEK.format(preview.priceAmount)}</span>
          {delta != null && Math.abs(delta) >= 2 ? (
            <span className={`text-[11px] font-medium tabular-nums ${delta < 0 ? "text-positive" : "text-ink-subtle"}`}>
              {delta < 0 ? "" : "+"}{delta}% {locale === "sv" ? "mot marknad" : "vs market"}
            </span>
          ) : null}
        </p>
        <p className="mt-1 truncate text-[11px] text-ink-muted">{specs.join(" · ")}</p>
        {preview.monthlyCostAmount ? (
          <p className="mt-0.5 text-[11px] text-ink-subtle">
            ≈ {SEK.format(preview.monthlyCostAmount)}/{locale === "sv" ? "mån drift" : "mo to run"}
          </p>
        ) : null}
      </div>
      <ArrowIcon className="mt-0.5 size-4 shrink-0 self-center text-ink-subtle transition group-hover:translate-x-0.5 group-hover:text-accent-strong" />
    </Link>
  );
}

function ListingCards({ items, locale }: { items: readonly AnalystEvidence[]; locale: Locale }) {
  const multiple = items.length > 1;
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <ListingCard href={item.href ?? "#"} index={multiple ? index + 1 : undefined} key={item.id} locale={locale} preview={item.listing!} />
      ))}
    </div>
  );
}

function Row({ message, locale }: { message: ThreadMessage; locale: Locale }) {
  if (message.role === "user") {
    return (
      <div className="rise-in flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13px] leading-5 text-surface">{message.content}</p>
      </div>
    );
  }

  const thinking = message.status || (locale === "sv" ? "Analyserar…" : "Analysing…");
  const cited = citedIds(message.content);
  const cards = message.state === "complete"
    ? message.evidence.filter((item) => item.listing && item.href && cited.has(item.id)).slice(0, 4)
    : [];
  return (
    <div className="rise-in flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong"><AnalystMark className="size-4" /></span>
      <div className="min-w-0 flex-1 space-y-3">
        {message.content ? (
          <Answer streaming={message.state === "streaming"} text={message.content} />
        ) : message.state === "streaming" ? (
          <div className="flex items-center gap-2 py-1 text-sm text-ink-muted">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1, 2].map((dot) => <span className="size-1.5 animate-pulse rounded-full bg-accent" key={dot} style={{ animationDelay: `${dot * 140}ms` }} />)}
            </span>
            {thinking}
          </div>
        ) : null}
        {message.state === "error" && message.error ? <p className="text-sm text-negative">{message.error}</p> : null}
        {cards.length ? <ListingCards items={cards} locale={locale} /> : null}
        {message.truncated ? (
          <p className="text-xs text-ink-subtle">{locale === "sv" ? "Snabbt svar — fråga vidare för fler detaljer." : "Quick take — ask a follow-up for more detail."}</p>
        ) : null}
      </div>
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AnalystPanel({ locale, onClose }: { locale: Locale; onClose?: () => void }) {
  const { user } = useAccount();
  const { messages, running, pageSurface, ask, stop, reset } = useAnalystChat();
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const active = messages.length > 0;
  const prompts = suggestions(pageSurface, locale);

  function submit() {
    const value = inputRef.current?.value ?? "";
    if (!value.trim() || running) return;
    ask(value);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
  }

  useEffect(() => {
    const element = threadRef.current;
    if (!element) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [messages]);

  return (
    <section aria-label="Ask Carnalys" className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-[0_24px_60px_rgba(26,35,29,0.18)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
          <AnalystMark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-ink">Ask Carnalys</h2>
          <p className="text-[11px] leading-4 text-ink-muted">
            {locale === "sv" ? "Verifierad marknadsdata, förklarad enkelt." : "Verified market data, explained clearly."}
          </p>
        </div>
        {active ? (
          <button
            className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            onClick={reset}
            type="button"
          >
            {locale === "sv" ? "Ny fråga" : "New chat"}
          </button>
        ) : null}
        {onClose ? (
          <button
            aria-label={locale === "sv" ? "Stäng" : "Close"}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <div aria-busy={running} aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" ref={threadRef}>
        {active ? (
          messages.map((message) => <Row key={message.id} locale={locale} message={message} />)
        ) : (
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm leading-6 text-ink-muted">
              {pageSurface === "listing"
                ? (locale === "sv"
                  ? "Fråga om den här bilen — pris mot marknaden, ägandekostnad, prishistorik och risker."
                  : "Ask about this car — price versus the market, ownership cost, price history, and risks.")
                : pageSurface === "comparison"
                  ? (locale === "sv"
                    ? "Fråga om bilarna du jämför — bästa köpet, ägandekostnad och andrahandsvärde."
                    : "Ask about the cars you're comparing — best buy, ownership cost, and resale.")
                  : (locale === "sv"
                    ? "Fråga om vilken bil som helst på Carnalys — pris mot marknaden, ägandekostnad och bäst värde just nu."
                    : "Ask about any car on Carnalys — price versus the market, ownership cost, and the best value right now.")}
            </p>
            <div className="flex flex-wrap gap-2">
              {prompts.map((prompt) => (
                <button
                  className="rounded-full bg-surface-muted px-3 py-1.5 text-[11px] font-medium text-ink-muted transition hover:bg-accent-soft hover:text-accent-strong disabled:opacity-50"
                  disabled={running || !user}
                  key={prompt}
                  onClick={() => ask(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!user ? (
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-4 py-3">
          <p className="text-xs leading-5 text-ink-muted">{locale === "sv" ? "Logga in för att fråga om bilarna." : "Sign in to ask about the cars."}</p>
          <Link className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-ink px-4 text-xs font-semibold text-surface transition hover:opacity-90 active:scale-[0.98]" href="/login">{locale === "sv" ? "Logga in" : "Sign in"}</Link>
        </div>
      ) : (
        <form className="shrink-0 border-t border-border px-3 py-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="flex items-end gap-1.5 rounded-[1.1rem] border border-border-strong bg-background p-1 shadow-sm transition duration-200 focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
            <label className="sr-only" htmlFor="analyst-chat-input">{locale === "sv" ? "Fråga Carnalys" : "Ask Carnalys"}</label>
            <textarea
              className="max-h-[132px] min-h-9 min-w-0 flex-1 resize-none bg-transparent px-3 py-1.5 text-sm leading-6 text-ink outline-none placeholder:text-ink-subtle"
              disabled={running}
              id="analyst-chat-input"
              maxLength={600}
              onInput={(event) => {
                const element = event.currentTarget;
                element.style.height = "auto";
                element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={active
                ? (locale === "sv" ? "Ställ en följdfråga…" : "Ask a follow-up…")
                : (locale === "sv" ? "Fråga om bilen eller marknaden…" : "Ask about the car or market…")}
              ref={inputRef}
              rows={1}
            />
            {running ? (
              <button aria-label={locale === "sv" ? "Avbryt analys" : "Cancel analysis"} className="mb-px grid size-10 shrink-0 place-items-center rounded-[0.9rem] border border-border bg-surface text-ink transition hover:bg-surface-muted" onClick={stop} type="button"><StopIcon className="size-4" /></button>
            ) : (
              <button aria-label={locale === "sv" ? "Analysera" : "Analyse"} className="mb-px grid size-10 shrink-0 place-items-center rounded-[0.9rem] bg-ink text-surface transition duration-200 hover:opacity-90 active:scale-95" type="submit"><SendIcon className="size-[18px]" /></button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
