import assert from "node:assert/strict";
import test from "node:test";
import { classifyBlocketAvailability, classifyBlocketListingPage } from "./availability";
import { BlocketUnofficialClient } from "./client";

const activeBody = JSON.stringify({
  url: "https://www.blocket.se/mobility/item/25527952",
  title: "Volvo V90",
  subtitle: "D3 Geartronic",
  model_year: "2018",
  mileage: "14 115 mil",
  transmission: "Automatisk",
  price: "205 000 kr",
  seller_type: "private",
  ad_id: "25527952",
});

test("active: a valid advert payload for the requested id", () => {
  const v = classifyBlocketAvailability({ requestedId: "25527952", status: 200, bodyText: activeBody });
  assert.equal(v.availability, "active");
});

test("missing: the service itself returns HTTP 404", () => {
  const v = classifyBlocketAvailability({ requestedId: "1", status: 404, bodyText: "Not Found" });
  assert.equal(v.availability, "missing");
});

test("missing: the service itself returns HTTP 410", () => {
  const v = classifyBlocketAvailability({ requestedId: "1", status: 410, bodyText: "" });
  assert.equal(v.availability, "missing");
});

test("missing: HTTP 200 body proving an upstream Blocket 404", () => {
  const body = JSON.stringify({
    error:
      "Client error '404 Not Found' for url 'https://www.blocket.se/mobility/item/1'\nFor more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404",
  });
  const v = classifyBlocketAvailability({ requestedId: "1", status: 200, bodyText: body });
  assert.equal(v.availability, "missing");
});

test("missing: HTTP 200 body proving an upstream Blocket 410", () => {
  const body = JSON.stringify({
    error: "Client error '410 Gone' for url 'https://www.blocket.se/mobility/item/999'",
  });
  const v = classifyBlocketAvailability({ requestedId: "999", status: 200, bodyText: body });
  assert.equal(v.availability, "missing");
});

test("missing: HTTP 200 body with explicit removed wording", () => {
  const body = JSON.stringify({ message: "Annonsen är borttagen" });
  const v = classifyBlocketAvailability({ requestedId: "42", status: 200, bodyText: body });
  assert.equal(v.availability, "missing");
});

test("inconclusive: HTTP 200 with an unknown error", () => {
  const body = JSON.stringify({ error: "Upstream connection reset" });
  const v = classifyBlocketAvailability({ requestedId: "42", status: 200, bodyText: body });
  assert.equal(v.availability, "inconclusive");
});

test("inconclusive: invalid JSON", () => {
  const v = classifyBlocketAvailability({ requestedId: "42", status: 200, bodyText: "<html>502 Bad Gateway</html>" });
  assert.equal(v.availability, "inconclusive");
});

test("inconclusive: an empty response body", () => {
  const v = classifyBlocketAvailability({ requestedId: "42", status: 200, bodyText: "" });
  assert.equal(v.availability, "inconclusive");
});

test("inconclusive: a request timeout / transport failure", () => {
  const v = classifyBlocketAvailability({ requestedId: "42", status: null, bodyText: null, transportFailed: true });
  assert.equal(v.availability, "inconclusive");
});

test("inconclusive: rate limiting (HTTP 429)", () => {
  const v = classifyBlocketAvailability({ requestedId: "42", status: 429, bodyText: "Too Many Requests" });
  assert.equal(v.availability, "inconclusive");
});

test("inconclusive: a server failure (HTTP 503)", () => {
  const v = classifyBlocketAvailability({ requestedId: "42", status: 503, bodyText: "unavailable" });
  assert.equal(v.availability, "inconclusive");
});

test("inconclusive: a malformed identifier rejected with HTTP 422", () => {
  const body = JSON.stringify({ detail: [{ type: "int_parsing", msg: "not an integer" }] });
  const v = classifyBlocketAvailability({ requestedId: "abc", status: 422, bodyText: body });
  assert.equal(v.availability, "inconclusive");
});

test("never active: HTTP 200 without advert fields", () => {
  const v = classifyBlocketAvailability({ requestedId: "42", status: 200, bodyText: JSON.stringify({ ok: true }) });
  assert.equal(v.availability, "inconclusive");
});

test("never active: HTTP 200 advert payload for a different id", () => {
  const v = classifyBlocketAvailability({ requestedId: "111", status: 200, bodyText: activeBody });
  assert.equal(v.availability, "inconclusive");
});

// The client wrapper maps transport-level failures to "inconclusive" and reads
// the body for 2xx responses, using an injected fetch.
function response(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

test("client: reads the 200 body and reports missing for an upstream 404", async () => {
  const client = new BlocketUnofficialClient("https://blocket-api.se", async () =>
    response(200, JSON.stringify({ error: "Client error '404 Not Found' for url 'https://www.blocket.se/mobility/item/1'" })),
  );
  assert.equal(await client.checkCarAvailability("1"), "missing");
});

test("client: reports active for a real advert payload", async () => {
  const client = new BlocketUnofficialClient("https://blocket-api.se", async () => response(200, activeBody));
  assert.equal(await client.checkCarAvailability("25527952"), "active");
});

test("client: a thrown fetch (timeout) is inconclusive", async () => {
  const client = new BlocketUnofficialClient("https://blocket-api.se", async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  });
  assert.equal(await client.checkCarAvailability("25527952"), "inconclusive");
});

// --- layered checkListingAvailability: proxy first, then the real ad page ---

const LISTING_URL = "https://www.blocket.se/annons/stockholm/volvo_v90/25527952";
const DEACTIVATED_PAGE = `<html><body>${"x".repeat(400)}<h3 class="t4">Den här annonsen är inte längre tillgänglig Varan har sålts eller tagits bort från marknaden av säljaren.</h3></body></html>`;
const LIVE_PAGE = `<html><head><title>Volvo V90 | BLOCKET</title></head><body>${"live listing markup ".repeat(60)}</body></html>`;

/** Injected fetch that answers the proxy id endpoint and the ad page separately. */
function routedFetch(handlers: {
  api: () => Response | Promise<Response> | never;
  page: () => Response | Promise<Response> | never;
}): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === "string" ? input : input.toString();
    return url.includes("/v1/ad/car") ? handlers.api() : handlers.page();
  }) as typeof fetch;
}

test("layered: proxy serves cached advert but the ad page says sold/removed -> missing/deactivated", async () => {
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({ api: () => response(200, activeBody), page: () => new Response(DEACTIVATED_PAGE, { status: 200 }) }),
  );
  const v = await client.checkListingAvailability({ externalId: "25527952", listingUrl: LISTING_URL });
  assert.equal(v.availability, "missing");
  assert.equal(v.missingKind, "deactivated");
  assert.equal(v.via, "page");
});

test("layered: proxy advert + a live ad page -> active", async () => {
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({ api: () => response(200, activeBody), page: () => new Response(LIVE_PAGE, { status: 200 }) }),
  );
  const v = await client.checkListingAvailability({ externalId: "25527952", listingUrl: LISTING_URL });
  assert.equal(v.availability, "active");
});

test("layered: proxy 200 body proving an upstream 404 -> missing/purged without fetching the page", async () => {
  let pageFetched = false;
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({
      api: () => response(200, JSON.stringify({ error: "Client error '404 Not Found' for url 'https://www.blocket.se/mobility/item/1'" })),
      page: () => {
        pageFetched = true;
        return new Response(LIVE_PAGE, { status: 200 });
      },
    }),
  );
  const v = await client.checkListingAvailability({ externalId: "1", listingUrl: LISTING_URL });
  assert.equal(v.availability, "missing");
  assert.equal(v.missingKind, "purged");
  assert.equal(v.via, "api");
  assert.equal(pageFetched, false);
});

test("layered: proxy advert + ad page HTTP 404 -> missing/purged via page", async () => {
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({ api: () => response(200, activeBody), page: () => new Response("Sidan hittades inte", { status: 404 }) }),
  );
  const v = await client.checkListingAvailability({ externalId: "25527952", listingUrl: LISTING_URL });
  assert.equal(v.availability, "missing");
  assert.equal(v.missingKind, "purged");
  assert.equal(v.via, "page");
});

test("layered: proxy advert + ad page HTTP 503 -> active (page inconclusive, proxy wins)", async () => {
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({ api: () => response(200, activeBody), page: () => new Response("upstream", { status: 503 }) }),
  );
  const v = await client.checkListingAvailability({ externalId: "25527952", listingUrl: LISTING_URL });
  assert.equal(v.availability, "active");
});

test("layered: proxy advert + ad page fetch throws (timeout) -> active", async () => {
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({
      api: () => response(200, activeBody),
      page: () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    }),
  );
  const v = await client.checkListingAvailability({ externalId: "25527952", listingUrl: LISTING_URL });
  assert.equal(v.availability, "active");
});

test("layered: proxy inconclusive + ad page inconclusive -> inconclusive", async () => {
  const client = new BlocketUnofficialClient(
    "https://blocket-api.se",
    routedFetch({ api: () => response(503, "unavailable"), page: () => new Response("upstream", { status: 503 }) }),
  );
  const v = await client.checkListingAvailability({ externalId: "25527952", listingUrl: LISTING_URL });
  assert.equal(v.availability, "inconclusive");
});

// --- real Blocket ad-page classifier ---

test("page: HTTP 404 is a purged listing", () => {
  const v = classifyBlocketListingPage(404, "Sidan hittades inte");
  assert.equal(v.availability, "missing");
  assert.equal(v.missingKind, "purged");
});

test("page: the deactivated notice is a sold/removed listing", () => {
  const html = `<html><body>${"x".repeat(400)}<h3 class="t4">Den här annonsen är inte längre tillgänglig Varan har sålts eller tagits bort från marknaden av säljaren.</h3></body></html>`;
  const v = classifyBlocketListingPage(200, html);
  assert.equal(v.availability, "missing");
  assert.equal(v.missingKind, "deactivated");
});

test("page: a normal live listing is active", () => {
  const html = `<html><head><title>Begagnad bil till salu: Volvo V60 | BLOCKET</title></head><body>${"live listing markup ".repeat(60)}</body></html>`;
  const v = classifyBlocketListingPage(200, html);
  assert.equal(v.availability, "active");
});

test("page: 5xx / 429 / transport failure are inconclusive, never missing", () => {
  assert.equal(classifyBlocketListingPage(503, "x".repeat(300)).availability, "inconclusive");
  assert.equal(classifyBlocketListingPage(429, "x".repeat(300)).availability, "inconclusive");
  assert.equal(classifyBlocketListingPage(null, null, true).availability, "inconclusive");
});
