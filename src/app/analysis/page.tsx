import { cookies } from "next/headers";
import { AnalysisExperience } from "@/features/market-analysis/analysis-experience";
import { parseAnalysisFilters } from "@/features/market-analysis/analysis-state";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
} from "@/features/search/locale";
import type { SearchParameters } from "@/features/search/search-state";
import { getPreparedCatalogFilters } from "@/infrastructure/database/catalog-facet-repository";
import { getCachedMarketAnalysis } from "@/infrastructure/database/market-analysis-repository";

// The unfiltered analysis rebuild runs several large PostgreSQL aggregates in
// parallel and can take tens of seconds after the cache is invalidated.
export const maxDuration = 60;

export const metadata = {
  title: "Market analysis · Carnalys",
  description:
    "See which version of a car gives the best value and when the Swedish used-car market favours buyers, from live listing data.",
};

interface AnalysisPageProps {
  searchParams: Promise<SearchParameters>;
}

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const filters = parseAnalysisFilters(await searchParams);
  const localeCookie = (await cookies()).get(localeCookieName)?.value;

  // Load the small facet set first. Starting it alongside the eight market
  // aggregates can leave facet queries waiting on the shared eight-connection
  // pool long enough to hit pg's five-second connection checkout timeout.
  const catalog = await getPreparedCatalogFilters(filters.brands);
  const analysis = await getCachedMarketAnalysis(filters);

  return (
    <AnalysisExperience
      analysis={analysis}
      available={catalog.filters}
      initialLocale={isLocale(localeCookie) ? localeCookie : defaultLocale}
      lastSynchronizedAt={catalog.lastSynchronizedAt}
    />
  );
}
