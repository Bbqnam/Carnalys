"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "./brand-logo";
import { uiCopy, type Locale } from "./copy";
import {
  distanceBetweenKm,
  formatExactListingDate,
  formatRelativeListingDate,
  scoreTone,
  sellerTypeTone,
} from "./format";
import {
  CalendarFilterIcon,
  CompareIcon,
  HeartIcon,
  MapPinIcon,
} from "./icons";
import type { VehicleSearchResult } from "./types";
import { SourceLogo } from "@/features/source/source-logo";
import { listingSource } from "@/infrastructure/marketplaces/source-registry";

interface VehicleCardProps {
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

export function VehicleCard({
  result,
  currentLocation,
  isFavorite,
  isCompared,
  compareDisabled = false,
  locale,
  priority = false,
  onToggleFavorite,
  onToggleCompare,
}: VehicleCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { vehicle, listing, analysis } = result;
  const { identity, specification } = vehicle;
  const askingPrice = listing.price.askingPrice.amount;
  const marketValue = analysis.marketValue.value.amount;
  const hasMarketEstimate = analysis.marketValue.comparableListingCount >= 3;
  const priceDifference = marketValue - askingPrice;
  const marketDifferencePercent =
    marketValue > 0 ? Math.round((Math.abs(priceDifference) / marketValue) * 100) : 0;
  const financingOffer =
    listing.seller.type === "dealer" ? listing.price.monthlyCost : undefined;
  const image = listing.images[0];
  const source = listingSource(listing.source.provider);
  const previousPrice = listing.price.previousAskingPrice?.amount;
  const priceReduction = previousPrice ? previousPrice - askingPrice : 0;
  const copy = uiCopy[locale];
  const formatLocale = locale === "en" ? "en-SE" : "sv-SE";
  const moneyFormatter = new Intl.NumberFormat(formatLocale, {
    currency: "SEK",
    maximumFractionDigits: 0,
    style: "currency",
  });
  const numberFormatter = new Intl.NumberFormat(formatLocale);
  const mileage = listing.mileageKm / 10;
  const sellerLocation = [listing.seller.name, listing.location.municipality]
    .filter(Boolean)
    .join(" · ");
  const distanceKm =
    currentLocation &&
    listing.location.latitude !== undefined &&
    listing.location.longitude !== undefined
      ? Math.max(
          1,
          Math.round(
            distanceBetweenKm(currentLocation, {
              latitude: listing.location.latitude,
              longitude: listing.location.longitude,
            }),
          ),
        )
      : undefined;
  const listingDateValue = listing.publishedAt ?? listing.source.firstSeenAt;
  const listingDate = formatRelativeListingDate(listingDateValue, locale);
  const exactListingDate = formatExactListingDate(listingDateValue, locale);
  const dealScoreTone = scoreTone(analysis.dealScore.value);
  const imageAlt =
    locale === "en"
      ? `${identity.make} ${identity.model} in a Nordic setting`
      : image?.alt ?? listing.title;

  return (
    /* The lift lives on the inner element, not on the one that owns `:hover`.
       When a card that is itself the hover target translates up, its bottom
       edge slides out from under a cursor resting there, which drops the
       hover, which drops the lift, which puts the edge back under the cursor
       — a loop that reads as the card shaking. The <article> now holds the
       hover state and never moves, so the state cannot flicker; the 4px the
       inner card vacates is still inside it. */
    <article className="group h-full">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-border bg-surface shadow-[0_2px_3px_rgba(26,35,29,0.025),0_10px_28px_rgba(26,35,29,0.05)] transition-[transform,box-shadow,border-color] duration-300 ease-out group-hover:-translate-y-1 group-hover:border-border-strong group-hover:shadow-[0_18px_48px_rgba(26,35,29,0.1)] group-focus-within:border-accent/40 group-focus-within:shadow-[0_18px_45px_rgba(26,35,29,0.09)]">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
          {image && !imageFailed ? (
            <Image
              alt={imageAlt}
              blurDataURL={imagePlaceholder}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
              fill
              onError={() => setImageFailed(true)}
              placeholder="blur"
              preload={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, (max-width: 1600px) 33vw, 25vw"
              src={image.url}
            />
          ) : (
            <Image
              alt={copy.card.missingImage}
              className="object-cover"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, (max-width: 1600px) 33vw, 25vw"
              src="/images/vehicle-fallback.svg"
            />
          )}
        </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm text-ink-muted">
            <span className="shrink-0">{identity.modelYear}</span>
            <span className="shrink-0 text-ink-subtle">•</span>
            <span className="shrink-0">{numberFormatter.format(mileage)} {copy.card.mileageUnit}</span>
            <span className="shrink-0 text-ink-subtle">•</span>
            <span className="truncate">{copy.filters.fuels[specification.powertrain.fuelType]}</span>
            {specification.powertrain.powerHp ? (
              <>
                <span className="shrink-0 text-ink-subtle">•</span>
                <span className="shrink-0">{specification.powertrain.powerHp} {copy.card.powerUnit}</span>
              </>
            ) : null}
            {/* Transmission is secondary — kept off the smallest screens where
                the line already truncates, and off the widest where the deal
                verdict competes for the row. */}
            <span className="hidden shrink-0 text-ink-subtle sm:inline 2xl:hidden">•</span>
            <span className="hidden truncate sm:inline 2xl:hidden">{copy.filters.transmissions[specification.powertrain.transmission]}</span>
          </p>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              aria-label={copy.card.scoreOutOf(copy.card.dealScore, analysis.dealScore.value)}
              className={`group/score relative grid h-6 min-w-6 place-items-center rounded-full border bg-surface-muted px-1 text-[10px] font-bold tabular-nums ${dealScoreTone}`}
              tabIndex={0}
            >
              {analysis.dealScore.value}
              <span
                className="pointer-events-none absolute right-0 top-[calc(100%+0.35rem)] z-30 w-max translate-y-[-0.2rem] rounded-md bg-ink px-2 py-1 text-[10px] font-medium text-surface opacity-0 shadow-md transition group-hover/score:translate-y-0 group-hover/score:opacity-100 group-focus-visible/score:translate-y-0 group-focus-visible/score:opacity-100"
                role="tooltip"
              >
                {copy.card.scoreOutOf(copy.card.dealScore, analysis.dealScore.value)}
              </span>
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${sellerTypeTone(listing.seller.type)}`}
            >
              {listing.seller.type === "dealer"
                ? copy.card.dealerBadge
                : copy.card.privateSellerBadge}
            </span>
          </span>
        </div>

        {/* The photo, the price and the whitespace were all dead: only this
            text linked anywhere, while the largest and most obviously tappable
            thing on the card did nothing. The anchor keeps the href and the
            accessible name — one link in the tree, not a card full of them —
            and `before:` stretches its hit area over the whole card. Anything
            that must stay separately clickable is raised above it. */}
        <Link
          className="mt-3 flex min-w-0 items-start gap-2 rounded-sm before:absolute before:inset-0 before:z-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          href={`/vehicle/${listing.id}`}
        >
          <BrandLogo className="size-11 shrink-0" make={identity.make} />
          <span className="min-w-0">
            <h2 className="line-clamp-1 text-xl font-semibold leading-[1.2] tracking-[-0.035em] text-ink hover:underline">
              {identity.make} {identity.model}
            </h2>
            {identity.variant ? (
              <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{identity.variant}</p>
            ) : null}
          </span>
        </Link>

        {/* Price is the fixed anchor; the monthly cost sits directly under it
            as a quiet second line. The market read is a single signed figure —
            green when the ask is below the estimate, red when above — with no
            label; the detail lives in the hover tooltip. Nothing renders here
            until the estimate has enough comparables, so an unpriced car shows
            no placeholder text. */}
        <div className="mt-3 flex min-w-0 items-start justify-between gap-x-3">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-xl font-semibold leading-none tracking-[-0.04em] text-ink sm:text-2xl">
              {moneyFormatter.format(askingPrice)}
            </p>
            {financingOffer ? (
              <p className="mt-1 whitespace-nowrap text-xs text-ink-subtle">
                {moneyFormatter.format(financingOffer.amount)}
                {copy.card.perMonth}
              </p>
            ) : null}
          </div>
          {hasMarketEstimate && marketDifferencePercent > 0 ? (
            <span
              aria-label={`${copy.card.marketValue}: ${moneyFormatter.format(marketValue)}`}
              className="group/market relative shrink-0 cursor-help rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2"
              tabIndex={0}
            >
              <span
                className={`block whitespace-nowrap text-sm font-semibold tabular-nums ${
                  priceDifference > 0 ? "text-positive" : "text-negative"
                }`}
              >
                {priceDifference > 0 ? "−" : "+"}
                {marketDifferencePercent}%
              </span>
              <span
                className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] right-0 z-20 w-max max-w-56 translate-y-1 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-surface opacity-0 shadow-lg transition duration-150 group-hover/market:translate-y-0 group-hover/market:opacity-100 group-focus-visible/market:translate-y-0 group-focus-visible/market:opacity-100"
                role="tooltip"
              >
                {`${copy.card.marketValue}: ${moneyFormatter.format(marketValue)} · ${
                  priceDifference > 0
                    ? copy.card.belowMarket(marketDifferencePercent)
                    : copy.card.aboveMarket(marketDifferencePercent)
                }`}
              </span>
            </span>
          ) : null}
        </div>

        <div className="mt-auto min-w-0 space-y-1.5 pt-5 text-sm text-ink-muted">
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

        {/* Keep the vehicle photo completely clean. The three secondary
            actions share a balanced footer row: compare, the centered source
            link, and save. The card-wide internal link remains the primary
            action underneath them. */}
        <div className="relative z-10 mt-2.5 grid min-h-10 grid-cols-3 items-center">
          <button
            aria-label={
              isCompared
                ? copy.card.removeFromCompare
                : compareDisabled
                  ? copy.card.compareLimitReached
                  : copy.card.addToCompare
            }
            aria-pressed={isCompared}
            className={`grid size-9 justify-self-start place-items-center rounded-full border transition duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${
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
            aria-label={`${copy.card.viewListing}: ${source.displayName}`}
            className="inline-flex items-center justify-self-center px-1 py-2 opacity-90 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            href={listing.source.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <SourceLogo interactive={false} locale={locale} provider={listing.source.provider} />
          </a>
          <button
            aria-label={isFavorite ? copy.card.removeSaved : copy.card.saveCar}
            aria-pressed={isFavorite}
            className={`grid size-9 justify-self-end place-items-center rounded-full border transition duration-200 hover:scale-105 active:scale-95 ${
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
