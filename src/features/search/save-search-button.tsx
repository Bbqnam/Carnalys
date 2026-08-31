"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useAccount } from "@/features/auth/account-provider";
import { saveSearchAction, type SavedSearchActionState } from "@/features/auth/actions";
import { BookmarkIcon, CloseIcon } from "./icons";
import type { Locale } from "./copy";

const initialState: SavedSearchActionState = {};

export function SaveSearchButton({ locale, nameSuggestion, url }: { locale: Locale; nameSuggestion: string; url: string }) {
  const { user } = useAccount();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveSearchAction, initialState);
  const containerRef = useRef<HTMLDivElement>(null);
  const en = locale === "en";

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  if (!user) {
    const params = new URLSearchParams({ redirectTo: url });
    return (
      <Link className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-sm transition hover:border-border-strong hover:shadow-md" href={`/login?${params}`}>
        <BookmarkIcon className="size-4" />
        <span className="hidden sm:inline">{en ? "Save search" : "Spara sökning"}</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-sm transition hover:border-border-strong hover:shadow-md" onClick={() => setOpen((value) => !value)} type="button">
        <BookmarkIcon className="size-4" />
        <span className="hidden sm:inline">{state.success ? (en ? "Saved" : "Sparad") : en ? "Save search" : "Spara sökning"}</span>
      </button>
      {open ? (
        <form action={action} className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-72 rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_48px_rgba(26,35,29,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{en ? "Save this search" : "Spara sökningen"}</p>
            <button aria-label={en ? "Close" : "Stäng"} className="text-ink-subtle hover:text-ink" onClick={() => setOpen(false)} type="button"><CloseIcon className="size-4" /></button>
          </div>
          <input name="url" type="hidden" value={url} />
          <input autoFocus className="mt-3 h-10 w-full rounded-xl border border-border bg-surface-subtle px-3 text-sm text-ink outline-none focus:border-accent" defaultValue={nameSuggestion} maxLength={50} name="name" required />
          {state.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
          <button className="mt-3 h-10 w-full rounded-xl bg-ink text-sm font-semibold text-surface disabled:opacity-60" disabled={pending} type="submit">
            {pending ? (en ? "Saving…" : "Sparar…") : en ? "Save" : "Spara"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
