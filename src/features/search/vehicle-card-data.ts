import { uiCopy, type Locale } from "./copy";
import {
  distanceBetweenKm,
  formatExactListingDate,
  formatRelativeListingDate,
  scoreTone,
} from "./format";
import { listingSource } from "@/infrastructure/marketplaces/source-registry";
import type { VehicleSearchResult } from "./types";

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Every derived display value the grid card and the list row both need, in one
 * place so the two layouts can never drift. Pure computation — the only local
 * state either component keeps is an image-load fallback flag.
 */
export function deriveVehicleCardData(
  result: VehicleSearchResult,
  locale: Locale,
  currentLocation?: Coordinates,
) {
  const { vehicle, listing, analysis } = result;
  const { identity, specification } = vehicle;
  const copy = uiCopy[locale];
  const formatLocale = locale === "en" ? "en-SE" : "sv-SE";

  const moneyFormatter = new Intl.NumberFormat(formatLocale, {
    currency: "SEK",
    maximumFractionDigits: 0,
    style: "currency",
  });
  const numberFormatter = new Intl.NumberFormat(formatLocale);

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
  const dealScoreValue = analysis.dealScore.value;
  const hasDealScore = dealScoreValue !== null;
  const dealScoreTone = hasDealScore
    ? scoreTone(dealScoreValue)
    : "border-border text-ink-subtle";
  const sellerTypeLabel =
    listing.seller.type === "dealer"
      ? copy.card.dealerBadge
      : copy.card.privateSellerBadge;
  const imageAlt =
    locale === "en"
      ? `${identity.make} ${identity.model} in a Nordic setting`
      : image?.alt ?? listing.title;

  return {
    vehicle,
    listing,
    analysis,
    identity,
    specification,
    copy,
    moneyFormatter,
    numberFormatter,
    askingPrice,
    marketValue,
    hasMarketEstimate,
    priceDifference,
    marketDifferencePercent,
    financingOffer,
    image,
    source,
    previousPrice,
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
    sellerTypeLabel,
    imageAlt,
  };
}

export type VehicleCardData = ReturnType<typeof deriveVehicleCardData>;
