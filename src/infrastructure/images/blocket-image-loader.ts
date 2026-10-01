"use client";

const blocketImageHost = "https://images.blocketcdn.se/";
const waykeImageHost = "https://cdn.wayke.se/";
const hedinImageHost = "https://cdne-cdn-prod-polaris-prod.azureedge.net/";
const waykeCfitWidths = [225, 380, 770, 800, 1170, 1920] as const;

function appendWidth(url: string, width: number, parameter = "width") {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${parameter}=${width}`;
}

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
 * Hedin's Polaris CDN exposes fixed thumbnail/preview/enlarged files and Imgix
 * accepts normal width parameters. Anything else is a small static asset, so
 * it remains a pass-through response with a responsive-candidate cache key.
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
  if (src.startsWith(hedinImageHost)) {
    // Polaris exposes real 200px thumbnail, 700px preview and 1920px enlarged
    // files rather than a query-driven resize API. Select the smallest source
    // that covers Next's requested width; this cuts a typical result-card image
    // from ~265 kB to ~52 kB while preserving the enlarged detail image.
    const variant = width <= 256 ? "thumbnail" : width <= 700 ? "preview" : "enlarged";
    const selected = src.replace(/-(?:thumbnail|preview|enlarged)(\.[a-z0-9]+)(?:\?.*)?$/i, `-${variant}$1`);
    return appendWidth(selected, width);
  }
  if (src.startsWith("https://vl.imgix.net/")) {
    const url = new URL(src);
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "max");
    url.searchParams.set("w", String(width));
    return url.toString();
  }

  // Static imports and the few remaining remote marks cannot be resized by
  // their origin. Keep them as pass-through assets, but make the selected
  // responsive candidate explicit so Next does not treat the loader as broken.
  return appendWidth(src, width);
}
