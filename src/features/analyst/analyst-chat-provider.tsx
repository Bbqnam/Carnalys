"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { defaultSearchFilters } from "@/features/search/search-state";
import type { Locale } from "@/features/search/copy";
import { readLocaleCookie } from "@/features/search/locale";
import type { AnalystContext, AnalystConversationMessage, AnalystEvidence, AnalystStreamEvent } from "./types";

const storageKey = "carnalys:analyst:v1";

// Fallback when the current page has no specific car context (saved, settings,
// analysis…): ask against the whole active inventory.
const inventoryContext: AnalystContext = { surface: "search", filters: defaultSearchFilters };

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence: readonly AnalystEvidence[];
  status: string;
  state: "streaming" | "complete" | "error";
  error?: string;
  truncated?: boolean;
}

interface AnalystChatValue {
  messages: readonly ThreadMessage[];
  running: boolean;
  open: boolean;
  /** Surface of the page the user is currently on, for context-aware prompts. */
  pageSurface: AnalystContext["surface"];
  /** Human label for what the chat is currently looking at (e.g. a car name). */
  pageLabel: string | null;
  setPageContext: (context: AnalystContext | null, label?: string | null) => void;
  setOpen: (value: boolean) => void;
  toggle: () => void;
  ask: (text: string) => void;
  stop: () => void;
  reset: () => void;
}

const AnalystChatContext = createContext<AnalystChatValue | null>(null);

function sanitize(messages: readonly ThreadMessage[]): ThreadMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.content.trim().length > 0)
    .map((message) => (message.state === "streaming" ? { ...message, state: "complete" as const, status: "" } : message));
}

function readStored(): { messages: ThreadMessage[]; open: boolean } {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return { messages: [], open: false };
    const parsed = JSON.parse(raw) as { messages?: unknown; open?: unknown };
    const messages = Array.isArray(parsed.messages) ? sanitize(parsed.messages as ThreadMessage[]) : [];
    return { messages, open: parsed.open === true && messages.length > 0 };
  } catch {
    return { messages: [], open: false };
  }
}

const funStatuses = {
  sv: [
    "Vroom vroom…", "Startar motorn…", "Växlar upp…", "Rattar genom marknaden…",
    "Läser av mätarställningen…", "Kollar servicehäftet…", "Provkör siffrorna…",
    "Dammsuger annonserna…", "Räknar hästkrafter…", "Sparkar på däcken…", "Blocket-dyk pågår…",
  ],
  en: [
    "Vroom vroom…", "Starting the engine…", "Shifting up…", "Cruising the market…",
    "Reading the odometer…", "Checking the service book…", "Test-driving the numbers…",
    "Combing the listings…", "Counting horsepower…", "Kicking the tyres…", "Diving into the data…",
  ],
} as const;
let lastFunStatus = -1;
function funStatus(locale: Locale) {
  const pool = funStatuses[locale === "sv" ? "sv" : "en"];
  let index = Math.floor(Math.random() * pool.length);
  if (index === lastFunStatus) index = (index + 1) % pool.length;
  lastFunStatus = index;
  return pool[index];
}

// The line shown the instant the user sends, held until the first real answer
// token replaces it. On a specific car or a comparison the model can go quiet
// for ten or twenty seconds gathering evidence, so name what it's looking at;
// when the user is just browsing, a playful line is friendlier than echoing
// their half-formed query back at them.
function openingLine(context: AnalystContext, label: string | null, locale: Locale) {
  const sv = locale === "sv";
  if (context.surface === "listing") {
    return label
      ? (sv ? `Tittar på ${label}…` : `Looking at the ${label}…`)
      : (sv ? "Tittar på den här bilen…" : "Looking at this car…");
  }
  if (context.surface === "comparison") {
    return sv ? "Ställer bilarna mot varandra…" : "Lining up the cars you're comparing…";
  }
  return funStatus(locale);
}

function recentPairs(messages: readonly ThreadMessage[]): AnalystConversationMessage[] {
  const pairs: AnalystConversationMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const next = messages[index + 1];
    if (message.role === "user" && next && next.role === "assistant" && next.state === "complete" && next.content) {
      pairs.push({ role: "user", content: message.content }, { role: "assistant", content: next.content });
    }
  }
  return pairs.slice(-4);
}

export function AnalystChatProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pageSurface, setPageSurface] = useState<AnalystContext["surface"]>("search");
  const [pageLabel, setPageLabel] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<readonly ThreadMessage[]>([]);
  const pageContextRef = useRef<AnalystContext | null>(null);
  const pageLabelRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const localeRef = useRef<Locale>(initialLocale);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Pages register their own context (a listing, a comparison, the active
  // search) so a question inherits where the user is. Filters live only in the
  // ref, so typing a search filter does not re-render the whole app tree.
  const setPageContext = useCallback((context: AnalystContext | null, label?: string | null) => {
    pageContextRef.current = context;
    pageLabelRef.current = label ?? null;
    setPageSurface(context?.surface ?? "search");
    setPageLabel(label ?? null);
  }, []);

  useEffect(() => {
    // Deferred a tick so the first client render still matches the server
    // ("empty thread"), then the stored session is folded in.
    const timer = window.setTimeout(() => {
      const stored = readStored();
      setMessages(stored.messages);
      setOpen(stored.open);
      setHydrated(true);
      // Continue message ids past whatever was restored so a new turn can't
      // collide with a rehydrated one ("two children with the same key").
      const highest = Math.max(0, ...stored.messages.map((message) => Number.parseInt(message.id.replace(/\D/g, ""), 10) || 0));
      idRef.current = highest;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // Debounced so a streaming answer doesn't re-serialise the whole thread on
    // every token; the trailing write still captures the final state.
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ messages: sanitize(messages), open }));
      } catch {
        // A private-mode or storage-full failure just means this tab won't restore the thread.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [messages, open, hydrated]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setMessages([]);
    setRunning(false);
  }, []);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  const ask = useCallback((rawMessage: string) => {
    const trimmed = rawMessage.trim();
    if (!trimmed || controllerRef.current) return;
    const locale = readLocaleCookie() ?? localeRef.current;
    localeRef.current = locale;
    const controller = new AbortController();
    controllerRef.current = controller;
    const assistantId = `m${(idRef.current += 1)}`;
    const conversation = recentPairs(messagesRef.current);
    const context = pageContextRef.current ?? inventoryContext;
    // Shown immediately, held for the whole answer — the server's status pings
    // just keep it alive, they never re-roll it.
    const workingLine = openingLine(context, pageLabelRef.current, locale);

    setMessages((current) => [
      ...current,
      { id: `${assistantId}-u`, role: "user", content: trimmed, evidence: [], status: "", state: "complete" },
      { id: assistantId, role: "assistant", content: "", evidence: [], status: workingLine, state: "streaming" },
    ]);
    setRunning(true);

    const patch = (apply: (message: ThreadMessage) => ThreadMessage) =>
      setMessages((current) => current.map((message) => (message.id === assistantId ? apply(message) : message)));

    void (async () => {
      try {
        const response = await fetch("/api/analyst", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: trimmed, locale, context, conversation }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error ?? (locale === "sv" ? "Analysen kunde inte startas." : "The analysis could not start."));
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamed = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as AnalystStreamEvent;
            // `status` events are only a keep-alive now — the playful line was
            // picked once per question and stays put so it doesn't flicker.
            if (event.type === "delta" && event.delta) {
              streamed = event.replace ? event.delta : streamed + event.delta;
              patch((current) => ({ ...current, content: streamed }));
            }
            if (event.type === "final" && typeof event.answer === "string") {
              streamed = event.answer;
              patch((current) => ({ ...current, content: streamed }));
            }
            if (event.type === "evidence") {
              patch((current) => ({ ...current, evidence: [...(event.evidence ?? [])], truncated: event.truncated }));
            }
            if (event.type === "error") throw new Error(event.message ?? (locale === "sv" ? "Analysen misslyckades." : "Analysis failed."));
          }
        }
        patch((current) => ({ ...current, state: "complete", status: "" }));
      } catch (caught) {
        if (controller.signal.aborted) {
          patch((current) => current.content
            ? { ...current, state: "complete", status: "" }
            : { ...current, state: "error", status: "", error: locale === "sv" ? "Analysen avbröts." : "Analysis cancelled." });
        } else {
          const message = caught instanceof Error ? caught.message : (locale === "sv" ? "Analysen misslyckades." : "Analysis failed.");
          patch((current) => ({ ...current, state: "error", status: "", error: message }));
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setRunning(false);
      }
    })();
  }, []);

  const value = useMemo<AnalystChatValue>(
    () => ({ messages, running, open, pageSurface, pageLabel, setPageContext, setOpen, toggle, ask, stop, reset }),
    [messages, running, open, pageSurface, pageLabel, setPageContext, toggle, ask, stop, reset],
  );

  return <AnalystChatContext.Provider value={value}>{children}</AnalystChatContext.Provider>;
}

export function useAnalystChat() {
  const value = useContext(AnalystChatContext);
  if (!value) throw new Error("useAnalystChat must be used inside AnalystChatProvider");
  return value;
}

/**
 * Register the current page's analyst context (a listing, a comparison, the
 * active search). A question asked from that page inherits it; on unmount the
 * context reverts to the whole-inventory fallback.
 */
export function useAnalystPageContext(context: AnalystContext | null, label?: string | null) {
  const { setPageContext } = useAnalystChat();
  const contextRef = useRef(context);
  const labelRef = useRef(label ?? null);
  const key = `${context ? JSON.stringify(context) : ""}|${label ?? ""}`;

  useEffect(() => {
    contextRef.current = context;
    labelRef.current = label ?? null;
  }, [context, label]);

  useEffect(() => {
    setPageContext(contextRef.current, labelRef.current);
    return () => setPageContext(null);
  }, [key, setPageContext]);
}
