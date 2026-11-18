import assert from "node:assert/strict";
import test from "node:test";
import { allowedListingUrl, checkHostListing, classifyHostListing } from "./host-availability";

const listing = { provider: "hedin", externalId: "car-123", listingUrl: "https://hedinautomotive.se/bilar/kop-bil/car-123" };
function html(availability = "InStock", url = listing.listingUrl) {
  return `<html><head><script id="__NEXT_DATA__" type="application/json">{}</script><link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify({
    "@type": "Car", name: "Test car", url, vehicleModelDate: 2021, offers: { price: 219900, availability: `https://schema.org/${availability}` },
  })}</script></head><body><h1>Test car</h1><aside>Recently sold cars</aside></body></html>`;
}

test("only positive original-host listing and price evidence confirms availability", () => {
  const result = classifyHostListing(listing, { status: 200, html: html(), url: listing.listingUrl });
  assert.equal(result.availability, "active");
  assert.equal(result.priceAmount, 219900);
  assert.equal(classifyHostListing(listing, { status: 200, html: "<html>" + "generic search page ".repeat(30) + "</html>", url: listing.listingUrl }).availability, "inconclusive");
});
test("sold and reserved primary offers cannot become recommendations", () => {
  assert.equal(classifyHostListing(listing, { status: 200, html: html("SoldOut"), url: listing.listingUrl }).availability, "missing");
  assert.equal(classifyHostListing(listing, { status: 200, html: html("Reserved"), url: listing.listingUrl }).availability, "reserved");
  assert.equal(classifyHostListing(listing, { status: 200, html: html() + "<span>Reserverad</span>", url: listing.listingUrl }).availability, "inconclusive");
});
test("blocked, challenged, throttled and failed responses never mean sold or active", () => {
  for (const status of [403, 429, 500, null]) assert.equal(classifyHostListing(listing, { status, html: html(), url: listing.listingUrl }).availability, "inconclusive");
  assert.equal(classifyHostListing(listing, { status: 200, html: html() + "challenge-platform", url: listing.listingUrl }).availability, "inconclusive");
});
test("original-host hard removal is distinguished from a different page", () => {
  assert.equal(classifyHostListing(listing, { status: 404, html: "", url: listing.listingUrl }).availability, "missing");
  assert.equal(classifyHostListing(listing, { status: 200, html: html("InStock", "https://hedinautomotive.se/bilar/kop-bil/other"), url: listing.listingUrl }).availability, "inconclusive");
});

test("a sold Autohero advert cannot be accepted just because its detail payload still renders", () => {
  const car = { provider: "autohero", externalId: "car-123", listingUrl: "https://www.autohero.com/se/volvo-v60/id/car-123/" };
  const page = (sold: boolean, id = car.externalId) => `<html><script>window.__APOLLO_STATE__ = ${JSON.stringify(JSON.stringify({ ROOT_QUERY: {
    'getCarDetailsStoreAd({"adId":"car-123"})': { adId: "car-123", price: { amountMinorUnits: 20000000, conversionMajor: 100 } },
    [`adDetailsAvailability({"adId":"${id}"})`]: { isAdDetailsAvailable: true, isSoldAdDetailsAvailable: sold },
    [`isSoldConclusively({"adId":"${id}"})`]: { soldConclusively: sold },
  } }))};</script></html>`;
  assert.equal(classifyHostListing(car, { status: 200, html: page(false), url: car.listingUrl }).availability, "active");
  assert.equal(classifyHostListing(car, { status: 200, html: page(true), url: car.listingUrl }).availability, "missing");
  assert.equal(classifyHostListing(car, { status: 200, html: page(false, "other-car"), url: car.listingUrl }).availability, "inconclusive");
});
test("availability requests never follow an off-host redirect or fetch an arbitrary URL", async () => {
  assert.equal(allowedListingUrl("hedin", "https://example.com/objekt/car-123"), null);
  assert.equal(allowedListingUrl("hedin", "http://hedinautomotive.se/bilar/kop-bil/car-123"), null);
  assert.equal(allowedListingUrl("hedin", "https://hedinautomotive.se:444/bilar/kop-bil/car-123"), null);
  let calls = 0;
  const fake: typeof fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }); };
  assert.equal((await checkHostListing(listing, fake)).availability, "inconclusive");
  assert.equal(calls, 1);
});

test("the retired Wayke source cannot issue availability requests", async () => {
  let calls = 0;
  const response = await checkHostListing({
    provider: "wayke", externalId: "old-ad", listingUrl: "https://www.wayke.se/objekt/old-ad",
  }, async () => { calls++; return new Response("unreachable"); });
  assert.equal(calls, 0);
  assert.equal(response.availability, "inconclusive");
});
