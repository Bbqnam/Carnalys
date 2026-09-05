"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "./brand-logo";
import { type Locale } from "./copy";
import {
  CalendarFilterIcon,
  CompareIcon,
  HeartIcon,
  MapPinIcon,
  PersonIcon,
  StorefrontIcon,
} from "./icons";
import type { VehicleSearchResult } from "./types";
import { deriveVehicleCardData } from "./vehicle-card-data";
import { SourceLogo } from "@/features/source/source-logo";

interface VehicleRowProps {
  result: VehicleSearchResult;
  currentLocation?: { latitude: number; longitude: number };
  isFavorite: boolean;
  isCompared: boolean;
  compareDisabled?: boolean;
  locale: Locale;
  priority?: boolean;
  onToggleFavorite: () => void;
  onToggleCompare: () => void;
}

const imagePlaceholder =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjUiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjUiIGZpbGw9IiNlN2U3ZTIiLz48L3N2Zz4=";

export function VehicleRow({
  result,
  currentLocation,
  isFavorite,
  isCompared,
  compareDisabled = false,
  locale,
  priority = false,
  onToggleFavorite,
  onToggleCompare,
}: VehicleRowProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const {
    listing,
    identity,
    specification,
    copy,
    moneyFormatter,
    numberFormatter,
    askingPrice,
    hasMarketEstimate,
    priceDifference,
    marketDifferencePercent,
    financingOffer,
    image,
    priceReduction,
    mileage,
    sellerLocation,
    distanceKm,
    listingDateValue,
    listingDate,
    exactListingDate,
    dealScoreValue,
    hasDealScore,
    dealScoreTone,
    insuranceMonthly,
    insuranceDotTone,
    sellerTypeLabel,
    imageAlt,
  } = deriveVehicleCardData(result, locale, currentLocation);

  return (
    <article className="group">
      <div className="relative flex gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-[0_1px_2px_rgba(26,35,29,0.03),0_6px_18px_rgba(26,35,29,0.04)] transition-[border-color,box-shadow] duration-200 group-hover:border-border-strong group-hover:shadow-[0_12px_32px_rgba(26,35,29,0.08)] group-focus-within:border-accent/40 sm:gap-5 sm:p-4">
        <div className="relative aspect-[4/3] w-32 shrink-0 self-start overflow-hidden rounded-xl bg-surface-muted sm:w-52">
          {image && !imageFailed ? (
            <Image
              alt={imageAlt}
              blurDataURL={imagePlaceholder}
              className="object-cover"
              fill
              onError={() => setImageFailed(true)}
              placeholder="blur"
              preload={priority}
              sizes="(max-width: 640px) 33vw, 220px"
              src={image.url}
            />
          ) : (
            /* Static local SVG — a plain <img> skips the loader/srcset work. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={copy.card.missingImage}
              className="absolute inset-0 size-full object-cover"
              src="/images/vehicle-fallback.svg"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <Link
              className="flex min-w-0 items-start gap-2 rounded-sm before:absolute before:inset-0 before:z-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              href={`/vehicle/${listing.id}`}
            >
              <BrandLogo className="hidden size-9 shrink-0 sm:block" make={identity.make} />
              <span className="min-w-0">
                <h2 className="line-clamp-1 text-lg font-semibold leading-[1.2] tracking-[-0.03em] text-ink hover:underline sm:text-xl">
                  {identity.make} {identity.model}
                </h2>
                {identity.variant ? (
                  <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">
                    {identity.variant}
                  </p>
                ) : null}
              </span>
            </Link>

            <span className="flex shrink-0 items-center gap-1.5">
              <span
                aria-label={sellerTypeLabel}
                className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-ink-subtle"
                role="img"
                title={sellerTypeLabel}
              >
                {listing.seller.type === "dealer" ? (
                  <StorefrontIcon className="size-3.5" />
                ) : (
                  <PersonIcon className="size-3.5" />
                )}
              </span>
              <span
                aria-label={copy.card.scoreOutOf(copy.card.dealScore, dealScoreValue)}
                className={`grid h-6 min-w-6 place-items-center rounded-full border bg-surface-muted px-1 text-[10px] font-bold tabular-nums ${dealScoreTone}`}
                title={hasDealScore ? undefined : copy.card.notRatedHelp}
              >
                {hasDealScore ? dealScoreValue : "–"}
              </span>
              {/* Same rough insurance-cost signal as the grid card — a plain
                  colored dot, not a number, so it doesn't compete with Deal
                  Score. */}
              {insuranceMonthly !== undefined && insuranceDotTone ? (
                <span
                  aria-label={copy.card.insuranceEstimate(moneyFormatter.format(insuranceMonthly))}
                  className="grid size-6 shrink-0 place-items-center"
                  title={copy.card.insuranceEstimate(moneyFormatter.format(insuranceMonthly))}
                >
                  <span className={`size-2.5 rounded-full ${insuranceDotTone}`} />
                </span>
              ) : null}
            </span>
          </div>

          <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-muted">
            <span>{identity.modelYear}</span>
            <span className="text-ink-subtle">•</span>
            <span>
              {numberFormatter.format(mileage)} {copy.card.mileageUnit}
            </span>
            {specification.powertrain.powerHp ? (
              <>
                <span className="text-ink-subtle">•</span>
                <span>
                  {specification.powertrain.powerHp} {copy.card.powerUnit}
                </span>
              </>
            ) : null}
            <span className="text-ink-subtle">•</span>
            <span>{copy.filters.transmissions[specification.powertrain.transmission]}</span>
          </p>

          <div className="mt-auto min-w-0 space-y-1 pt-3 text-sm text-ink-muted">
            {sellerLocation ? (
              <p className="flex min-w-0 items-center gap-1.5">
                <MapPinIcon className="size-4 shrink-0" />
                <span className="truncate">{sellerLocation}</span>
                {distanceKm !== undefined ? (
                  <span className="shrink-0 font-medium text-accent">
                    · {copy.card.distanceAway(distanceKm)}
                  </span>
                ) : null}
              </p>
            ) : null}
            <p className="flex items-center gap-1.5">
              <CalendarFilterIcon className="size-4 shrink-0" />
              <span>
                <time
                  dateTime={listingDateValue}
                  suppressHydrationWarning
                  title={exactListingDate}
                >
                  {listingDate}
                </time>
                {priceReduction > 0 ? (
                  <> · {copy.card.reduced} {moneyFormatter.format(priceReduction)}</>
                ) : null}
              </span>
            </p>
          </div>
        </div>

        {/* Price + secondary actions, right-aligned. Collapses under the details
            on the narrowest screens. */}
        <div className="flex shrink-0 flex-col items-end justify-between gap-3">
          <div className="text-right">
            <p className="whitespace-nowrap text-xl font-semibold leading-none tracking-[-0.04em] text-ink">
              {moneyFormatter.format(askingPrice)}
            </p>
            {financingOffer ? (
              <p className="mt-1 whitespace-nowrap text-xs text-ink-subtle">
                {moneyFormatter.format(financingOffer.amount)}
                {copy.card.perMonth}
              </p>
            ) : null}
            {hasMarketEstimate && marketDifferencePercent > 0 ? (
              <p
                aria-label={
                  priceDifference > 0
                    ? copy.card.belowMarket(marketDifferencePercent)
                    : copy.card.aboveMarket(marketDifferencePercent)
                }
                className={`mt-1 whitespace-nowrap text-sm font-semibold tabular-nums ${
                  priceDifference > 0 ? "text-positive" : "text-negative"
                }`}
              >
                {priceDifference > 0 ? "−" : "+"}
                {marketDifferencePercent}%
              </p>
            ) : null}
          </div>

          <div className="relative z-10 flex items-center gap-1.5">
            <button
              aria-label={
                isCompared
                  ? copy.card.removeFromCompare
                  : compareDisabled
                    ? copy.card.compareLimitReached
                    : copy.card.addToCompare
              }
              aria-pressed={isCompared}
              className={`grid size-9 place-items-center rounded-full border transition duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${
                isCompared
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-muted text-ink-muted hover:border-border-strong hover:text-ink"
              }`}
              disabled={compareDisabled && !isCompared}
              onClick={onToggleCompare}
              type="button"
            >
              <CompareIcon className="size-4" />
            </button>
            <a
              aria-label={`${copy.card.viewListing}: ${listing.source.provider}`}
              className="inline-flex items-center px-1 py-2 opacity-90 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              href={listing.source.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <SourceLogo interactive={false} locale={locale} provider={listing.source.provider} />
            </a>
            <button
              aria-label={isFavorite ? copy.card.removeSaved : copy.card.saveCar}
              aria-pressed={isFavorite}
              className={`grid size-9 place-items-center rounded-full border transition duration-200 hover:scale-105 active:scale-95 ${
                isFavorite
                  ? "border-negative bg-negative-soft text-negative"
                  : "border-border bg-surface-muted text-ink-muted hover:border-border-strong hover:text-ink"
              }`}
              onClick={onToggleFavorite}
              type="button"
            >
              <HeartIcon className="size-4" fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
