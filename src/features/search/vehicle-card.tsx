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
  ExternalLinkIcon,
  HeartIcon,
  MapPinIcon,
} from "./icons";
import type { VehicleSearchResult } from "./types";
import { SourceLogo } from "@/features/source/source-logo";

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
  const savings = Math.max(0, marketValue - askingPrice);
  const marketDifferencePercent =
    marketValue > 0 ? Math.round((Math.abs(priceDifference) / marketValue) * 100) : 0;
  const financingOffer =
    listing.seller.type === "dealer" ? listing.price.monthlyCost : undefined;
  const image = listing.images[0];
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
  const listingDateLabel = listing.publishedAt ? copy.card.posted : copy.card.firstSeen;
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
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3.5">
          <span
            aria-label={copy.card.scoreOutOf(copy.card.dealScore, analysis.dealScore.value)}
            className={`flex items-center gap-1.5 rounded-full border-2 bg-surface/90 px-3 py-1 text-sm font-bold tabular-nums shadow-sm backdrop-blur-md ${dealScoreTone}`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
              {copy.card.dealBadge}
            </span>
            {analysis.dealScore.value}
          </span>
          <div className="flex items-center gap-2">
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
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-surface/60 bg-surface/85 text-ink hover:bg-surface"
              }`}
              disabled={compareDisabled && !isCompared}
              onClick={onToggleCompare}
              type="button"
            >
              <CompareIcon className="size-[18px]" />
            </button>
            <button
              aria-label={isFavorite ? copy.card.removeSaved : copy.card.saveCar}
              aria-pressed={isFavorite}
              className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur-md transition duration-200 hover:scale-105 active:scale-95 ${
                isFavorite
                  ? "border-negative bg-negative-soft text-negative"
                  : "border-surface/60 bg-surface/85 text-ink hover:bg-surface"
              }`}
              onClick={onToggleFavorite}
              type="button"
            >
              <HeartIcon className="size-[18px]" fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="absolute bottom-3.5 left-3.5 z-10">
          <SourceLogo locale={locale} provider={listing.source.provider} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm text-ink-muted">
          <span className="shrink-0">{identity.modelYear}</span>
          <span className="shrink-0 text-ink-subtle">•</span>
          <span className="shrink-0">{numberFormatter.format(mileage)} {copy.card.mileageUnit}</span>
          <span className="shrink-0 text-ink-subtle">•</span>
          <span className="truncate">{copy.filters.fuels[specification.powertrain.fuelType]}</span>
          <span className="shrink-0 text-ink-subtle 2xl:hidden">•</span>
          <span className="truncate 2xl:hidden">{copy.filters.transmissions[specification.powertrain.transmission]}</span>
          <span
            className={`ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] ${sellerTypeTone(listing.seller.type)}`}
          >
            {listing.seller.type === "dealer"
              ? copy.card.dealerBadge
              : copy.card.privateSellerBadge}
          </span>
        </p>

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

        {/* One shape for every card, whatever the verdict says. `flex-wrap`
            used to drop the market note onto its own row as soon as the pair
            outgrew the card, so the same row was one line tall on some cards
            and two on others and nothing below it lined up across the grid.
            Now the price is the fixed part and the note is the part that
            gives way, and the note reserves both its lines whether or not it
            has a second one — so a verdict with a detail line and one without
            occupy the same height. */}
        <div className="mt-3 flex min-w-0 items-end justify-between gap-x-3">
          <p className="shrink-0 whitespace-nowrap text-xl font-semibold leading-none tracking-[-0.04em] text-ink sm:text-2xl">
            {moneyFormatter.format(askingPrice)}
          </p>
          <span
            aria-label={
              hasMarketEstimate
                ? `${copy.card.marketValue}: ${moneyFormatter.format(marketValue)}`
                : copy.card.marketEstimatePending
            }
            className="group/market relative flex min-h-[2.375rem] min-w-0 flex-col justify-end rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 cursor-help"
            tabIndex={0}
          >
            {!hasMarketEstimate ? (
              <span className="block truncate text-sm font-medium text-ink-muted">
                {copy.card.marketEstimatePending}
              </span>
            ) : savings > 0 ? (
              <>
                <strong className="block truncate text-sm font-semibold text-positive">
                  {copy.card.save} {moneyFormatter.format(savings)}
                </strong>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">
                  {copy.card.belowMarket(marketDifferencePercent)}
                </span>
              </>
            ) : priceDifference < 0 ? (
              <span className="block truncate text-sm font-medium text-negative">
                {copy.card.aboveMarket(marketDifferencePercent)}
              </span>
            ) : (
              <span className="block truncate text-sm font-medium text-ink-muted">
                {copy.card.atMarket}
              </span>
            )}
            <span
              className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] right-0 z-20 w-max max-w-56 translate-y-1 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-surface opacity-0 shadow-lg transition duration-150 group-hover/market:translate-y-0 group-hover/market:opacity-100 group-focus-visible/market:translate-y-0 group-focus-visible/market:opacity-100"
              role="tooltip"
            >
              {hasMarketEstimate
                ? `${copy.card.marketValue}: ${moneyFormatter.format(marketValue)}`
                : copy.card.insufficientMarketData(
                    analysis.marketValue.comparableListingCount,
                  )}
            </span>
          </span>
        </div>

        <div className="mt-auto flex min-w-0 items-end justify-between gap-4 pt-5">
          <div className="min-w-0 space-y-1.5 text-sm text-ink-muted">
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
                {listingDateLabel}{" "}
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
          {financingOffer ? (
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium text-ink-subtle">
                {copy.card.financingFrom}
              </p>
              <p className="mt-0.5 whitespace-nowrap text-base font-semibold text-ink">
                {moneyFormatter.format(financingOffer.amount)}{copy.card.perMonth}
              </p>
            </div>
          ) : null}
        </div>

        {/* Two links of near-identical size used to sit on every card, and the
            one styled as the button was the one that left for the marketplace.
            The card is now the primary action and leads to our own analysis;
            this stays available as a plain secondary link, raised above the
            card-wide hit area so it still takes its own clicks. */}
        <a
          className="relative z-10 mt-3.5 inline-flex w-fit items-center gap-1.5 self-start rounded-md py-1 text-sm font-medium text-ink-muted underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          href={listing.source.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {copy.card.viewListing}
          <ExternalLinkIcon className="size-3.5" />
        </a>
        </div>
      </div>
    </article>
  );
}
