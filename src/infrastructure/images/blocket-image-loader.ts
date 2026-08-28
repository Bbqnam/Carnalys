"use client";

const blocketImageHost = "https://images.blocketcdn.se/";
const waykeImageHost = "https://cdn.wayke.se/";

/**
 * Custom `next/image` loader (wired up via `images.loaderFile`).
 *
 * Marketplace photos are served from Blocket/Wayke CDNs, which already resize
 * on demand via query parameters. Routing those
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
  if (src.startsWith(waykeImageHost)) {
    const url = new URL(src);
    url.searchParams.set("w", String(width));
    return url.toString();
  }
  return src;
}
