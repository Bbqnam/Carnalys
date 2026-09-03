"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAccount } from "@/features/auth/account-provider";
import type { Locale } from "@/features/search/copy";
import { useAnalystChat, type ThreadMessage } from "./analyst-chat-provider";
import type { AnalystEvidence } from "./types";

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

// The analyst is told to write plain text, but models still slip in Markdown.
// Strip the common markers so they don't render as literal ** and # in the UI.
function stripMarkdown(text: string) {
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\n)[ \t]*#{1,6}[ \t]+/g, "$1")
    .replace(/(^|\n)[ \t]*[*-][ \t]+/g, "$1• ");
}

function EvidenceCitation({ id, evidence }: { id: string; evidence: readonly AnalystEvidence[] }) {
  const item = evidence.find((candidate) => candidate.id === id);
  if (!item) return null;
  return item.href ? (
    <Link className="mx-0.5 inline-flex rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent-strong hover:underline" href={item.href} title={item.label}>
      {id}
    </Link>
  ) : <span className="mx-0.5 inline-flex rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent-strong">{id}</span>;
}

function Answer({ text, evidence, streaming = false }: { text: string; evidence: readonly AnalystEvidence[]; streaming?: boolean }) {
  const parts = stripMarkdown(text).split(/(\[E\d+\])/g);
  return (
    <div className="whitespace-pre-wrap text-sm leading-6 text-ink">
      {parts.map((part, index) => {
        const match = /^\[(E\d+)\]$/.exec(part);
        return match
          ? <EvidenceCitation evidence={evidence} id={match[1]} key={`${part}-${index}`} />
          : <span key={index}>{part}</span>;
      })}
      {streaming ? <span aria-hidden="true" className="ml-1 inline-block h-[1em] w-px animate-pulse bg-accent align-[-0.15em]" /> : null}
    </div>
  );
}

function ListingCard({ item }: { item: AnalystEvidence }) {
  const [name, ...rest] = item.label.split(" · ");
  return (
    <Link
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong hover:bg-surface-subtle"
      href={item.href ?? "#"}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
        {rest.length ? <span className="mt-0.5 block truncate text-xs text-ink-muted">{rest.join(" · ")}</span> : null}
      </span>
      <span className="shrink-0 rounded-md bg-accent-soft p-1 text-accent-strong"><ArrowIcon className="size-3.5" /></span>
    </Link>
  );
}

function SourceList({ evidence, locale }: { evidence: readonly AnalystEvidence[]; locale: Locale }) {
  return (
    <details className="rounded-xl border border-border bg-surface-subtle px-3 py-2.5">
      <summary className="cursor-pointer text-xs font-semibold text-ink">{locale === "sv" ? `Källor (${evidence.length})` : `Sources (${evidence.length})`}</summary>
      <ul className="mt-3 grid gap-2">
        {evidence.map((item) => (
          <li className="text-xs leading-5 text-ink-muted" key={item.id}>
            <span className="font-bold text-accent-strong">{item.id}</span>{" "}
            {item.href ? <Link className="font-medium text-ink hover:underline" href={item.href}>{item.label}</Link> : <span className="font-medium text-ink">{item.label}</span>}
            {item.sampleSize !== undefined ? ` · n=${item.sampleSize}` : ""}
            {` · ${new Date(item.asOf).toLocaleString(locale === "sv" ? "sv-SE" : "en-SE", { dateStyle: "medium", timeStyle: "short" })}`}
            {item.warning ? <span className="block text-ink-subtle">{item.warning}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Row({ message, locale, reduceMotion }: { message: ThreadMessage; locale: Locale; reduceMotion: boolean }) {
  if (message.role === "user") {
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
        initial={{ opacity: 0, y: 4 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13px] leading-5 text-surface">{message.content}</p>
      </motion.div>
    );
  }

  const thinking = message.status || (locale === "sv" ? "Analyserar…" : "Analysing…");
  const cited = citedIds(message.content);
  const cards = message.state === "complete"
    ? message.evidence.filter((item) => item.href && (item.kind === "listing" || item.kind === "comparable") && cited.has(item.id))
    : [];
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5"
      initial={{ opacity: 0, y: 4 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong"><AnalystMark className="size-4" /></span>
      <div className="min-w-0 flex-1 space-y-3">
        {message.content ? (
          <Answer evidence={message.evidence} streaming={message.state === "streaming"} text={message.content} />
        ) : message.state === "streaming" ? (
          <div className="flex items-center gap-2 py-1 text-sm text-ink-muted">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1, 2].map((dot) => <span className="size-1.5 animate-pulse rounded-full bg-accent" key={dot} style={{ animationDelay: `${dot * 140}ms` }} />)}
            </span>
            {thinking}
          </div>
        ) : null}
        {message.state === "error" && message.error ? <p className="text-sm text-negative">{message.error}</p> : null}
        {cards.length ? (
          <div className="grid gap-2">
            {cards.map((item) => <ListingCard item={item} key={item.id} />)}
          </div>
        ) : null}
        {message.truncated ? (
          <p className="text-xs text-ink-subtle">{locale === "sv" ? "Snabbt svar — fråga vidare för fler detaljer." : "Quick take — ask a follow-up for more detail."}</p>
        ) : null}
        {message.evidence.length > 0 ? <SourceList evidence={message.evidence} locale={locale} /> : null}
      </div>
    </motion.div>
  );
}

export function AnalystPanel({ locale, onClose }: { locale: Locale; onClose?: () => void }) {
  const { user } = useAccount();
  const { messages, running, pageSurface, ask, stop, reset } = useAnalystChat();
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
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
    element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, reduceMotion]);

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
          messages.map((message) => <Row key={message.id} locale={locale} message={message} reduceMotion={reduceMotion} />)
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
