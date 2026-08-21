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

interface HomeProps {
  searchParams: Promise<SearchParameters>;
}

export default async function Home({ searchParams }: HomeProps) {
  await connection();
  const search = parseVehicleSearchOptions(await searchParams);
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
