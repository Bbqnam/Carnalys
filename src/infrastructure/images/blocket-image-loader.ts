"use client";

const blocketImageHost = "https://images.blocketcdn.se/";

/**
 * Custom `next/image` loader (wired up via `images.loaderFile`).
 *
 * Every listing photo in the catalog is served from Blocket's own CDN, which
 * already resizes on demand via a `?width=` query parameter. Routing those
 * through Vercel's Image Optimization instead burns one billed transformation
 * per unique (image, width) pair — and with ~450k listing images that churn
 * daily as listings come and go, that cost is unbounded and will exhaust any
 * quota no matter how it's tuned. Delegating the resize to Blocket keeps
 * correctly-sized, responsive images while costing us nothing.
 *
 * Anything else (the brand mark, the local SVG fallback) is a handful of
 * small static assets, so it's served straight from /public rather than
 * optimized — the SVG isn't optimizable anyway, and the mark renders at 36px.
 */
export default function blocketImageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  if (src.startsWith(blocketImageHost)) {
    return `${src}?width=${width}`;
  }
  return src;
}
