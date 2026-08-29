"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  CloseIcon,
  CompareIcon,
  ExpandIcon,
  ExternalLinkIcon,
  ChevronLeftIcon,
  HeartIcon,
  MapPinIcon,
  MarketAnalysisIcon,
} from "@/features/search/icons";
import { setLocaleCookie } from "@/features/search/locale";
import { CompareTray } from "@/features/search/compare-tray";
import { SiteHeader } from "@/features/search/site-header";
import { useCompare } from "@/features/search/use-compare";
import { useCurrentLocation } from "@/features/search/use-current-location";
import { useFavorites } from "@/features/search/use-favorites";
import type { VehicleSearchResult } from "@/features/search/types";
import { estimateFuelConsumptionL100km, type ScoreFactor } from "@/domain/vehicle";
import { SourceLogo } from "@/features/source/source-logo";

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
    <div className="rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span
          className={`flex items-center gap-1.5 rounded-full border-2 bg-surface px-2.5 py-0.5 text-sm font-bold tabular-nums ${scoreTone(value)}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{summary}</p>
      {factors.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
          {factors.map((factor) => {
            const factorText = scoreFactorText(locale, factor);
            return (
              <li key={factor.key}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {factorText.label}
                  </span>
                  <div className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full rounded-full ${factorBarTone(factor.impact)}`}
                      style={{
                        width: `${Math.max(4, Math.min(100, factor.score))}%`,
                      }}
                    />
                  </div>
                  <span
                    aria-label={copy.detail.factorImpact[factor.impact]}
                    className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold ${factorChipTone(factor.impact)}`}
                  >
                    {copy.detail.factorTiers[factorTierIndex(factor.score)]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-subtle">
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeThumbnail = useRef<HTMLButtonElement | null>(null);
  const fullscreenCloseButton = useRef<HTMLButtonElement | null>(null);
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
  // The analysis page reads the same `make`/`model` parameters the search page
  // writes, so linking there needs no dedicated route — just this car's
  // identity in that shared vocabulary. Fuel and year are deliberately left
  // out: the question the link answers is how this *model* behaves, and
  // narrowing further would thin the sample the analysis runs on.
  const analysisHref = `/analysis?${new URLSearchParams({
    make: identity.make,
    model: identity.model,
  })}`;
  const images = listing.images.length > 0 ? listing.images : undefined;
  const currentImage = images?.[activeImage] ?? images?.[0];
  const imageCount = images?.length ?? 0;
  // Wraps in both directions, so the gallery has no dead end at either end.
  const stepImage = useCallback(
    (delta: number) =>
      setActiveImage((index) =>
        imageCount > 0 ? (index + delta + imageCount) % imageCount : 0,
      ),
    [imageCount],
  );
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

  // `nearest` scrolls the rail only when the selected thumbnail is actually
  // out of view, and never moves the page under the reader.
  useEffect(() => {
    activeThumbnail.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeImage]);

  const closeFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (imageCount < 2 && !isFullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isFullscreen) {
        closeFullscreen();
        return;
      }
      // Both axes step the gallery — vertical mirrors horizontal so either
      // hand position works.
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!forward && !backward) return;
      // Leave the arrows to whatever the reader is actually operating — a
      // select, a range slider, a text field — and only claim them when the
      // page itself has focus.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      if (imageCount < 2) return;
      event.preventDefault();
      stepImage(forward ? 1 : -1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageCount, stepImage, isFullscreen, closeFullscreen]);

  // Lock the page behind the fullscreen viewer while it is open, and move
  // focus into it so Escape and the close button are immediately reachable.
  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    fullscreenCloseButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isFullscreen]);

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

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          onClick={() => router.back()}
          type="button"
        >
          <ArrowRightIcon className="size-4 rotate-180" />
          {copy.detail.back}
        </button>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
        {/* min-w-0: on mobile this is a single implicit grid track, and without
            it the track takes its width from the thumbnail rail's full content
            width (a shrink-0 flex row) instead of the viewport, blowing the
            whole column out to ~1900px and zooming the photo. */}
        <div className="min-w-0">
          {/* 4/3 is what the source galleries mostly shoot, and `object-contain`
              keeps whatever they didn't whole: a buyer judging a car cannot be
              shown a cropped one, so an off-ratio photo gets bars on the muted
              surface rather than losing its roof and wheels. The old
              `aspect-[16/10] max-h-[380px]` pairing also let the box quietly
              grow wider than its own ratio once the column passed 608px, which
              turned `object-cover` into an increasingly severe centre crop.

              No max-height here on purpose: with a fixed ratio a height cap
              caps the width too, which left the frame standing short of the
              column with dead space beside it. The column decides the width
              and the ratio decides the height. */}
          {/* The thumbnails stand beside the photo rather than under it. The
              column's width has to go somewhere: spent on the photo it became
              height (a 4/3 frame across the whole column ran 570px tall and
              pushed the price below the fold), and spent on a rail it buys
              back ~75px of that while putting the other shots where the eye
              already is. The rail is absolutely positioned so its own content
              can never stretch the row — it takes the photo's height and
              scrolls inside it. */}
          <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-muted sm:mr-[6.25rem]">
            {currentImage ? (
              <Image
                alt={currentImage.alt ?? listing.title}
                className="object-contain"
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 60vw"
                src={currentImage.url}
              />
            ) : (
              /* The fallback is a drawing sized to the frame, not a car
                 someone needs to inspect, so it may fill it. */
              <Image
                alt={copy.card.missingImage}
                className="object-cover"
                fill
                sizes="(max-width: 1023px) 100vw, 60vw"
                src="/images/vehicle-fallback.svg"
              />
            )}
            {currentImage ? (
              <button
                aria-label={copy.detail.openFullscreen}
                className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                onClick={() => setIsFullscreen(true)}
                type="button"
              />
            ) : null}
            <div className="absolute right-3.5 top-3.5 z-10 flex items-center gap-2">
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
                    ? "border-negative bg-negative-soft text-negative"
                    : "border-surface/60 bg-surface/85 text-ink hover:bg-surface"
                }`}
                onClick={() => toggle(listing.id)}
                type="button"
              >
                <HeartIcon className="size-[18px]" fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </div>
            {currentImage ? (
              <button
                aria-label={copy.detail.openFullscreen}
                className="absolute bottom-3.5 right-3.5 z-10 grid size-10 place-items-center rounded-full border border-surface/60 bg-surface/85 text-ink shadow-sm backdrop-blur-md transition duration-200 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95"
                onClick={() => setIsFullscreen(true)}
                type="button"
              >
                <ExpandIcon className="size-[18px]" />
              </button>
            ) : null}
            {imageCount > 1 ? (
              <>
                {([
                  [-1, copy.detail.previousPhoto, "left-3.5", ""],
                  [1, copy.detail.nextPhoto, "right-3.5", "rotate-180"],
                ] as const).map(([delta, label, side, spin]) => (
                  <button
                    aria-label={label}
                    className={`absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-surface/60 bg-surface/85 text-ink shadow-sm backdrop-blur-md transition duration-200 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95 ${side}`}
                    key={delta}
                    onClick={() => stepImage(delta)}
                    type="button"
                  >
                    <ChevronLeftIcon className={`size-[18px] ${spin}`} />
                  </button>
                ))}
                <p
                  aria-live="polite"
                  className="absolute bottom-3.5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-surface/60 bg-surface/85 px-2.5 py-1 text-[11px] font-medium tabular-nums text-ink-muted shadow-sm backdrop-blur-md"
                >
                  {copy.detail.photoPosition(activeImage + 1, imageCount)}
                </p>
              </>
            ) : null}
          </div>
          {images && images.length > 1 ? (
            <div className="scrollbar-none mt-2.5 flex gap-2 overflow-x-auto pb-1 sm:absolute sm:inset-y-0 sm:right-0 sm:mt-0 sm:w-[5.5rem] sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:pb-0">
              {images.map((image, index) => (
                <button
                  // The button's only child is a decorative image, so without
                  // this it reached the accessibility tree unnamed — a row of
                  // anonymous buttons. `aria-current` marks which one is showing.
                  aria-current={index === activeImage ? "true" : undefined}
                  aria-label={copy.detail.photoPosition(index + 1, imageCount)}
                  className={`relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-2 transition sm:w-[5.5rem] ${
                    index === activeImage ? "ring-accent" : "ring-transparent hover:ring-border-strong"
                  }`}
                  key={image.url}
                  onClick={() => setActiveImage(index)}
                  ref={index === activeImage ? activeThumbnail : null}
                  type="button"
                >
                  <Image alt="" className="object-contain" fill sizes="88px" src={image.url} />
                </button>
              ))}
            </div>
          ) : null}
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-ink-muted">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-muted ring-1 ring-inset ring-border">
              <BrandLogo className="size-5.5" make={identity.make} />
            </span>
            <span>{identity.modelYear}</span>
            <span className="text-ink-subtle">•</span>
            <span>{numberFormatter.format(listing.mileageKm / 10)} {copy.card.mileageUnit}</span>
            <span className="text-ink-subtle">•</span>
            <span>{copy.filters.fuels[specification.powertrain.fuelType]}</span>
            <span className="text-ink-subtle">•</span>
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
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
              <MapPinIcon className="size-3.5 shrink-0" />
              {[listing.seller.name, listing.location.municipality].filter(Boolean).join(" · ")}
              {distanceKm !== undefined ? (
                <span className="font-medium text-accent">
                  · {copy.card.distanceAway(distanceKm)}
                </span>
              ) : null}
              <span className="text-ink-subtle">·</span>
              <span>
                {listingDateLabel}{" "}
                <time dateTime={listingDateValue} suppressHydrationWarning title={formatExactListingDate(listingDateValue, locale)}>
                  {formatRelativeListingDate(listingDateValue, locale)}
                </time>
              </span>
            </p>
          ) : null}

          {listing.description ? (
            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-muted sm:mt-6">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-5 rounded-2xl border border-border bg-surface-subtle p-4 sm:mt-6 sm:p-5">
            <h2 className="text-sm font-semibold text-ink">{copy.detail.specificationsTitle}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-subtle">{copy.filters.body}</dt>
                <dd className="font-medium text-ink">
                  {copy.filters.bodies[specification.bodyStyle]}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">{copy.filters.fuel}</dt>
                <dd className="font-medium text-ink">
                  {copy.filters.fuels[specification.powertrain.fuelType]}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">{copy.filters.transmission}</dt>
                <dd className="font-medium text-ink">
                  {copy.filters.transmissions[specification.powertrain.transmission]}
                </dd>
              </div>
              {specification.powertrain.drivetrain ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.drivetrain}</dt>
                  <dd className="font-medium text-ink">
                    {copy.filters.drivetrains[specification.powertrain.drivetrain]}
                  </dd>
                </div>
              ) : null}
              {specification.powertrain.engineDescription ||
              specification.powertrain.engineDisplacementCc ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.engine}</dt>
                  <dd className="font-medium text-ink">
                    {specification.powertrain.engineDescription ??
                      `${(specification.powertrain.engineDisplacementCc! / 1000).toFixed(1)} L`}
                  </dd>
                </div>
              ) : null}
              {specification.powertrain.powerHp ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.horsepower}</dt>
                  <dd className="font-medium text-ink">
                    {specification.powertrain.powerHp} hk
                  </dd>
                </div>
              ) : null}
              {specification.powertrain.fuelConsumption ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.fuelConsumption}</dt>
                  <dd className="font-medium text-ink">
                    {specification.powertrain.fuelConsumption}
                  </dd>
                </div>
              ) : estimatedFuelConsumption !== undefined ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.fuelConsumption}</dt>
                  <dd className="font-medium text-ink-muted">
                    {copy.detail.fuelConsumptionEstimated(
                      `${numberFormatter.format(estimatedFuelConsumption)} L/100 km`,
                    )}
                  </dd>
                </div>
              ) : null}
              {listing.ownerCount !== undefined ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.owners}</dt>
                  <dd className="font-medium text-ink">{listing.ownerCount}</dd>
                </div>
              ) : null}
              {listing.warranty?.included ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.warranty}</dt>
                  <dd className="font-medium text-ink">
                    {listing.warranty.description ?? copy.detail.warranty}
                  </dd>
                </div>
              ) : null}
              {vehicle.registrationNumber ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.registrationNumber}</dt>
                  <dd>
                    <a
                      className="inline-flex items-center gap-1 font-medium text-ink underline decoration-border-strong underline-offset-2 hover:text-ink"
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
                  <dt className="text-ink-subtle">{copy.detail.vin}</dt>
                  <dd className="font-medium text-ink">{vehicle.vin}</dd>
                </div>
              ) : null}
              {vehicle.firstRegistrationDate ? (
                <div>
                  <dt className="text-ink-subtle">{copy.detail.firstRegistration}</dt>
                  <dd className="font-medium text-ink">{vehicle.firstRegistrationDate}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {equipmentItems.length > 0 ? (
            <div className="mt-5 sm:mt-6">
              <h2 className="text-sm font-semibold text-ink">
                {copy.detail.equipmentTitle}
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {visibleEquipment.map((item) => (
                  <li className="flex items-start gap-2 text-sm text-ink-muted" key={item}>
                    <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
              {equipmentItems.length > equipmentPreviewCount ? (
                <button
                  className="mt-4 text-xs font-semibold text-ink-muted underline-offset-4 hover:underline"
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
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle sm:mt-6 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[0.99]"
            href={listing.source.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <SourceLogo interactive={false} locale={locale} provider={listing.source.provider} />
            {copy.card.viewListing}
            <ExternalLinkIcon className="size-3.5" />
          </a>
          <p className="mt-2 text-center text-[11px] text-ink-subtle">
            {locale === "en" ? "First observed" : "Först observerad"}: {formatExactListingDate(listing.source.firstSeenAt, locale)}
            {" · "}
            {locale === "en" ? "Last synchronized" : "Senast synkroniserad"}: {formatExactListingDate(listing.source.synchronizedAt, locale)}
          </p>
          {result.relatedSourceListings?.length ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2" aria-label={locale === "en" ? "Other exact source listings" : "Andra exakt matchade annonser"}>
              {result.relatedSourceListings.map((related) => (
                <a
                  className="relative z-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  href={related.url}
                  key={related.id}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <SourceLogo interactive={false} locale={locale} provider={related.provider} />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="max-w-[480px] space-y-2.5 sm:space-y-3">
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

          <div className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">{copy.detail.marketValueTitle}</h3>
            {hasMarketEstimate ? (
              <>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {moneyFormatter.format(analysis.marketValue.value.amount)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
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
            <p className="mt-2.5 text-xs text-ink-subtle">
              {marketValueExplanationText(locale, analysis.marketValue.comparableListingCount)}
            </p>
            {/* This was a 12px muted line under a paragraph — indistinguishable
                from the caption above it, and nobody who did not already know
                the analysis page existed would have found it. It is the one
                action this card leads to, so it looks like one. */}
            <Link
              className="mt-3.5 flex items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-sm font-semibold text-accent-strong transition hover:border-accent/50 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              href={analysisHref}
            >
              <MarketAnalysisIcon className="size-4" strokeWidth={2.1} />
              {copy.detail.analyseModel(`${identity.make} ${identity.model}`)}
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-ink">{copy.detail.ownershipCostTitle}</h3>
            <p className="mt-2 text-xl font-semibold text-ink">
              {moneyFormatter.format(analysis.ownershipCost.annualCost.amount)}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {copy.detail.ownershipCostCaption(analysis.ownershipCost.estimatedForAnnualDistanceKm)}
            </p>
            {analysis.ownershipCost.items.length > 0 ? (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                  {copy.detail.ownershipCostBreakdown}
                </p>
                <div className="mt-2.5 flex h-4 gap-[2px] bg-surface">
                  {analysis.ownershipCost.items.map((item, index) => (
                    <div
                      aria-label={`${copy.detail.ownershipCostCategories[item.category]}: ${moneyFormatter.format(item.annualCost.amount)}`}
                      className={`group/cost relative cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 ${ownershipCostCategoryTone(item.category)} ${
                        index === 0 ? "rounded-l-full" : ""
                      } ${index === analysis.ownershipCost.items.length - 1 ? "rounded-r-full" : ""}`}
                      key={item.category}
                      style={{ flexGrow: Math.max(item.annualCost.amount, 1) }}
                      tabIndex={0}
                    >
                      <span
                        className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-20 w-max max-w-56 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-surface opacity-0 shadow-lg transition duration-150 group-hover/cost:translate-y-0 group-hover/cost:opacity-100 group-focus-visible/cost:translate-y-0 group-focus-visible/cost:opacity-100"
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
                      <span className="flex items-center gap-2 text-ink-muted">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 shrink-0 rounded-full ${ownershipCostCategoryTone(item.category)}`}
                        />
                        {copy.detail.ownershipCostCategories[item.category]}
                      </span>
                      <span className="font-medium text-ink">
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

      {isFullscreen && currentImage ? (
        <div
          aria-label={currentImage.alt ?? listing.title}
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/50 backdrop-blur-md"
          onClick={closeFullscreen}
          role="dialog"
        >
          <button
            aria-label={copy.detail.closeFullscreen}
            className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full border border-surface/60 bg-surface/85 text-ink shadow-sm backdrop-blur-md transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95"
            onClick={closeFullscreen}
            ref={fullscreenCloseButton}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>

          {/* A plain <img> so the element is exactly the photo's rendered
              size: everything around it is bare backdrop, so a click anywhere
              but the photo itself dismisses the viewer. next/image `fill`
              can't size to content, which would leave the letterbox
              un-clickable. The file is already fetched by the inline gallery. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={currentImage.alt ?? listing.title}
            className="max-h-[88vh] max-w-[94vw] select-none object-contain"
            onClick={(event) => event.stopPropagation()}
            src={currentImage.url}
          />

          {imageCount > 1 ? (
            <>
              {([
                [-1, copy.detail.previousPhoto, "left-3 sm:left-5", ""],
                [1, copy.detail.nextPhoto, "right-3 sm:right-5", "rotate-180"],
              ] as const).map(([delta, label, side, spin]) => (
                <button
                  aria-label={label}
                  className={`absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-surface/60 bg-surface/85 text-ink shadow-sm backdrop-blur-md transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95 ${side}`}
                  key={delta}
                  onClick={(event) => {
                    event.stopPropagation();
                    stepImage(delta);
                  }}
                  type="button"
                >
                  <ChevronLeftIcon className={`size-5 ${spin}`} />
                </button>
              ))}
              <p
                aria-live="polite"
                className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-surface/60 bg-surface/85 px-3 py-1 text-xs font-medium tabular-nums text-ink-muted shadow-sm backdrop-blur-md"
              >
                {copy.detail.photoPosition(activeImage + 1, imageCount)}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
