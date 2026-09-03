"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/features/search/copy";
import { readLocaleCookie } from "@/features/search/locale";
import { useAnalystChat } from "./analyst-chat-provider";
import { AnalystPanel } from "./analyst-panel";

function LauncherMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" fill="currentColor" />
    </svg>
  );
}

function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

const hiddenPrefixes = ["/login", "/admin"];

export function HeroAskButton({ locale }: { locale: Locale }) {
  const { setOpen } = useAnalystChat();
  return (
    <button
      className="group inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/90 py-2.5 pl-3 pr-4 text-sm font-medium text-ink shadow-sm backdrop-blur-md transition hover:border-accent/50 hover:shadow-md active:scale-[0.98]"
      onClick={() => setOpen(true)}
      type="button"
    >
      <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent-strong">
        <LauncherMark className="size-4" />
      </span>
      {locale === "sv" ? "Fråga Carnalys om vilken bil som helst" : "Ask Carnalys about any car"}
      <span aria-hidden="true" className="text-ink-subtle transition group-hover:translate-x-0.5 group-hover:text-accent-strong">→</span>
    </button>
  );
}

export function AnalystLauncher({ initialLocale }: { initialLocale: Locale }) {
  const pathname = usePathname();
  const { open, setOpen, toggle, messages } = useAnalystChat();
  const reduceMotion = useReducedMotion() ?? false;
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    const timer = window.setTimeout(() => setLocale(readLocaleCookie() ?? initialLocale), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, initialLocale]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;

  const hasThread = messages.length > 0;

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="fixed bottom-24 right-3 z-50 flex h-[min(34rem,calc(100dvh-7.5rem))] w-[calc(100vw-1.5rem)] flex-col sm:right-6 sm:w-[24rem]"
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <AnalystPanel locale={locale} onClose={() => setOpen(false)} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        aria-expanded={open}
        aria-label={open
          ? (locale === "sv" ? "Stäng Ask Carnalys" : "Close Ask Carnalys")
          : (locale === "sv" ? "Öppna Ask Carnalys" : "Open Ask Carnalys")}
        className="fixed bottom-4 right-3 z-50 grid size-14 place-items-center rounded-full bg-ink text-surface shadow-[0_14px_35px_rgba(26,35,29,0.35)] transition hover:opacity-90 active:scale-95 sm:right-6"
        onClick={toggle}
        type="button"
        whileTap={{ scale: reduceMotion ? 1 : 0.92 }}
      >
        {open ? <ChevronDown className="size-6" /> : <LauncherMark className="size-6" />}
        {!open && hasThread ? (
          <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-surface bg-accent" />
        ) : null}
      </motion.button>
    </>
  );
}
