"use client";

import { MoonIcon, SunIcon } from "./icons";
import { useTheme } from "./use-theme";
import type { Theme } from "./theme";

interface ThemeToggleProps {
  ariaLabel: string;
  lightLabel: string;
  darkLabel: string;
  className?: string;
}

export function ThemeToggle({ ariaLabel, lightLabel, darkLabel, className = "" }: ThemeToggleProps) {
  const [theme, setTheme] = useTheme();

  const options: { value: Theme; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: lightLabel, icon: SunIcon },
    { value: "dark", label: darkLabel, icon: MoonIcon },
  ];

  return (
    <div
      aria-label={ariaLabel}
      className={`flex rounded-full border border-border bg-surface/65 p-0.5 shadow-sm backdrop-blur ${className}`}
      role="group"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          aria-label={label}
          aria-pressed={theme === value}
          className={`grid size-8 place-items-center rounded-full transition ${
            theme === value
              ? "bg-ink text-surface shadow-sm"
              : "text-ink-subtle hover:text-ink"
          }`}
          key={value}
          onClick={() => setTheme(value)}
          type="button"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
