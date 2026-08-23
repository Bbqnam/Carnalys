"use client";

import { useEffect, useId, useRef, useState } from "react";
import { InfoIcon } from "@/features/search/icons";

interface ModuleProps {
  icon: React.ReactNode;
  title: string;
  /**
   * The sentence that used to sit under every heading. It stays available, but
   * out of the reading path — on a page of nine modules, nine explanatory
   * paragraphs cost more scroll than they repay, and the reader who needs one
   * knows to ask.
   */
  explanation?: string;
  /** A single number or label the module can lead with, shown beside the title. */
  headline?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function InfoButton({ explanation }: { explanation: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={containerRef}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label={explanation}
        className="grid size-5 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-muted hover:text-ink"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <InfoIcon className="size-3.5" />
      </button>
      {open ? (
        <span
          className="absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-ink-muted shadow-[0_12px_32px_rgba(20,30,24,0.16)]"
          id={panelId}
          role="tooltip"
        >
          {explanation}
        </span>
      ) : null}
    </span>
  );
}

/**
 * One analysis module. Deliberately has no border, background or shadow: the
 * page gets its structure from the grid and a single rule above each module,
 * which reads as composition rather than as a wall of cards.
 */
export function Module({
  icon,
  title,
  explanation,
  headline,
  className = "",
  children,
}: ModuleProps) {
  return (
    <section className={`flex min-w-0 flex-col border-t border-border pt-4 ${className}`}>
      {/* Wraps rather than compressing: squeezing a headline in beside the
          title on a phone forced the title to break across three lines. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
          <span aria-hidden="true" className="text-ink-subtle">
            {icon}
          </span>
          {title}
          {explanation ? <InfoButton explanation={explanation} /> : null}
        </h2>
        {headline ? (
          <span className="text-[11px] tabular-nums text-ink-subtle">
            {headline}
          </span>
        ) : null}
      </div>
      {/* `min-h-0` lets a module whose content scrolls resolve against the row
          height the grid gives it, instead of growing the row to fit. */}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </section>
  );
}
