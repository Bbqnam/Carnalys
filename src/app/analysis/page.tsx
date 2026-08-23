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

export const metadata = {
  title: "Market analysis · Carnalysis",
  description:
    "See which version of a car gives the best value and when the Swedish used-car market favours buyers, from live listing data.",
};

interface AnalysisPageProps {
  searchParams: Promise<SearchParameters>;
}

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const filters = parseAnalysisFilters(await searchParams);
  const localeCookie = (await cookies()).get(localeCookieName)?.value;

  const [analysis, catalog] = await Promise.all([
    getCachedMarketAnalysis(filters),
    getPreparedCatalogFilters(filters.brands),
  ]);

  return (
    <AnalysisExperience
      analysis={analysis}
      available={catalog.filters}
      initialLocale={isLocale(localeCookie) ? localeCookie : defaultLocale}
      lastSynchronizedAt={catalog.lastSynchronizedAt}
    />
  );
}
