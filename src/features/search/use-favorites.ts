"use client";

import { useAccount } from "@/features/auth/account-provider";

export function useFavorites() {
  const { favorites, toggleFavorite } = useAccount();
  return { favorites, toggle: toggleFavorite };
}
