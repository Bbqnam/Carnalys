import type { HostAvailability, HostAvailabilityEvidence } from "@/domain/market/listing-availability";
import { classifyBlocketListingPage } from "./blocket-unofficial/availability";
import { parseListingPageSpecifications } from "./blocket-unofficial/listing-page-parser";
import { parseWaykeDetailPage } from "./wayke/parser";
import { parseBytbilDetailPage } from "./bytbil/parser";
import { parseHedinDetailPage } from "./hedin/parser";
import { parseAutoheroDetailPage, parseAutoheroHostState } from "./autohero/parser";

const hosts: Record<string, readonly string[]> = {
  blocket_unofficial: ["www.blocket.se", "blocket.se"],
  wayke: ["www.wayke.se", "wayke.se"],
  bytbil: ["www.bytbil.com", "bytbil.com"],
  hedin: ["hedinautomotive.se", "www.hedinautomotive.se"],
  autohero: ["www.autohero.com", "autohero.com"],
};

export interface HostListing { provider: string; externalId: string; listingUrl: string }

export function allowedListingUrl(provider: string, value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !hosts[provider]?.includes(url.hostname)) return null;
    const paths: Record<string, RegExp> = {
      blocket_unofficial: /^\/(?:mobility\/)?(?:item|annons)\//,
      wayke: /^\/objekt\//,
      bytbil: /^\/(?!bil\/?$|api\/|car\/).+/,
      hedin: /^\/bilar\/kop-bil\/(?!begagnade-bilar-i-lager).+/,
      autohero: /^\/se\/.+\/id\/.+/,
    };
    return paths[provider]?.test(url.pathname) ? url : null;
  } catch { return null; }
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function structuredCar(html: string): JsonObject | undefined {
  const visit = (value: unknown): JsonObject | undefined => {
    if (Array.isArray(value)) return value.map(visit).find(Boolean);
    const row = object(value);
    if (!row) return undefined;
    const types = Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]];
    if (types.some(type => type === "Car" || type === "Vehicle" || type === "Product") && row.offers) return row;
    return visit(row["@graph"]);
  };
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const car = visit(JSON.parse(match[1])); if (car) return car; } catch { /* unrelated malformed JSON */ }
  }
  return undefined;
}

function comparablePath(value: string) {
  try { return decodeURIComponent(new URL(value).pathname).replace(/\/+$/, "").toLowerCase(); } catch { return ""; }
}

/** Evidence must describe the main requested advert, not a recommendation rail. */
export function classifyHostListing(
  listing: HostListing,
  response: { status: number | null; html: string; url: string },
  now = new Date(),
): HostAvailabilityEvidence {
  const result = (availability: HostAvailability, reason: string, priceAmount?: number): HostAvailabilityEvidence => ({
    availability, reason, checkedAt: now.toISOString(), url: response.url,
    httpStatus: response.status, ...(priceAmount == null ? {} : { priceAmount }),
  });
  const { status, html } = response;
  if (!allowedListingUrl(listing.provider, response.url)) return result("inconclusive", "Unexpected original-host URL");
  if (status == null || [401, 403, 408, 425, 429].includes(status) || status >= 500) {
    return result("inconclusive", `Original host unavailable or blocked (${status ?? "transport"})`);
  }
  if (/cf-chl-|challenge-platform|verify you are human|captcha-container/i.test(html)) {
    return result("inconclusive", "Original host returned an access challenge");
  }
  if (status === 404 || status === 410) return result("missing", `Original host returned HTTP ${status}`);
  if (status < 200 || status >= 300 || html.length < 100) return result("inconclusive", "No complete listing page");

  if (listing.provider === "blocket_unofficial") {
    const verdict = classifyBlocketListingPage(status, html);
    if (verdict.availability === "missing") return result("missing", verdict.reason);
  }
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1].replace(/<[^>]*>/g, " ").trim() ?? "";
  if (/^(?:(?:den h[äa]r |denna )?(?:annons(?:en)?|bil(?:en)?|fordon(?:et)?)\s+(?:[äa]r\s+)?(?:s[åa]ld|borttagen|inte l[äa]ngre tillg[äa]nglig)|annonsen (?:finns inte|har tagits bort))/i.test(heading)) {
    return result("missing", "The main listing heading says sold or removed");
  }
  if (/^(?:(?:den h[äa]r |denna )?bil(?:en)?\s+(?:[äa]r\s+)?reserverad)/i.test(heading)) {
    return result("reserved", "The main listing heading says reserved");
  }
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ??
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  if (canonical && comparablePath(canonical) !== comparablePath(listing.listingUrl)) {
    return result("inconclusive", "Page canonical identifies a different advert");
  }
  if (comparablePath(response.url) !== comparablePath(listing.listingUrl)) {
    return result("inconclusive", "The advert redirected to a different page");
  }
  const car = structuredCar(html);
  const offers = object(Array.isArray(car?.offers) ? car.offers[0] : car?.offers);
  if (typeof car?.url === "string" && comparablePath(car.url) !== comparablePath(listing.listingUrl)) {
    return result("inconclusive", "Structured data identifies a different advert");
  }
  const availability = String(offers?.availability ?? "").split("/").pop()?.toLowerCase();
  if (["soldout", "outofstock", "discontinued"].includes(availability ?? "")) return result("missing", "Main offer is no longer in stock");
  if (["reserved", "preorder"].includes(availability ?? "")) return result("reserved", "Main offer is reserved or not immediately available");
  const rendered = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  if (/>\s*(?:(?:den h[äa]r |denna )?bil(?:en)?\s+(?:[äa]r\s+)?)?(?:s[åa]ld|reserverad|sold|reserved)\s*</i.test(rendered)) {
    // A rendered badge may belong to the main advert or a related-card rail.
    // Withhold the recommendation; do not retire a car on ambiguous text.
    return result("inconclusive", "A rendered sold/reserved badge prevents an unambiguous availability confirmation");
  }

  try {
    const parse = {
      wayke: parseWaykeDetailPage, bytbil: parseBytbilDetailPage,
      hedin: parseHedinDetailPage, autohero: parseAutoheroDetailPage,
    }[listing.provider];
    const detail = parse?.(html);
    const raw = object(detail?.raw);
    const product = object(raw?.product) ?? object(raw?.car) ?? raw;
    const sourceId = product?.adId ?? product?.car_id ?? product?._id ?? product?.id;
    if (sourceId != null && String(sourceId).toLowerCase() !== listing.externalId.toLowerCase()) {
      return result("inconclusive", "Main listing identifier does not match the requested advert");
    }
    const sourceStatus = String(product?.status ?? product?.availability ?? product?.car_status ?? "").toLowerCase();
    if (product?.isSold === true || product?.is_sold === true) return result("missing", "Main advert is explicitly sold");
    if (product?.isReserved === true || product?.is_reserved === true) return result("reserved", "Main advert is explicitly reserved");
    if (/^(sold|removed|deleted|unpublished|deactivated|s[åa]ld)$/.test(sourceStatus)) return result("missing", "Main advert is explicitly sold or unpublished");
    if (/^(reserved|reserverad)$/.test(sourceStatus)) return result("reserved", "Main advert is reserved");
    if (listing.provider === "autohero") {
      const state = parseAutoheroHostState(html, listing.externalId);
      if (state.sold) return result("missing", "The original host confirms the requested car is sold");
      if (!state.available) return result("inconclusive", "The original host does not confirm this advert is available");
    }
    const price = detail?.priceAmount ?? (offers?.price == null ? undefined : Number(offers.price));
    const positiveListing = detail != null || (listing.provider === "blocket_unofficial" && (car != null || Object.keys(parseListingPageSpecifications(html)).length >= 3));
    if (!positiveListing || !Number.isFinite(price) || !(price! > 0)) return result("inconclusive", "No identifiable main advert with a current asking price");
    return result("active", "Original host renders the requested vehicle and its current asking price", Math.round(price!));
  } catch { return result("inconclusive", "Original host listing data could not be parsed"); }
}

export async function checkHostListing(listing: HostListing, fetchImpl: typeof fetch = fetch, now = new Date()) {
  let url = allowedListingUrl(listing.provider, listing.listingUrl);
  if (!url) return classifyHostListing(listing, { status: null, html: "", url: listing.listingUrl }, now);
  try {
    const signal = AbortSignal.timeout(8_000);
    for (let hop = 0; hop < 3; hop++) {
      const response: Response = await fetchImpl(url, {
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "CarnalysAvailability/1.0" },
        redirect: "manual", cache: "no-store", signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location: string | null = response.headers.get("location");
        url = location ? allowedListingUrl(listing.provider, new URL(location, url).toString()) : null;
        if (!url) break;
        continue;
      }
      const html = await response.text();
      return classifyHostListing(listing, { status: response.status, html: html.slice(0, 5_000_000), url: url.toString() }, now);
    }
  } catch { /* Never equate a failed request with a sold car. */ }
  return { availability: "inconclusive" as const, reason: "Original host could not be verified", checkedAt: now.toISOString(), url: listing.listingUrl, httpStatus: null };
}
