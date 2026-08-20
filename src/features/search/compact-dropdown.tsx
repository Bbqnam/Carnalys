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

export interface CompactDropdownOption {
  value: string;
  label: string;
}

interface CompactDropdownProps {
  label: string;
  value: string;
  options: readonly CompactDropdownOption[];
  onChange: (value: string) => void;
  renderIcon: (value: string) => ReactNode;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsLabel: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function CompactDropdown({
  label,
  value,
  options,
  onChange,
  renderIcon,
  disabled = false,
  searchable = false,
  searchPlaceholder,
  noResultsLabel,
}: CompactDropdownProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sv-SE");
    if (!normalizedQuery) return options;

    return options.filter((option) =>
      option.label.toLocaleLowerCase("sv-SE").includes(normalizedQuery),
    );
  }, [options, query]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const desiredWidth = Math.max(rect.width, searchable ? 224 : rect.width);
    const width = Math.min(desiredWidth, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );
    const top = rect.bottom + 6;

    setPosition({
      top,
      left,
      width,
      maxHeight: Math.max(48, Math.min(260, window.innerHeight - top - viewportPadding)),
    });
  }, [searchable]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, updatePosition]);

  const openMenu = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  };

  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (option: CompactDropdownOption) => {
    onChange(option.value);
    closeMenu(true);
  };

  const focusOption = (index: number) => {
    if (filteredOptions.length === 0) return;
    const boundedIndex = (index + filteredOptions.length) % filteredOptions.length;
    optionRefs.current[boundedIndex]?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        requestAnimationFrame(() => {
          const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
          focusOption(selectedIndex >= 0 ? selectedIndex : 0);
        });
      } else {
        focusOption(event.key === "ArrowDown" ? 0 : filteredOptions.length - 1);
      }
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu();
    }
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
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[#edf3ef] text-[#4f705d]">
          {renderIcon(selectedOption?.value ?? "")}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#26332b]">
          {selectedOption?.label}
        </span>
        <ChevronDownIcon
          className={`pointer-events-none size-3 shrink-0 text-[#78847d] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && position
        ? createPortal(
            <div
              className="fixed z-[100] overflow-hidden rounded-xl border border-[#d9ddd7] bg-white p-1.5 shadow-[0_18px_50px_rgba(20,30,24,0.18)]"
              ref={menuRef}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              {searchable ? (
                <label className="mb-1 flex h-9 items-center gap-2 rounded-lg bg-[#f5f7f4] px-2.5 text-[#6b756e] focus-within:ring-2 focus-within:ring-[#708b79]/25">
                  <SearchIcon className="size-3.5 shrink-0" />
                  <input
                    aria-label={searchPlaceholder}
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#26332b] outline-none placeholder:text-[#929a95]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={searchPlaceholder}
                    value={query}
                  />
                </label>
              ) : null}
              <div
                className="overflow-y-auto overscroll-contain"
                id={listboxId}
                role="listbox"
                style={{ maxHeight: Math.max(42, position.maxHeight - (searchable ? 51 : 8)) }}
              >
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => (
                    <button
                      aria-selected={option.value === value}
                      className={`flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#708b79] ${
                        option.value === value
                          ? "bg-[#eaf2ed] font-semibold text-[#214b36]"
                          : "text-[#354139] hover:bg-[#f4f6f3]"
                      }`}
                      key={option.value}
                      onClick={() => selectOption(option)}
                      onKeyDown={(event) => handleOptionKeyDown(event, index)}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white text-[#4f705d] ring-1 ring-[#e3e7e2]">
                        {renderIcon(option.value)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.value === value ? (
                        <CheckIcon className="size-3.5 shrink-0" />
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-5 text-center text-xs text-[#7b847e]">
                    {noResultsLabel}
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
