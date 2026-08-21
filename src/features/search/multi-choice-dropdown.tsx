"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./icons";

export interface MultiChoiceOption {
  value: string;
  label: string;
  count?: number;
}

interface MultiChoiceDropdownProps {
  label: string;
  values: readonly string[];
  options: readonly MultiChoiceOption[];
  placeholder: string;
  selectedCountLabel: (count: number) => string;
  clearLabel: string;
  doneLabel: string;
  noResultsLabel: string;
  onChange: (values: readonly string[]) => void;
  renderIcon?: (value: string) => ReactNode;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  menuHeight?: number;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function MultiChoiceDropdown({
  label,
  values,
  options,
  placeholder,
  selectedCountLabel,
  clearLabel,
  doneLabel,
  noResultsLabel,
  onChange,
  renderIcon,
  disabled = false,
  searchable = false,
  searchPlaceholder,
  menuHeight = 360,
}: MultiChoiceDropdownProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openMenuHeightRef = useRef<number>(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedValues = useMemo(() => new Set(values), [values]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sv-SE");
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase("sv-SE").includes(normalizedQuery),
    );
  }, [options, query]);

  const selectedLabel = useMemo(() => {
    if (values.length === 0) return placeholder;
    if (values.length > 1) return selectedCountLabel(values.length);
    return options.find((option) => option.value === values[0])?.label ?? values[0];
  }, [options, placeholder, selectedCountLabel, values]);

  const updatePosition = useCallback((preserveOpenHeight = false) => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const desiredHeight = menuHeight;
    const width = Math.min(
      Math.max(rect.width, 280),
      window.innerWidth - viewportPadding * 2,
    );
    const viewportLeft = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const availableAbove = rect.top - viewportPadding - gap;
    const openAbove = availableBelow < 220 && availableAbove > availableBelow;
    const availableHeight = Math.max(
      140,
      Math.min(desiredHeight, openAbove ? availableAbove : availableBelow),
    );
    const maxHeight = preserveOpenHeight && openMenuHeightRef.current
      ? openMenuHeightRef.current
      : availableHeight;
    if (!preserveOpenHeight) openMenuHeightRef.current = maxHeight;
    const viewportTop = openAbove ? rect.top - maxHeight - gap : rect.bottom + gap;

    setPosition({
      top: viewportTop,
      left: viewportLeft,
      width,
      maxHeight,
    });
  }, [menuHeight]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition(true);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, updatePosition]);

  const openMenu = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
  };

  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const toggleOption = (value: string) => {
    onChange(
      selectedValues.has(value)
        ? values.filter((selectedValue) => selectedValue !== value)
        : [...values, value],
    );
  };

  const focusOption = (index: number) => {
    if (filteredOptions.length === 0) return;
    const boundedIndex = (index + filteredOptions.length) % filteredOptions.length;
    optionRefs.current[boundedIndex]?.focus();
  };

  const handleOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(filteredOptions.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    }
  };

  return (
    <div className="min-w-0">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.09em] text-[#737c76]">
        {label}
      </span>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="group flex h-10 w-full min-w-0 items-center gap-1 rounded-xl border border-[#dde0da] bg-white px-1.5 text-left shadow-[0_1px_2px_rgba(23,33,27,0.02)] transition duration-200 hover:border-[#aebdb2] hover:bg-[#f8faf7] focus-visible:border-[#708b79] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#708b79]/10 disabled:cursor-not-allowed disabled:opacity-45"
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
        {renderIcon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#edf3ef] text-[#4f705d]">
            {renderIcon(values[0] ?? "")}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#26332b]">
          {selectedLabel}
        </span>
        {values.length > 1 ? (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#254934] text-[10px] font-bold text-white">
            {values.length}
          </span>
        ) : null}
        <ChevronDownIcon
          className={`pointer-events-none size-3 shrink-0 text-[#78847d] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && position
        ? createPortal(
            <div
              className="fixed z-[100] flex overflow-hidden rounded-xl border border-[#d9ddd7] bg-white shadow-[0_18px_50px_rgba(20,30,24,0.18)]"
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
              <div className="flex min-h-0 w-full flex-col p-1.5">
                {searchable ? (
                  <label className="mb-1 flex h-10 shrink-0 items-center gap-2 rounded-lg bg-surface-muted px-2.5 text-[#6b756e] focus-within:ring-2 focus-within:ring-[#708b79]/25">
                    <SearchIcon className="size-3.5 shrink-0" />
                    <input
                      aria-label={searchPlaceholder}
                      className="min-w-0 flex-1 bg-transparent text-xs text-[#26332b] outline-none placeholder:text-[#929a95]"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={searchPlaceholder}
                      ref={searchRef}
                      value={query}
                    />
                  </label>
                ) : null}
                <div
                  aria-multiselectable="true"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                  id={listboxId}
                  role="listbox"
                >
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option, index) => {
                      const selected = selectedValues.has(option.value);
                      return (
                        <button
                          aria-selected={selected}
                          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#708b79] ${
                            selected
                              ? "bg-[#eaf2ed] font-semibold text-[#214b36]"
                              : "text-[#354139] hover:bg-[#f4f6f3]"
                          }`}
                          key={option.value}
                          onClick={() => toggleOption(option.value)}
                          onKeyDown={(event) => handleOptionKeyDown(event, index)}
                          ref={(node) => {
                            optionRefs.current[index] = node;
                          }}
                          role="option"
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className={`grid size-5 shrink-0 place-items-center rounded-[0.3rem] border ${
                              selected
                                ? "border-[#254934] bg-[#254934] text-white"
                                : "border-[#cbd1cc] bg-white text-transparent"
                            }`}
                          >
                            <CheckIcon className="size-3" />
                          </span>
                          {renderIcon ? (
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#4f705d] ring-1 ring-[#e3e7e2] shadow-[0_1px_2px_rgba(23,33,27,0.03)]">
                              {renderIcon(option.value)}
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {option.count !== undefined ? (
                            <span className="shrink-0 tabular-nums text-[11px] font-normal text-[#87908a]">
                              {option.count.toLocaleString("sv-SE")}
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-5 text-center text-xs text-[#7b847e]">
                      {noResultsLabel}
                    </p>
                  )}
                </div>
                <div className="mt-1 flex shrink-0 items-center justify-between border-t border-[#e8eae6] px-1.5 pt-1.5">
                  <button
                    className="rounded-lg px-2.5 py-2 text-xs font-semibold text-[#66736a] transition hover:bg-[#f2f4f1] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={values.length === 0}
                    onClick={() => onChange([])}
                    type="button"
                  >
                    {clearLabel}
                  </button>
                  <button
                    className="rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#2b3b32]"
                    onClick={() => closeMenu(true)}
                    type="button"
                  >
                    {doneLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
