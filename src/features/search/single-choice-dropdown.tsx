"use client";

import {
  type KeyboardEvent,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "./icons";

export interface SingleChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface SingleChoiceDropdownProps<T extends string> {
  value: T;
  options: readonly SingleChoiceOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  inlineLabel?: string;
  inlineLabelClassName?: string;
  disabled?: boolean;
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const menuHeight = 320;

export function SingleChoiceDropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  inlineLabel,
  inlineLabelClassName = "hidden text-xs font-medium text-ink-subtle sm:inline",
  disabled = false,
  className = "",
}: SingleChoiceDropdownProps<T>) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? value,
    [options, value],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const width = Math.max(rect.width, 200);
    const viewportLeft = Math.min(
      Math.max(viewportPadding, rect.right - width),
      window.innerWidth - width - viewportPadding,
    );
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const availableAbove = rect.top - viewportPadding - gap;
    const openAbove = availableBelow < 200 && availableAbove > availableBelow;
    const maxHeight = Math.max(140, Math.min(menuHeight, openAbove ? availableAbove : availableBelow));
    const viewportTop = openAbove ? rect.top - maxHeight - gap : rect.bottom + gap;

    setPosition({ top: viewportTop, left: viewportLeft, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    const handleReposition = () => updatePosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, updatePosition]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
  };

  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (nextValue: T) => {
    onChange(nextValue);
    closeMenu(true);
  };

  const focusOption = (index: number) => {
    if (options.length === 0) return;
    const boundedIndex = (index + options.length) % options.length;
    optionRefs.current[boundedIndex]?.focus();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="relative flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-surface pl-3.5 pr-3 text-left shadow-sm transition hover:border-border-strong hover:shadow-md focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openMenu();
            requestAnimationFrame(() => focusOption(event.key === "ArrowDown" ? 0 : -1));
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            closeMenu();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {inlineLabel ? <span className={`shrink-0 ${inlineLabelClassName}`}>{inlineLabel}:</span> : null}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {selectedLabel}
        </span>
        <ChevronDownIcon
          className={`pointer-events-none size-4 shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && position
        ? createPortal(
            <div
              className="fixed z-[100] overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-[0_18px_50px_rgba(20,30,24,0.18)]"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu(true);
                }
              }}
              ref={menuRef}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              <div
                className="flex max-h-full flex-col overflow-y-auto overscroll-contain"
                id={listboxId}
                role="listbox"
              >
                {options.map((option, index) => {
                  const selected = option.value === value;
                  return (
                    <button
                      aria-selected={selected}
                      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                        selected
                          ? "bg-accent-soft font-semibold text-accent-strong"
                          : "text-ink-muted hover:bg-surface-muted"
                      }`}
                      key={option.value}
                      onClick={() => selectOption(option.value)}
                      onKeyDown={(event) => handleOptionKeyDown(event, index)}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      role="option"
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid size-4 shrink-0 place-items-center ${selected ? "text-accent-strong" : "text-transparent"}`}
                      >
                        <CheckIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
