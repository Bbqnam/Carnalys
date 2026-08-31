import assert from "node:assert/strict";
import test from "node:test";
import { AutoheroImporter } from "./importer";
import { autoheroSummaryFingerprint, parseAutoheroSearchResponse } from "./parser";

const adId = "894fd37c-eadc-4551-a9c8-74d5b8ec2dcf";

function searchBody(total = 60) {
  return JSON.stringify({
    data: {
      searchAdV9AdsV2: {
        total,
        data: [
          {
            id: adId,
            carUrlTitle: "volvo-v-90",
            manufacturer: "Volvo",
            model: "V90",
            subType: "2.0 D4",
            builtYear: 2019,
            firstRegistrationYear: 2019,
            registration: "20190215T000000.000Z",
            mileage: { distance: 136300, unit: "KM" },
            offerPrice: { amountMinorUnits: 23100000, conversionMajor: 100 },
            fuelType: 1040,
            gearType: 1139,
            driveTrain: "all-wheel-drive",
            kw: 140,
            hasFilledServiceBook: true,
            esBranch: { city: "Stockholm" },
            firstPublishedAt: "20260630T113335.000Z",
            publishedAt: "20260630T113335.000Z",
            mainImageUrl: "https://img-eu-c1.autohero.com/img/HASH/exterior/1/{size}file.jpg",
            usps: [],
          },
        ],
      },
    },
  });
}

const detailAd = {
  __typename: "CarDetailsStoreAdProjection",
  adId,
  manufacturer: "Volvo",
  model: "V90",
  subType: "2.0 D4",
  bodyType: "Kombi",
  vin: "YV1PWA8UCK1105690",
  licensePlate: "CGY22E",
  fuelType: "Diesel",
  gearType: "Automatisk växellåda",
  drivetrain: "all-wheel-drive",
  horsePower: 190,
  mileage: { distance: 136300, unit: "KM" },
  price: { amountMinorUnits: 23100000, conversionMajor: 100 },
  hasFilledServiceBook: true,
  features: [{ categoryName: "highlights", items: [{ description: "Android Auto" }] }],
  carDetailsImageComposites: {
    exterior: [{ fullUrl: "https://img-eu-c1.autohero.com/img/HASH/exterior/1/{size}a.jpg", order: 0 }],
  },
};

function detailHtml() {
  const state = JSON.stringify(
    JSON.stringify({
      ROOT_QUERY: { [`getCarDetailsStoreAd({"adId":"${adId}","locale":"sv-SE"})`]: detailAd },
    }),
  );
  return `<script>window.__APOLLO_STATE__ = ${state};</script>`;
}

test("a new summary fetches its detail once; last page comes from the total", async () => {
  let detailRequests = 0;
  const importer = new AutoheroImporter(
    {
      search: async () => searchBody(60),
      detail: async () => {
        detailRequests += 1;
        return detailHtml();
      },
    },
    async () => new Map(),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(page.listings.length, 1);
  assert.equal(page.currentPage, 1);
  assert.equal(page.lastPage, 3); // ceil(60 / 24)
  assert.equal(detailRequests, 1);
  assert.equal(page.listings[0].vehicle.vin, "YV1PWA8UCK1105690");
});

test("an unchanged summary reuses the cached detail without a request", async () => {
  const parsedDocument = parseAutoheroSearchResponse(searchBody()).documents[0];
  const first = await new AutoheroImporter({
    search: async () => searchBody(),
    detail: async () => detailHtml(),
  }).fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  const payload = first.listings[0].rawPayload as Record<string, unknown>;

  let detailRequests = 0;
  const importer = new AutoheroImporter(
    {
      search: async () => searchBody(),
      detail: async () => {
        detailRequests += 1;
        return detailHtml();
      },
    },
    async () =>
      new Map([
        [
          parsedDocument.id,
          {
            detail: payload.detail,
            cachedImages: payload.cachedImages,
            cachedEquipment: payload.cachedEquipment,
            summaryFingerprint: autoheroSummaryFingerprint(parsedDocument),
          },
        ],
      ]),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(detailRequests, 0);
  assert.equal(page.listings[0].vehicle.registrationNumber, "CGY22E");
  assert.equal(page.listings[0].vehicle.bodyStyle, "estate");
});

test("a changed search structure rejects the page and reports the failure", async () => {
  let failures = 0;
  const importer = new AutoheroImporter({
    search: async () => JSON.stringify({ data: { searchAdV9AdsV2: null } }),
    detail: async () => detailHtml(),
  });
  await assert.rejects(
    importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => {
      failures += 1;
    }),
  );
  assert.ok(failures > 0);
});

test("a failed detail fetch keeps the previous fingerprint for a retry next run", async () => {
  const parsedDocument = parseAutoheroSearchResponse(searchBody()).documents[0];
  const importer = new AutoheroImporter(
    {
      search: async () => searchBody(),
      detail: async () => {
        throw new Error("502");
      },
    },
    async () => new Map([[parsedDocument.id, { summaryFingerprint: "stale" }]]),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  const payload = page.listings[0].rawPayload as { summaryFingerprint?: unknown };
  assert.equal(payload.summaryFingerprint, "stale");
});
