"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ListingImage } from "@/domain/vehicle";
import { ChevronLeftIcon } from "./icons";

const imagePlaceholder =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjUiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjUiIGZpbGw9IiNlN2U3ZTIiLz48L3N2Zz4=";
const resetDelayMs = 10_000;

interface VehicleImageCarouselProps {
  images: readonly ListingImage[];
  fallbackLabel: string;
  imageAlt: string;
  previousLabel: string;
  nextLabel: string;
  positionLabel: (index: number, total: number) => string;
  sizes: string;
  priority?: boolean;
  compact?: boolean;
  imageClassName?: string;
}

export function VehicleImageCarousel({
  images,
  fallbackLabel,
  imageAlt,
  previousLabel,
  nextLabel,
  positionLabel,
  sizes,
  priority = false,
  compact = false,
  imageClassName = "object-cover",
}: VehicleImageCarouselProps) {
  const [activeImage, setActiveImage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const imageCount = images.length;
  const activeIndex = imageCount > 0 ? activeImage % imageCount : 0;
  const currentImage = images[activeIndex];
  const currentPositionLabel = positionLabel(activeIndex + 1, imageCount);

  useEffect(() => {
    if (activeImage === 0) return;

    const resetTimer = window.setTimeout(() => setActiveImage(0), resetDelayMs);
    return () => window.clearTimeout(resetTimer);
  }, [activeImage]);

  function stepImage(delta: number) {
    if (imageCount < 2) return;
    setActiveImage((index) => (index + delta + imageCount) % imageCount);
  }

  return (
    <>
      {currentImage && !failedImages.has(currentImage.url) ? (
        <Image
          alt={currentImage.alt ?? imageAlt}
          blurDataURL={imagePlaceholder}
          className={imageClassName}
          fill
          key={`${activeIndex}-${currentImage.url}`}
          onError={() =>
            setFailedImages((failed) => new Set(failed).add(currentImage.url))
          }
          placeholder="blur"
          preload={priority && activeIndex === 0}
          sizes={sizes}
          src={currentImage.url}
        />
      ) : (
        /* Static local SVG — a plain <img> skips loader/srcset work for a
           single fallback asset. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={fallbackLabel}
          className="absolute inset-0 size-full object-cover"
          src="/images/vehicle-fallback.svg"
        />
      )}

      {imageCount > 1 ? (
        <>
          <button
            aria-label={previousLabel}
            className={`vehicle-gallery-arrow absolute left-2 top-1/2 z-20 grid -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95 ${compact ? "size-7" : "size-9"}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              stepImage(-1);
            }}
            type="button"
          >
            <ChevronLeftIcon className={compact ? "size-4" : "size-5"} />
          </button>
          <button
            aria-label={nextLabel}
            className={`vehicle-gallery-arrow absolute right-2 top-1/2 z-20 grid -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95 ${compact ? "size-7" : "size-9"}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              stepImage(1);
            }}
            type="button"
          >
            <ChevronLeftIcon className={`rotate-180 ${compact ? "size-4" : "size-5"}`} />
          </button>
          <p
            aria-live="polite"
            className={`absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/35 bg-black/60 font-semibold tabular-nums text-white shadow-sm backdrop-blur-sm ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"}`}
          >
            <span aria-hidden="true">{activeIndex + 1} / {imageCount}</span>
            <span className="sr-only">{currentPositionLabel}</span>
          </p>
        </>
      ) : null}
    </>
  );
}
