import { cookies } from "next/headers";
import { connection } from "next/server";
import { SearchExperience } from "@/features/search/search-experience";
import { defaultLocale, isLocale, localeCookieName } from "@/features/search/locale";
import {
  parseVehicleSearchOptions,
  type SearchParameters,
} from "@/features/search/search-state";
import { getActiveVehicleListings } from "@/infrastructure/database/vehicle-listing-repository";
import { getActiveSynchronization } from "@/infrastructure/database/synchronization-state-repository";
import { getCurrentUser } from "@/features/auth/session";

interface HomeProps {
  searchParams: Promise<SearchParameters>;
}

// The "Update listings" server action lives on this route and walks every
// registered source incrementally; give it the same headroom as the cron
// routes (platforms that cap lower still cut it off at their own limit).
export const maxDuration = 300;

export default async function Home({ searchParams }: HomeProps) {
  await connection();
  const search = parseVehicleSearchOptions(await searchParams);
  // License plate search is an admin tool: a non-admin can craft ?plate=...
  // by hand, so the field is dropped here, server-side, rather than trusted
  // from the URL — hiding the input from everyone else is not enough on its own.
  const user = await getCurrentUser();
  if (!user?.isAdmin) search.filters.licensePlate = "";
  const localeCookie = (await cookies()).get(localeCookieName)?.value;
  const [catalog, activeSynchronization] = await Promise.all([
    getActiveVehicleListings(search),
    getActiveSynchronization("blocket_unofficial"),
  ]);

  return (
    <SearchExperience
      availableFilters={catalog.availableFilters}
      initialLocale={isLocale(localeCookie) ? localeCookie : defaultLocale}
      initialFilters={search.filters}
      initialSort={search.sort}
      lastSynchronizedAt={catalog.lastSynchronizedAt}
      listings={catalog.listings}
      pagination={catalog.pagination}
      activeSynchronization={activeSynchronization}
    />
  );
}
