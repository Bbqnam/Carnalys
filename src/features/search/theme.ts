export type Theme = "light" | "dark";

export const themeStorageKey = "carnalys-theme";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

/** Client-side only: persists the user's theme choice and applies it. */
export function applyTheme(theme: Theme | undefined) {
  const root = document.documentElement;
  if (theme) {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

export function setStoredTheme(theme: Theme | undefined) {
  try {
    if (theme) {
      window.localStorage.setItem(themeStorageKey, theme);
    } else {
      window.localStorage.removeItem(themeStorageKey);
    }
  } catch {
    // Theme still applies for this page load even if storage is unavailable.
  }
  applyTheme(theme);
}

export function readStoredTheme(): Theme | undefined {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return isTheme(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Inline, synchronous — must run before first paint to avoid a flash of
    the wrong theme. Kept as a plain string so it can be inlined in <head>
    rather than waiting on a hydrated React tree. */
export const themeInitScript = `
(function () {
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(themeStorageKey)});
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (error) {}
})();
`;
