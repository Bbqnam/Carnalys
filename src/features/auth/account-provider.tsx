"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { importGuestFavoritesAction, setFavoriteAction } from "./actions";
import type { AccountUser } from "./session";
import { setStoredTheme } from "@/features/search/theme";
import { setStoredViewMode } from "@/features/search/use-view-mode";

const favoriteStorageKey = "carnalys:favorites:v1";

function readGuestFavorites() {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(favoriteStorageKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

interface AccountContextValue {
  user: AccountUser | null;
  favorites: Set<string>;
  toggleFavorite: (listingId: string) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({
  children,
  initialUser,
  initialFavoriteIds,
}: {
  children: React.ReactNode;
  initialUser: AccountUser | null;
  initialFavoriteIds: readonly string[];
}) {
  const [favorites, setFavorites] = useState(() => new Set(initialFavoriteIds));

  useEffect(() => {
    if (!initialUser) {
      const timer = window.setTimeout(() => setFavorites(new Set(readGuestFavorites())), 0);
      return () => window.clearTimeout(timer);
    }

    setStoredTheme(initialUser.theme);
    setStoredViewMode(initialUser.viewMode);

    const guestIds = readGuestFavorites();
    if (!guestIds.length) return;
    void importGuestFavoritesAction(guestIds).then(() => {
      setFavorites((current) => new Set([...current, ...guestIds]));
      window.localStorage.removeItem(favoriteStorageKey);
    });
  }, [initialUser]);

  const toggleFavorite = useCallback(
    (listingId: string) => {
      const next = new Set(favorites);
      const saved = !next.has(listingId);
      if (saved) next.add(listingId);
      else next.delete(listingId);
      setFavorites(next);
      if (!initialUser) {
        try {
          window.localStorage.setItem(favoriteStorageKey, JSON.stringify([...next]));
        } catch {
          // The choice still applies for this page if storage is unavailable.
        }
      }
      if (initialUser) void setFavoriteAction(listingId, saved);
    },
    [favorites, initialUser],
  );

  const value = useMemo(
    () => ({ user: initialUser, favorites, toggleFavorite }),
    [favorites, initialUser, toggleFavorite],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount must be used inside AccountProvider");
  return account;
}
