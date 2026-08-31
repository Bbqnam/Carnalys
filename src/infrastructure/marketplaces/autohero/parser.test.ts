import assert from "node:assert/strict";
import test from "node:test";
import {
  autoheroSummaryFingerprint,
  parseAutoheroDetailData,
  parseAutoheroDetailPage,
  parseAutoheroSearchResponse,
} from "./parser";

const adId = "894fd37c-eadc-4551-a9c8-74d5b8ec2dcf";

function searchAd(overrides: Record<string, unknown> = {}) {
  return {
    id: adId,
    stockNumber: "PP87807",
    carUrlTitle: "volvo-v-90",
    manufacturer: "Volvo",
    model: "V90",
    subType: "2.0 D4",
    subTypeExtra: "Momentum AWD",
    builtYear: 2019,
    firstRegistrationYear: 2019,
    registration: "20190215T000000.000Z",
    mileage: { distance: 136300, unit: "KM" },
    offerPrice: { amountMinorUnits: 23100000, conversionMajor: 100, currency: "SEK" },
    previousPrice: { amountMinorUnits: 23200000, conversionMajor: 100, currency: "SEK" },
    monthlyPayment: { amountMinorUnits: 245700, conversionMajor: 100, currency: "SEK" },
    fuelType: 1040,
    gearType: 1139,
    driveTrain: "all-wheel-drive",
    isPluginSystem: false,
    kw: 140,
    ccm: 1969,
    co2Value: 172,
    fuelConsumption: { combined: 6.6 },
    carPreownerCount: 2,
    hasFilledServiceBook: false,
    esBranch: { city: "Stockholm", zipcode: "195 61", name: "Autohero Center Stockholm Arlandastad" },
    firstPublishedAt: "20260630T113335.000Z",
    publishedAt: "20260706T085101.000Z",
    mainImageUrl: "https://img-eu-c1.autohero.com/img/HASH/exterior/1/{size}file.jpg",
    usps: ["all-wheel-drive"],
    ...overrides,
  };
}

function searchBody(ads: unknown[], total = ads.length) {
  return JSON.stringify({ data: { searchAdV9AdsV2: { total, data: ads } } });
}

test("search response maps a well-formed ad", () => {
  const page = parseAutoheroSearchResponse(searchBody([searchAd()]), 0, 24);
  assert.equal(page.rejectedCount, 0);
  assert.equal(page.totalMatches, 1);
  const [doc] = page.documents;
  assert.equal(doc.id, adId);
  assert.equal(doc.slug, "volvo-v-90");
  assert.equal(doc.priceAmount, 231000);
  assert.equal(doc.previousPriceAmount, 232000);
  assert.equal(doc.monthlyCostAmount, 2457);
  assert.equal(doc.mileageKm, 136300);
  assert.equal(doc.modelYear, 2019);
  assert.equal(doc.fuelTypeId, 1040);
  assert.equal(doc.gearTypeId, 1139);
  assert.equal(doc.isPluginSystem, false);
  assert.equal(doc.ownerCount, 2);
  assert.equal(doc.city, "Stockholm");
  assert.equal(doc.featuredImageUrl, "https://img-eu-c1.autohero.com/img/HASH/exterior/1/1116x744-file.jpg");
  assert.equal(doc.firstPublishedAt?.toISOString(), "2026-06-30T11:33:35.000Z");
});

test("previousPrice is only kept when it is above the current price", () => {
  const higher = parseAutoheroSearchResponse(searchBody([searchAd()])).documents[0];
  assert.equal(higher.previousPriceAmount, 232000);
  const lower = parseAutoheroSearchResponse(
    searchBody([searchAd({ previousPrice: { amountMinorUnits: 22000000, conversionMajor: 100 } })]),
  ).documents[0];
  assert.equal(lower.previousPriceAmount, undefined);
});

test("single-owner USP overrides the pre-owner count", () => {
  const doc = parseAutoheroSearchResponse(
    searchBody([searchAd({ usps: ["single-owner"], carPreownerCount: 3 })]),
  ).documents[0];
  assert.equal(doc.ownerCount, 1);
});

test("entries missing required fields are rejected, not thrown", () => {
  const page = parseAutoheroSearchResponse(
    searchBody([searchAd(), { id: "x", carUrlTitle: "y" }], 2),
  );
  assert.equal(page.documents.length, 1);
  assert.equal(page.rejectedCount, 1);
});

test("a GraphQL error body pauses the import", () => {
  assert.throws(
    () => parseAutoheroSearchResponse(JSON.stringify({ errors: [{ message: "Bad request" }] })),
    /sök-API svarade med fel/,
  );
});

test("an unrecognised body shape pauses the import", () => {
  assert.throws(
    () => parseAutoheroSearchResponse(JSON.stringify({ data: { searchAdV9AdsV2: null } })),
    /förväntad struktur/,
  );
});

const detailAd = {
  __typename: "CarDetailsStoreAdProjection",
  adId,
  manufacturer: "Volvo",
  model: "V90",
  subType: "2.0 D4",
  subTypeExtra: "Momentum AWD",
  bodyType: "Kombi",
  vin: "yv1pwa8uck1105690",
  licensePlate: "CGY 22E",
  fuelType: "Diesel",
  gearType: "Automatisk växellåda\r\n",
  drivetrain: "all-wheel-drive",
  color: { outside: "Grå" },
  doorCount: 5,
  seatCount: 5,
  horsePower: 190,
  ccm: 1969,
  fuelConsumption: { combined: 6.6 },
  mileage: { distance: 136300, unit: "KM" },
  price: { amountMinorUnits: 23100000, conversionMajor: 100 },
  carPreownerCount: 2,
  hasFilledServiceBook: false,
  serviceHistory: { records: [{ __ref: "x" }, { __ref: "y" }] },
  features: [
    { categoryName: "highlights", items: [{ description: "Android Auto" }, { description: "Apple CarPlay" }] },
    { categoryName: "comfort", items: [{ description: "Klimatanläggning" }, { description: "Android Auto" }] },
  ],
  carDetailsImageComposites: {
    exterior: [
      { fullUrl: "https://img-eu-c1.autohero.com/img/HASH/exterior/1/{size}a.jpg", order: 0 },
      { fullUrl: "https://img-eu-c1.autohero.com/img/HASH/exterior/2/{size}b.jpg", order: 1 },
    ],
    interior: [{ fullUrl: "https://img-eu-c1.autohero.com/img/HASH/interior/1/{size}c.jpg", order: 0 }],
    damages: [{ fullUrl: "https://img-eu-c1.autohero.com/img/HASH/damage/1/{size}d.jpg", order: 0 }],
  },
  usps: ["all-wheel-drive"],
};

function detailHtml(ad: unknown = detailAd) {
  const state = JSON.stringify(
    JSON.stringify({
      ROOT_QUERY: {
        __typename: "Query",
        [`getCarDetailsStoreAd({"adId":"${adId}","locale":"sv-SE"})`]: ad,
      },
    }),
  );
  return `<!doctype html><script>window.__APOLLO_STATE__ = ${state};</script>`;
}

test("detail page yields VIN, registration, body and equipment", () => {
  const detail = parseAutoheroDetailPage(detailHtml());
  assert.equal(detail.vin, "YV1PWA8UCK1105690");
  assert.equal(detail.registrationNumber, "CGY22E");
  assert.equal(detail.bodyType, "Kombi");
  assert.equal(detail.horsepower, 190);
  assert.deepEqual(detail.equipment, ["Android Auto", "Apple CarPlay", "Klimatanläggning"]);
});

test("detail gallery resolves the size token and drops damage shots", () => {
  const detail = parseAutoheroDetailPage(detailHtml());
  assert.deepEqual(detail.images, [
    "https://img-eu-c1.autohero.com/img/HASH/exterior/1/1116x744-a.jpg",
    "https://img-eu-c1.autohero.com/img/HASH/exterior/2/1116x744-b.jpg",
    "https://img-eu-c1.autohero.com/img/HASH/interior/1/1116x744-c.jpg",
  ]);
});

test("service history maps from the filled-book flag and record list", () => {
  assert.equal(parseAutoheroDetailData({ ...detailAd, hasFilledServiceBook: true }).serviceHistory, "complete");
  assert.equal(
    parseAutoheroDetailData({ ...detailAd, hasFilledServiceBook: false, serviceHistory: { records: [] } }).serviceHistory,
    "missing",
  );
  assert.equal(parseAutoheroDetailData(detailAd).serviceHistory, "partial");
});

test("a detail page without the ad node pauses enrichment", () => {
  assert.throws(() => parseAutoheroDetailPage("<html><body>no state</body></html>"), /siddata/);
  assert.throws(() => parseAutoheroDetailPage(detailHtml({ nothing: true })), /getCarDetailsStoreAd/);
});

test("summary fingerprint changes when the price moves", () => {
  const base = parseAutoheroSearchResponse(searchBody([searchAd()])).documents[0];
  const moved = parseAutoheroSearchResponse(
    searchBody([searchAd({ offerPrice: { amountMinorUnits: 22500000, conversionMajor: 100 } })]),
  ).documents[0];
  assert.notEqual(autoheroSummaryFingerprint(base), autoheroSummaryFingerprint(moved));
});
