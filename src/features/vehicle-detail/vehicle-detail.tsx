"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/features/search/brand-logo";
import { PriceDistribution } from "./price-distribution";
import {
  buyConfidenceSummaryText,
  dealScoreSummaryText,
  marketValueExplanationText,
  scoreFactorText,
  uiCopy,
  type Locale,
} from "@/features/search/copy";
import {
  createMoneyFormatter,
  createNumberFormatter,
  distanceBetweenKm,
  factorBarTone,
  factorChipTone,
  factorTierIndex,
  formatExactListingDate,
  formatRelativeListingDate,
  ownershipCostCategoryTone,
  scoreTone,
  sellerTypeTone,
} from "@/features/search/format";
import {
  ArrowRightIcon,
  CheckIcon,
  CompareIcon,
  ExternalLinkIcon,
  HeartIcon,
  MapPinIcon,
} from "@/features/search/icons";
import { setLocaleCookie } from "@/features/search/locale";
import { CompareTray } from "@/features/search/compare-tray";
import { SiteHeader } from "@/features/search/site-header";
import { useCompare } from "@/features/search/use-compare";
import { useCurrentLocation } from "@/features/search/use-current-location";
import { useFavorites } from "@/features/search/use-favorites";
import type { VehicleSearchResult } from "@/features/search/types";
import { estimateFuelConsumptionL100km, type ScoreFactor } from "@/domain/vehicle";

interface VehicleDetailProps {
  result: VehicleSearchResult;
  locale?: Locale;
}

function ScoreCard({
  title,
  value,
  summary,
  factors,
  locale,
}: {
  title: string;
  value: number;
  summary: string;
  factors: readonly ScoreFactor[];
  locale: Locale;
}) {
  const copy = uiCopy[locale];
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#19231d]">{title}</h3>
        <span
          className={`flex items-center gap-1.5 rounded-full border-2 bg-white px-2.5 py-0.5 text-sm font-bold tabular-nums ${scoreTone(value)}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#526058]">{summary}</p>
      {factors.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-[#eceeea] pt-3">
          {factors.map((factor) => {
            const factorText = scoreFactorText(locale, factor);
            return (
              <li key={factor.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#26332b]">
                    {factorText.label}
                  </span>
                  <span
                    aria-label={copy.detail.factorImpact[factor.impact]}
                    className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold ${factorChipTone(factor.impact)}`}
                  >
                    {copy.detail.factorTiers[factorTierIndex(factor.score)]}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#e9e8e3]">
                    <div
                      className={`h-full rounded-full ${factorBarTone(factor.impact)}`}
                      style={{
                        width: `${Math.max(4, Math.min(100, factor.score))}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-[#8a918c]">
                  {factorText.explanation}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function VehicleDetail({ result, locale = "sv" }: VehicleDetailProps) {
  const router = useRouter();
  const [activeImage, setActiveImage] = useState(0);
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const { favorites, toggle } = useFavorites();
  const {
    compared,
    toggle: toggleCompare,
    remove: removeCompare,
    clear: clearCompare,
    isFull: compareFull,
  } = useCompare();
  const { location, status: locationStatus, requestCurrentLocation } = useCurrentLocation();
  const { vehicle, listing, analysis } = result;
  const { identity, specification } = vehicle;
  const copy = uiCopy[locale];
  const moneyFormatter = createMoneyFormatter(locale);
  const numberFormatter = createNumberFormatter(locale);
  const isFavorite = favorites.has(listing.id);
  const isCompared = compared.some((vehicle) => vehicle.id === listing.id);
  const compareDisabled = compareFull && !isCompared;
  const estimatedFuelConsumption = specification.powertrain.fuelConsumption
    ? undefined
    : estimateFuelConsumptionL100km(specification);
  const askingPrice = listing.price.askingPrice.amount;
  const hasMarketEstimate = analysis.marketValue.comparableListingCount >= 3;
  const images = listing.images.length > 0 ? listing.images : undefined;
  const currentImage = images?.[activeImage] ?? images?.[0];
  const equipmentItems = listing.equipment.filter((item) => !item.startsWith("*"));
  const equipmentPreviewCount = 18;
  const visibleEquipment = showAllEquipment
    ? equipmentItems
    : equipmentItems.slice(0, equipmentPreviewCount);
  const listingDateValue = listing.publishedAt ?? listing.source.firstSeenAt;
  const listingDateLabel = listing.publishedAt ? copy.card.posted : copy.card.firstSeen;
  const distanceKm =
    location &&
    listing.location.latitude !== undefined &&
    listing.location.longitude !== undefined
      ? Math.max(
          1,
          Math.round(
            distanceBetweenKm(location, {
              latitude: listing.location.latitude,
              longitude: listing.location.longitude,
            }),
          ),
        )
      : undefined;

  function changeLocale(nextLocale: Locale) {
    setLocaleCookie(nextLocale);
    document.documentElement.lang = nextLocale;
    router.refresh();
  }

  return (
    <div>
      <SiteHeader
        locale={locale}
        locationStatus={locationStatus}
        onLocaleChange={changeLocale}
        onRequestLocation={requestCurrentLocation}
        savedCount={favorites.size}
        compareCount={compared.length}
      />

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#526058] hover:text-[#19231d]"
          onClick={() => router.back()}
          type="button"
        >
          <ArrowRightIcon className="size-4 rotate-180" />
          {copy.detail.back}
        </button>

        <div className="mt-5 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative aspect-[16/10] max-h-[380px] overflow-hidden rounded-2xl bg-[#e9e8e3]">
            {currentImage ? (
              <Image
                alt={currentImage.alt ?? listing.title}
                className="object-cover"
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 60vw"
                src={currentImage.url}
              />
            ) : (
              <Image
                alt={copy.card.missingImage}
                className="object-cover"
                fill
                sizes="(max-width: 1023px) 100vw, 60vw"
                src="/images/vehicle-fallback.svg"
              />
            )}
            <div className="absolute right-3.5 top-3.5 flex items-center gap-2">
              <button
                aria-label={
                  isCompared
                    ? copy.card.removeFromCompare
                    : compareDisabled
                      ? copy.card.compareLimitReached
                      : copy.card.addToCompare
                }
                aria-pressed={isCompared}
                className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur-md transition duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${
                  isCompared
                    ? "border-[#255e45] bg-[#eef6f1] text-[#255e45]"
                    : "border-white/60 bg-white/85 text-[#26332b] hover:bg-white"
                }`}
                disabled={compareDisabled}
                onClick={() =>
                  toggleCompare({
                    id: listing.id,
                    make: identity.make,
                    model: identity.model,
                    variant: identity.variant,
                    imageUrl: listing.images[0]?.url,
                  })
                }
                type="button"
              >
                <CompareIcon className="size-[18px]" />
              </button>
              <button
                aria-label={isFavorite ? copy.card.removeSaved : copy.card.saveCar}
                aria-pressed={isFavorite}
                className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur-md transition duration-200 hover:scale-105 active:scale-95 ${
                  isFavorite
                    ? "border-[#a84c45] bg-[#fff8f7] text-[#a84c45]"
                    : "border-white/60 bg-white/85 text-[#26332b] hover:bg-white"
                }`}
                onClick={() => toggle(listing.id)}
                type="button"
              >
                <HeartIcon className="size-[18px]" fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
          {images && images.length > 1 ? (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  className={`relative size-16 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                    index === activeImage ? "ring-[#255e45]" : "ring-transparent hover:ring-[#d5d9d2]"
                  }`}
                  key={image.url}
                  onClick={() => setActiveImage(index)}
                  type="button"
                >
                  <Image alt="" className="object-cover" fill sizes="64px" src={image.url} />
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-6 flex items-center gap-2 text-xs text-[#737b75]">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-muted ring-1 ring-inset ring-[#e2e6e1]">
              <BrandLogo className="size-5.5" make={identity.make} />
            </span>
            <span>{identity.modelYear}</span>
            <span className="text-[#c5c8c4]">•</span>
            <span>{numberFormatter.format(listing.mileageKm / 10)} {copy.card.mileageUnit}</span>
            <span className="text-[#c5c8c4]">•</span>
            <span>{copy.filters.fuels[specification.powertrain.fuelType]}</span>
            <span className="text-[#c5c8c4]">•</span>
            <span>{copy.filters.transmissions[specification.powertrain.transmission]}</span>
            <span
              className={`ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${sellerTypeTone(listing.seller.type)}`}
            >
              {listing.seller.type === "dealer"
                ? copy.card.dealerBadge
                : copy.card.privateSellerBadge}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
            {identity.make} {identity.model}
          </h1>
          {identity.variant ? (
            <p className="mt-1 text-base text-ink-muted">{identity.variant}</p>
          ) : null}
          <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-ink">
            {moneyFormatter.format(askingPrice)}
          </p>

          {listing.seller.name || listing.location.municipality ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[#737b75]">
              <MapPinIcon className="size-3.5 shrink-0" />
              {[listing.seller.name, listing.location.municipality].filter(Boolean).join(" · ")}
              {distanceKm !== undefined ? (
                <span className="font-medium text-[#52685a]">
                  · {copy.card.distanceAway(distanceKm)}
                </span>
              ) : null}
              <span className="text-[#c5c8c4]">·</span>
              <span>
                {listingDateLabel}{" "}
                <time dateTime={listingDateValue} suppressHydrationWarning title={formatExactListingDate(listingDateValue, locale)}>
                  {formatRelativeListingDate(listingDateValue, locale)}
                </time>
              </span>
            </p>
          ) : null}

          {listing.description ? (
            <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-[#354139]">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-6 rounded-2xl border border-border bg-[#fbfcfa] p-5">
            <h2 className="text-sm font-semibold text-[#19231d]">{copy.detail.specificationsTitle}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[#8a918c]">{copy.filters.body}</dt>
                <dd className="font-medium text-[#26332b]">
                  {copy.filters.bodies[specification.bodyStyle]}
                </dd>
              </div>
              <div>
                <dt className="text-[#8a918c]">{copy.filters.fuel}</dt>
                <dd className="font-medium text-[#26332b]">
                  {copy.filters.fuels[specification.powertrain.fuelType]}
                </dd>
              </div>
              <div>
                <dt className="text-[#8a918c]">{copy.filters.transmission}</dt>
                <dd className="font-medium text-[#26332b]">
                  {copy.filters.transmissions[specification.powertrain.transmission]}
                </dd>
              </div>
              {specification.powertrain.drivetrain ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.drivetrain}</dt>
                  <dd className="font-medium text-[#26332b]">
                    {copy.filters.drivetrains[specification.powertrain.drivetrain]}
                  </dd>
                </div>
              ) : null}
              {specification.powertrain.engineDescription ||
              specification.powertrain.engineDisplacementCc ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.engine}</dt>
                  <dd className="font-medium text-[#26332b]">
                    {specification.powertrain.engineDescription ??
                      `${(specification.powertrain.engineDisplacementCc! / 1000).toFixed(1)} L`}
                  </dd>
                </div>
              ) : null}
              {specification.powertrain.powerHp ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.horsepower}</dt>
                  <dd className="font-medium text-[#26332b]">
                    {specification.powertrain.powerHp} hk
                  </dd>
                </div>
              ) : null}
              {specification.powertrain.fuelConsumption ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.fuelConsumption}</dt>
                  <dd className="font-medium text-[#26332b]">
                    {specification.powertrain.fuelConsumption}
                  </dd>
                </div>
              ) : estimatedFuelConsumption !== undefined ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.fuelConsumption}</dt>
                  <dd className="font-medium text-ink-muted">
                    {copy.detail.fuelConsumptionEstimated(
                      `${numberFormatter.format(estimatedFuelConsumption)} L/100 km`,
                    )}
                  </dd>
                </div>
              ) : null}
              {listing.ownerCount !== undefined ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.owners}</dt>
                  <dd className="font-medium text-[#26332b]">{listing.ownerCount}</dd>
                </div>
              ) : null}
              {listing.warranty?.included ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.warranty}</dt>
                  <dd className="font-medium text-[#26332b]">
                    {listing.warranty.description ?? copy.detail.warranty}
                  </dd>
                </div>
              ) : null}
              {vehicle.registrationNumber ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.registrationNumber}</dt>
                  <dd>
                    <a
                      className="inline-flex items-center gap-1 font-medium text-[#26332b] underline decoration-[#c5c8c4] underline-offset-2 hover:text-ink"
                      href={`https://biluppgifter.se/fordon/${vehicle.registrationNumber.replace(/\s+/g, "").toUpperCase()}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {vehicle.registrationNumber}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </dd>
                </div>
              ) : null}
              {vehicle.vin ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.vin}</dt>
                  <dd className="font-medium text-[#26332b]">{vehicle.vin}</dd>
                </div>
              ) : null}
              {vehicle.firstRegistrationDate ? (
                <div>
                  <dt className="text-[#8a918c]">{copy.detail.firstRegistration}</dt>
                  <dd className="font-medium text-[#26332b]">{vehicle.firstRegistrationDate}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {equipmentItems.length > 0 ? (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-[#19231d]">
                {copy.detail.equipmentTitle}
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {visibleEquipment.map((item) => (
                  <li className="flex items-start gap-2 text-sm text-[#354139]" key={item}>
                    <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-[#8c948e]" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
              {equipmentItems.length > equipmentPreviewCount ? (
                <button
                  className="mt-4 text-xs font-semibold text-[#354139] underline-offset-4 hover:underline"
                  onClick={() => setShowAllEquipment((current) => !current)}
                  type="button"
                >
                  {showAllEquipment
                    ? copy.detail.equipmentShowLess
                    : copy.detail.equipmentShowAll(equipmentItems.length)}
                </button>
              ) : null}
            </div>
          ) : null}

          <a
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dfe2dc] bg-[#fbfcfa] text-sm font-semibold text-[#334139] transition hover:border-[#b9c5bb] hover:bg-[#f5f8f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#255e45] focus-visible:ring-offset-2 active:scale-[0.99]"
            href={listing.source.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {copy.card.viewListing}
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>

        <div className="space-y-4">
          <ScoreCard
            factors={analysis.dealScore.factors}
            locale={locale}
            summary={dealScoreSummaryText(locale, analysis.marketValue.comparableListingCount)}
            title={copy.detail.dealScoreTitle}
            value={analysis.dealScore.value}
          />
          <ScoreCard
            factors={analysis.buyConfidenceScore.factors}
            locale={locale}
            summary={buyConfidenceSummaryText(locale)}
            title={copy.detail.buyConfidenceTitle}
            value={analysis.buyConfidenceScore.value}
          />

          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-[#19231d]">{copy.detail.marketValueTitle}</h3>
            {hasMarketEstimate ? (
              <>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {moneyFormatter.format(analysis.marketValue.value.amount)}
                </p>
                <p className="mt-1 text-xs text-[#8a918c]">
                  {copy.detail.marketRange}: {moneyFormatter.format(analysis.marketValue.range.minimum.amount)}
                  {" – "}
                  {moneyFormatter.format(analysis.marketValue.range.maximum.amount)}
                </p>
                {analysis.marketValue.comparablePrices.length > 0 ? (
                  <PriceDistribution
                    comparableLabel={copy.detail.comparablePricesLabel}
                    likelyRangeMaximum={analysis.marketValue.range.maximum.amount}
                    likelyRangeMinimum={analysis.marketValue.range.minimum.amount}
                    locale={locale}
                    prices={analysis.marketValue.comparablePrices}
                    targetLabel={copy.detail.thisCarLabel}
                    targetPrice={askingPrice}
                  />
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">{copy.card.marketEstimatePending}</p>
            )}
            <p className="mt-3 text-xs text-[#8a918c]">
              {marketValueExplanationText(locale, analysis.marketValue.comparableListingCount)}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="text-sm font-semibold text-[#19231d]">{copy.detail.ownershipCostTitle}</h3>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {moneyFormatter.format(analysis.ownershipCost.annualCost.amount)}
            </p>
            <p className="mt-1 text-xs text-[#8a918c]">
              {copy.detail.ownershipCostCaption(analysis.ownershipCost.estimatedForAnnualDistanceKm)}
            </p>
            {analysis.ownershipCost.items.length > 0 ? (
              <div className="mt-4 border-t border-[#eceeea] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#8a918c]">
                  {copy.detail.ownershipCostBreakdown}
                </p>
                <div className="mt-3 flex h-4 gap-[2px] bg-white">
                  {analysis.ownershipCost.items.map((item, index) => (
                    <div
                      aria-label={`${copy.detail.ownershipCostCategories[item.category]}: ${moneyFormatter.format(item.annualCost.amount)}`}
                      className={`group/cost relative cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#708b79] focus-visible:ring-offset-2 ${ownershipCostCategoryTone(item.category)} ${
                        index === 0 ? "rounded-l-full" : ""
                      } ${index === analysis.ownershipCost.items.length - 1 ? "rounded-r-full" : ""}`}
                      key={item.category}
                      style={{ flexGrow: Math.max(item.annualCost.amount, 1) }}
                      tabIndex={0}
                    >
                      <span
                        className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-20 w-max max-w-56 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition duration-150 group-hover/cost:translate-y-0 group-hover/cost:opacity-100 group-focus-visible/cost:translate-y-0 group-focus-visible/cost:opacity-100"
                        role="tooltip"
                      >
                        {copy.detail.ownershipCostCategories[item.category]}:{" "}
                        {moneyFormatter.format(item.annualCost.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {analysis.ownershipCost.items.map((item) => (
                    <li className="flex items-center justify-between text-sm" key={item.category}>
                      <span className="flex items-center gap-2 text-[#526058]">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 shrink-0 rounded-full ${ownershipCostCategoryTone(item.category)}`}
                        />
                        {copy.detail.ownershipCostCategories[item.category]}
                      </span>
                      <span className="font-medium text-[#26332b]">
                        {moneyFormatter.format(item.annualCost.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </div>

      <CompareTray
        compared={compared}
        locale={locale}
        onClear={clearCompare}
        onRemove={removeCompare}
      />
    </div>
  );
}
