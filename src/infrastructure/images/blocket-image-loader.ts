"use client";

const blocketImageHost = "https://images.blocketcdn.se/";
const waykeImageHost = "https://cdn.wayke.se/";
const waykeCfitWidths = [225, 380, 770, 800, 1170, 1920] as const;

function supportedWaykeCfitWidth(requestedWidth: number) {
  return (
    waykeCfitWidths.find((candidate) => candidate >= requestedWidth) ??
    waykeCfitWidths.at(-1)!
  );
}

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
    // Wayke's newer cfit/v3 endpoint rejects arbitrary widths with HTTP 400.
    // Next generates widths such as 256, 384, 640 and 828, while cfit/v3
    // accepts the source's fixed variants. Snap upward to the nearest variant
    // so the browser receives a real image instead of triggering the card's
    // missing-image fallback.
    if (url.pathname.startsWith("/cfit/v3/")) {
      url.searchParams.set("format", "webp");
      url.searchParams.set("w", String(supportedWaykeCfitWidth(width)));
    } else {
      url.searchParams.set("w", String(width));
    }
    return url.toString();
  }
  return src;
}
