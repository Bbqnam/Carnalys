import assert from "node:assert/strict";
import test from "node:test";
import { WaykeImporter } from "./importer";
import { parseWaykeDetailPage, waykeSummaryFingerprint } from "./parser";

const externalId = "e6f09124-b577-49b5-9c15-2b3db9c81ca0";
function searchHtml() {
  const payload = {
    mutations: [],
    queries: [{ state: { data: { documentList: {
      numberOfHits: 25,
      documents: [{
        _id: externalId,
        branches: [{ name: "Porsche Center Malmö" }],
        featuredImage: { files: [{ url: "https://cdn.wayke.se/cfit/v3/gallery/first" }] },
        fuelType: "Bensin+El",
        gearboxType: "Automat",
        itemPublished: "2026-08-28T11:04:24Z",
        manufacturer: "Porsche",
        mileage: 1,
        modelSeries: "911",
        modelYear: 2026,
        price: 2363000,
        status: "Published",
        title: "Porsche 911 Carrera 4 GTS Cabriolet",
      }],
      pagination: { offset: 0, hitsPerPage: 24 },
    } } } }],
  };
  return `<script>window["__RQ_R_lb_"] = []; window["__RQ_R_lb_"].push(${JSON.stringify(payload)});</script>`;
}

const detailHtml = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Car",
  name: "Porsche 911 Carrera 4 GTS Cabriolet",
  vehicleIdentificationNumber: "WP0ZZZ995TS242293",
  identifier: { propertyID: "registrationNumber", value: "WDC52Z" },
  image: ["https://cdn.wayke.se/cfit/v3/gallery/first"],
  offers: { price: 2363000, seller: { name: "Porsche Center Malmö" } },
  vehicleModelDate: "2026",
  mileageFromOdometer: { value: "10" },
})}</script>`;

test("Wayke adapter retrieves detail for a new summary", async () => {
  let detailRequests = 0;
  const importer = new WaykeImporter(
    {
      search: async () => searchHtml(),
      detail: async () => { detailRequests += 1; return detailHtml; },
    },
    async () => new Map(),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(page.listings.length, 1);
  assert.equal(page.lastPage, 2);
  assert.equal(detailRequests, 1);
});

test("unchanged summary reuses structured detail cache without a request", async () => {
  const first = await new WaykeImporter({ search: async () => searchHtml(), detail: async () => detailHtml })
    .fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  const normalized = first.listings[0];
  const document = (normalized.rawPayload as { document: Record<string, unknown> }).document;
  const parsedDocument = (await import("./parser")).parseWaykeSearchPage(searchHtml()).documents[0];
  let detailRequests = 0;
  const importer = new WaykeImporter(
    {
      search: async () => searchHtml(),
      detail: async () => { detailRequests += 1; return detailHtml; },
    },
    async () => new Map([[parsedDocument.id, {
      document,
      detail: parseWaykeDetailPage(detailHtml).raw,
      detailEquipment: parseWaykeDetailPage(detailHtml).equipment,
      summaryFingerprint: waykeSummaryFingerprint(parsedDocument),
    }]]),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(page.listings[0].vehicle.registrationNumber, "WDC52Z");
  assert.equal(detailRequests, 0);
});

test("one source adapter failure does not mutate or invoke another adapter", async () => {
  let failures = 0;
  const importer = new WaykeImporter({
    search: async () => "structure changed",
    detail: async () => detailHtml,
  });
  await assert.rejects(
    importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => { failures += 1; }),
    /strukturerade siddata/,
  );
  assert.equal(failures, 5);
});
