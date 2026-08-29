import assert from "node:assert/strict";
import test from "node:test";
import { HedinImporter } from "./importer";
import { hedinSummaryFingerprint, parseHedinSearchPage } from "./parser";

function searchHtml() {
  const nextData = {
    props: {
      pageProps: {
        componentProps: {
          g: {
            dehydratedState: {
              queries: [
                {
                  queryKey: ["cars", "sv-SE"],
                  state: {
                    data: {
                      pages: [
                        {
                          total_items: 96,
                          content: [
                            {
                              car_id: "247534",
                              slug: "pc-uc-toyota-rav4-2019",
                              car_brand: "Toyota",
                              car_model: "RAV4",
                              car_regno: "FER76A",
                              car_year: 2019,
                              car_mileage_text: "13 002 mil",
                              car_price_text: "285 900 kr",
                              car_fuel: "Laddhybrid",
                              car_gearbox: "Automatisk",
                              car_site_city: "Kista",
                              car_condition: "Begagnad",
                              car_primary_image: { thumbnail_url: "https://cdn.example/x-preview.jpg" },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
}

function detailHtml() {
  const schema = {
    "@type": ["Product", "Car"],
    name: "Toyota RAV4 2019 Hybrid",
    model: "RAV4",
    vehicleIdentificationNumber: "JTMRW3FV20J001669",
    mileageFromOdometer: { value: 130020 },
    vehicleTransmission: "Automatisk",
    brand: { name: "Toyota" },
    offers: { price: 285900, seller: { name: "Hedin Automotive Akalla Väst" } },
  };
  const nextData = {
    props: {
      pageProps: {
        componentProps: {
          g: {
            car: {
              car_id: "247534",
              car_brand: "Toyota",
              car_model: "RAV4",
              car_regno: "FER76A",
              car_fuel: "Laddhybrid",
              car_gearbox: "Automatisk",
              car_images: [{ original: "https://cdn.example/a-enlarged.jpg" }],
              car_equipment: [{ name: "ABS-bromsar" }],
            },
          },
        },
      },
    },
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
}

test("Hedin adapter fetches detail for a newly discovered summary", async () => {
  let detailRequests = 0;
  const importer = new HedinImporter(
    {
      search: async () => searchHtml(),
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
  assert.equal(page.lastPage, 2);
  assert.equal(detailRequests, 1);
  assert.equal(page.listings[0].vehicle.vin, "JTMRW3FV20J001669");
  assert.equal(page.listings[0].listing.sellerName, "Hedin Automotive Akalla Väst");
});

test("an unchanged summary reuses the structured detail cache without a request", async () => {
  const parsedDocument = parseHedinSearchPage(searchHtml(), 1).documents[0];
  let detailRequests = 0;
  const importer = new HedinImporter(
    {
      search: async () => searchHtml(),
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
            detail: {
              __normalizedHedinDetail: true,
              vin: "JTMRW3FV20J001669",
              registrationNumber: "FER76A",
              brand: "Toyota",
              model: "RAV4",
              fuelType: "Laddhybrid",
              transmission: "Automatisk",
              mileageKm: 130020,
              sellerName: "Hedin Automotive Akalla Väst",
            },
            cachedImages: ["https://cdn.example/a-enlarged.jpg"],
            cachedEquipment: ["ABS-bromsar"],
            summaryFingerprint: hedinSummaryFingerprint(parsedDocument),
          },
        ],
      ]),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(detailRequests, 0);
  assert.equal(page.listings[0].vehicle.vin, "JTMRW3FV20J001669");
  assert.equal(page.listings[0].listing.equipment.length, 1);
});

test("a structural break is retried, reported, then surfaced", async () => {
  let failures = 0;
  const importer = new HedinImporter({
    search: async () => "<html>no next data here</html>",
    detail: async () => detailHtml(),
  });
  await assert.rejects(
    importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => {
      failures += 1;
    }),
    /__NEXT_DATA__|kunde inte läsas/,
  );
  assert.equal(failures, 5);
});
