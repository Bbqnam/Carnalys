"use client";

import Image from "next/image";
import { useState } from "react";
import { uiCopy, type Locale } from "./copy";
import { ExternalLinkIcon, HeartIcon, MapPinIcon } from "./icons";
import type { VehicleSearchResult } from "./types";

interface VehicleCardProps {
  result: VehicleSearchResult;
  isFavorite: boolean;
  locale: Locale;
  priority?: boolean;
  onToggleFavorite: () => void;
}

const imagePlaceholder =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjUiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjUiIGZpbGw9IiNlN2U3ZTIiLz48L3N2Zz4=";

function ScoreChip({
  label,
  value,
  tone,
  locale,
  explanation,
}: {
  label: string;
  value: number;
  tone: "deal" | "confidence";
  locale: Locale;
  explanation: string;
}) {
  const isDeal = tone === "deal";
  const copy = uiCopy[locale].card;
  const rating =
    value >= 90
      ? copy.exceptional
      : value >= 80
        ? copy.veryGood
        : value >= 60
          ? copy.average
          : copy.poor;

  return (
    <span
      aria-label={`${copy.scoreOutOf(label, value)}. ${rating}. ${explanation}`}
      className={`group/score relative grid size-10 cursor-help place-items-center rounded-full border-2 text-sm font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#708b79] focus-visible:ring-offset-2 ${
        isDeal
          ? "border-[#4c8a62] bg-[#edf6f0] text-[#1e5737]"
          : "border-[#6381ae] bg-[#f0f4fa] text-[#345b82]"
      }`}
      tabIndex={0}
    >
      {value}
      <span
        className={`pointer-events-none absolute bottom-[calc(100%+0.55rem)] z-20 w-48 translate-y-1 rounded-xl bg-[#17221c] px-3 py-2.5 text-left text-[11px] leading-4 text-white opacity-0 shadow-xl transition duration-150 group-hover/score:translate-y-0 group-hover/score:opacity-100 group-focus-visible/score:translate-y-0 group-focus-visible/score:opacity-100 ${isDeal ? "left-0" : "right-0"}`}
        role="tooltip"
      >
        <strong className="block font-semibold">{rating}</strong>
        <span className="mt-0.5 block text-white/70">{explanation}</span>
      </span>
    </span>
  );
}

export function VehicleCard({
  result,
  isFavorite,
  locale,
  priority = false,
  onToggleFavorite,
}: VehicleCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { vehicle, listing, analysis } = result;
  const { identity, specification } = vehicle;
  const askingPrice = listing.price.askingPrice.amount;
  const marketValue = analysis.marketValue.value.amount;
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
  const mileage = locale === "en" ? listing.mileageKm : listing.mileageKm / 10;
  const sellerLocation = [listing.seller.name, listing.location.municipality]
    .filter(Boolean)
    .join(" · ");
  const imageAlt =
    locale === "en"
      ? `${identity.make} ${identity.model} in a Nordic setting`
      : image?.alt ?? listing.title;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-[#e4e5df] bg-white shadow-[0_2px_3px_rgba(26,35,29,0.025),0_10px_28px_rgba(26,35,29,0.05)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[#d5d9d2] hover:shadow-[0_18px_48px_rgba(26,35,29,0.1)] focus-within:border-[#aebbb2] focus-within:shadow-[0_18px_45px_rgba(26,35,29,0.09)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#e9e8e3]">
        {image && !imageFailed ? (
          <Image
            alt={imageAlt}
            blurDataURL={imagePlaceholder}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
            fill
            onError={() => setImageFailed(true)}
            placeholder="blur"
            preload={priority}
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
            src={image.url}
          />
        ) : (
          <Image
            alt={copy.card.missingImage}
            className="object-cover"
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
            src="/images/vehicle-fallback.svg"
          />
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3.5">
          <span
            aria-label={copy.card.scoreOutOf(copy.card.dealScore, analysis.dealScore.value)}
            className="rounded-full border-2 border-[#4f8b63] bg-white/90 px-3 py-1 text-sm font-bold tabular-nums text-[#1f5737] shadow-sm backdrop-blur-md"
          >
            {analysis.dealScore.value}
          </span>
          <button
            aria-label={isFavorite ? copy.card.removeSaved : copy.card.saveCar}
            aria-pressed={isFavorite}
            className={`grid size-10 place-items-center rounded-full border shadow-sm backdrop-blur-md transition duration-200 hover:scale-105 active:scale-95 ${
              isFavorite
                ? "border-[#a84c45] bg-[#fff8f7] text-[#a84c45]"
                : "border-white/60 bg-white/85 text-[#26332b] hover:bg-white"
            }`}
            onClick={onToggleFavorite}
            type="button"
          >
            <HeartIcon className="size-[18px]" fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-[#737b75]">
          <span className="shrink-0">{identity.modelYear}</span>
          <span className="shrink-0 text-[#c5c8c4]">•</span>
          <span className="shrink-0">{numberFormatter.format(mileage)} {copy.card.mileageUnit}</span>
          <span className="shrink-0 text-[#c5c8c4]">•</span>
          <span className="truncate">{copy.filters.fuels[specification.powertrain.fuelType]}</span>
          <span className="shrink-0 text-[#c5c8c4]">•</span>
          <span className="truncate">{copy.filters.transmissions[specification.powertrain.transmission]}</span>
        </p>

        <div className="mt-3 flex min-w-0 items-start justify-between gap-3">
          <h2 className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-[1.2] tracking-[-0.035em] text-[#19231d]">
            {identity.make} {identity.model} {identity.variant}
          </h2>
          <p className="shrink-0 whitespace-nowrap text-xl font-semibold leading-none tracking-[-0.045em] text-[#17211b] sm:text-2xl">
            {moneyFormatter.format(askingPrice)}
          </p>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <ScoreChip
              explanation={copy.card.dealScoreHelp}
              label={copy.card.dealScore}
              locale={locale}
              tone="deal"
              value={analysis.dealScore.value}
            />
            <ScoreChip
              explanation={copy.card.confidenceHelp}
              label={copy.card.confidence}
              locale={locale}
              tone="confidence"
              value={analysis.buyConfidenceScore.value}
            />
          </div>
          <span
            aria-label={`${copy.card.marketValue}: ${moneyFormatter.format(marketValue)}`}
            className="group/market relative min-w-0 cursor-help rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#708b79] focus-visible:ring-offset-2"
            tabIndex={0}
          >
            {savings > 0 ? (
              <>
                <strong className="block text-xs font-semibold text-[#2b6a45]">
                  {copy.card.save} {moneyFormatter.format(savings)}
                </strong>
                <span className="mt-0.5 block text-[11px] text-[#737b75]">
                  {copy.card.belowMarket(marketDifferencePercent)}
                </span>
              </>
            ) : priceDifference < 0 ? (
              <span className="block text-xs font-medium text-[#8a6257]">
                {copy.card.aboveMarket(marketDifferencePercent)}
              </span>
            ) : (
              <span className="block text-xs font-medium text-[#647068]">
                {copy.card.atMarket}
              </span>
            )}
            {priceReduction > 0 ? (
              <span className="mt-0.5 block text-[10px] text-[#737b75]">
                {copy.card.reduced} {moneyFormatter.format(priceReduction)}
              </span>
            ) : null}
            <span
              className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] right-0 z-20 w-max max-w-56 translate-y-1 rounded-lg bg-[#17221c] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition duration-150 group-hover/market:translate-y-0 group-hover/market:opacity-100 group-focus-visible/market:translate-y-0 group-focus-visible/market:opacity-100"
              role="tooltip"
            >
              {copy.card.marketValue}: {moneyFormatter.format(marketValue)}
            </span>
          </span>
        </div>

        <div className="mt-auto flex min-w-0 items-end justify-between gap-4 pt-5">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-[#858c87]">
            <MapPinIcon className="size-3.5 shrink-0" />
            <span className="truncate">{sellerLocation}</span>
          </p>
          {financingOffer ? (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-medium text-[#8a918c]">
                {copy.card.financingFrom}
              </p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold text-[#303a34]">
                {moneyFormatter.format(financingOffer.amount)}{copy.card.perMonth}
              </p>
            </div>
          ) : null}
        </div>

        <a
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dfe2dc] bg-[#fbfcfa] text-sm font-semibold text-[#334139] transition hover:border-[#b9c5bb] hover:bg-[#f5f8f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#255e45] focus-visible:ring-offset-2 active:scale-[0.99]"
          href={listing.source.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {copy.card.viewListing}
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>
    </article>
  );
}
