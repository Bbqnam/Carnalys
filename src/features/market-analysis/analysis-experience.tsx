"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { MarketAnalysis, MarketAnalysisFilters } from "@/domain/market/types";
import { setLocaleCookie } from "@/features/search/locale";
import type { Locale } from "@/features/search/copy";
import {
  CalendarIcon,
  DepreciationIcon,
  GridIcon,
  OptionsIcon,
  RegionIcon,
  ScalesIcon,
  ScatterIcon,
  TrophyIcon,
} from "@/features/search/icons";
import { SiteHeader } from "@/features/search/site-header";
import type { AvailableVehicleFilters } from "@/features/search/types";
import { useCompare } from "@/features/search/use-compare";
import { useFavorites } from "@/features/search/use-favorites";
import { AnalysisFilters } from "./analysis-filters";
import { analysisUrl, defaultAnalysisFilters } from "./analysis-state";
import { BestTimeToBuy, SeasonalCoverage } from "./best-time-to-buy";
import { analysisCopy } from "./copy";
import { DepreciationCurve } from "./depreciation-curve";
import { EquipmentValue } from "./equipment-value";
import { formatMonthYear } from "./format";
import { MarketSnapshot } from "./market-snapshot";
import { Module } from "./module";
import { PriceMileageChart } from "./price-mileage-chart";
import { RegionalPrices } from "./regional-prices";
import { ValueMap } from "./value-map";
import { ValueRelationshipsSection } from "./value-relationships";
import { VariantValue } from "./variant-value";

interface AnalysisExperienceProps {
  analysis: MarketAnalysis;
  available: AvailableVehicleFilters;
  initialLocale: Locale;
  lastSynchronizedAt?: string;
}

const iconClass = "size-4";

export function AnalysisExperience({
  analysis,
  available,
  initialLocale,
  lastSynchronizedAt,
}: AnalysisExperienceProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [filters, setFilters] = useState<MarketAnalysisFilters>(analysis.filters);
  const [isUpdating, startTransition] = useTransition();
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { favorites } = useFavorites();
  const { compared } = useCompare();
  const copy = analysisCopy[locale];

  // The server is the source of truth for which filters produced the analysis
  // on screen. When a navigation lands (including back/forward), the local
  // controls resync to it instead of drifting.
  const incomingUrl = analysisUrl(analysis.filters);
  const [renderedUrl, setRenderedUrl] = useState(incomingUrl);
  if (renderedUrl !== incomingUrl) {
    setRenderedUrl(incomingUrl);
    setFilters(analysis.filters);
  }

  useEffect(
    () => () => {
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    },
    [],
  );

  /**
   * Dragging a slider would otherwise fire a full re-analysis on every pixel,
   * so continuous controls pass a delay and settle first. Dropdowns pass 0 —
   * a discrete choice should feel immediate.
   */
  function changeFilters(next: MarketAnalysisFilters, delay = 0) {
    setFilters(next);
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    navigationTimerRef.current = setTimeout(() => {
      startTransition(() => {
        router.replace(analysisUrl(next), { scroll: false });
      });
    }, delay);
  }

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setLocaleCookie(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  return (
    <div>
      <SiteHeader
        activePage="analysis"
        compareCount={compared.length}
        locale={locale}
        onLocaleChange={changeLocale}
        savedCount={favorites.size}
      />

      <main className="mx-auto max-w-[1400px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10 lg:px-12">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-ink sm:text-[2rem]">
              {copy.title}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
              {copy.subtitle}
            </p>
          </div>
          <p className="text-[11px] tabular-nums text-ink-subtle">
            {copy.listingBasis(analysis.snapshot.listingCount)}
            {lastSynchronizedAt
              ? ` · ${copy.updated} ${formatMonthYear(lastSynchronizedAt, locale)}`
              : ""}
          </p>
        </header>

        <div className="mt-7">
          <AnalysisFilters
            available={available}
            filters={filters}
            locale={locale}
            onChange={changeFilters}
            onReset={() => changeFilters(defaultAnalysisFilters, 0)}
          />
        </div>

        {/* Results fade rather than collapse to skeletons while a filter change
            resolves: the previous numbers stay legible, nothing reflows, and
            the page does not flash empty between two nearly identical views.
            The dip is slight — the scatter carries most of its points across a
            filter change and animates them into place, so a heavy dim would
            hide the very transition that makes dragging a slider feel
            continuous. */}
        <div
          aria-busy={isUpdating}
          className={`mt-10 space-y-10 transition-opacity duration-200 ${
            isUpdating ? "pointer-events-none opacity-70" : "opacity-100"
          }`}
        >
          <section>
            <h2 className="sr-only">{copy.snapshot.title}</h2>
            <MarketSnapshot
              data={analysis.snapshot}
              depreciation={analysis.depreciation}
              locale={locale}
              priceMileage={analysis.priceMileage}
            />
          </section>

          {/* Twelve columns with varied spans, rather than a stack of
              full-width sections. The two questions the page answers each get
              a wide module (price/mileage, and the calendar); the supporting
              analyses sit beside them at a third or a quarter of the width, so
              the reader compares rather than scrolls. */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-9 lg:grid-cols-12">
            <Module
              className="lg:col-span-8"
              explanation={copy.scatter.description}
              icon={<ScatterIcon className={iconClass} />}
              title={copy.scatter.title}
            >
              <PriceMileageChart data={analysis.priceMileage} locale={locale} />
            </Module>

            <Module
              className="lg:col-span-4"
              explanation={copy.depreciation.explanation}
              icon={<DepreciationIcon className={iconClass} />}
              title={copy.depreciation.title}
            >
              <DepreciationCurve data={analysis.depreciation} locale={locale} />
            </Module>

            <Module
              className="lg:col-span-5"
              explanation={copy.variants.explanation}
              headline={copy.variants.headline}
              icon={<TrophyIcon className={iconClass} />}
              title={copy.variants.title}
            >
              <VariantValue data={analysis.variantValue} locale={locale} />
            </Module>

            <Module
              className="lg:col-span-7"
              explanation={copy.valueMap.description}
              icon={<GridIcon className={iconClass} />}
              title={copy.valueMap.title}
            >
              <ValueMap data={analysis.valueMap} locale={locale} />
            </Module>

            <Module
              className="lg:col-span-4"
              explanation={copy.relationships.methodology}
              icon={<ScalesIcon className={iconClass} />}
              title={copy.relationships.title}
            >
              <ValueRelationshipsSection
                data={analysis.valueRelationships}
                locale={locale}
              />
            </Module>

            <Module
              className="lg:col-span-4"
              explanation={copy.equipment.explanation}
              icon={<OptionsIcon className={iconClass} />}
              title={copy.equipment.title}
            >
              <EquipmentValue data={analysis.equipmentValue} locale={locale} />
            </Module>

            <Module
              className="lg:col-span-4"
              explanation={copy.regions.explanation}
              icon={<RegionIcon className={iconClass} />}
              title={copy.regions.title}
            >
              <RegionalPrices data={analysis.regionalPrices} locale={locale} />
            </Module>
          </div>

          <Module
            explanation={
              analysis.seasonal.isSeasonal
                ? copy.timing.description
                : copy.timing.recentDescription
            }
            headline={
              <SeasonalCoverage data={analysis.seasonal} locale={locale} />
            }
            icon={<CalendarIcon className={iconClass} />}
            title={
              analysis.seasonal.isSeasonal
                ? copy.timing.title
                : copy.timing.recentTitle
            }
          >
            <BestTimeToBuy data={analysis.seasonal} locale={locale} />
          </Module>
        </div>
      </main>
    </div>
  );
}
