import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHedinListing } from "./normalizer";
import {
  hedinSummaryFingerprint,
  parseHedinDetailPage,
  parseHedinSearchPage,
} from "./parser";

function searchHtml(contentLen = 3) {
  const content = Array.from({ length: contentLen }, (_, i) => ({
    car_id: String(247534 + i),
    slug: `pc-uc-toyota-rav4-${2019 + i}`,
    car_brand: "Toyota",
    car_model: "RAV4",
    car_model_text: "RAV4 Hybrid AWD-i",
    car_regno: i === 0 ? "FER76A" : `ABC${i}23`,
    car_year: 2019 + i,
    car_mileage_text: `${13 + i} 002 mil`,
    car_price_text: `${285 + i} 900 kr`,
    car_fuel: "Laddhybrid",
    car_gearbox: "Automatisk",
    car_site_city: "Kista",
    car_condition: "Begagnad",
    car_primary_image: { thumbnail_url: `https://cdn.example/veh/${i}-preview.jpg` },
    indexed_at: "2026-08-29T10:00:00Z",
  }));
  const nextData = {
    props: {
      pageProps: {
        componentProps: {
          "abc-guid": {
            dehydratedState: {
              queries: [
                { queryKey: ["car_facets", "sv-SE"], state: { data: { facet: [] } } },
                {
                  queryKey: ["cars", "sv-SE", "", { car_condition: ["Begagnad", "Demo"] }, "car_publishdate_desc"],
                  state: { data: { pages: [{ content, total_items: 2897, limit: 48, offset: 0 }] } },
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
    "@context": "https://schema.org/",
    "@type": ["Product", "Car"],
    name: "Toyota RAV4 2019 Hybrid",
    color: "Grå",
    mileageFromOdometer: { "@type": "QuantitativeValue", value: 130020, unitCode: "KMT" },
    model: "RAV4",
    bodyType: "SUV",
    driveWheelConfiguration: "Fyrhjulsdrift",
    vehicleModelDate: 2019,
    vehicleIdentificationNumber: "JTMRW3FV20J001669",
    vehicleTransmission: "Automatisk",
    brand: { "@type": "Brand", name: "Toyota" },
    offers: { "@type": "Offer", price: 285900, priceCurrency: "SEK", seller: { name: "Hedin Automotive Akalla Väst" } },
  };
  const nextData = {
    props: {
      pageProps: {
        componentProps: {
          "916252c3": {
            car: {
              car_id: "247534",
              slug: "pc-uc-toyota-rav4-2019",
              car_brand: "Toyota",
              car_model: "RAV4",
              car_model_text: "RAV4 Hybrid AWD-i",
              car_regno: "FER76A",
              car_chassino: "JTMRW3FV20J001669",
              car_year: 2019,
              car_body: "SUV",
              car_drive: "Fyrhjulsdrift",
              car_fuel: "Laddhybrid",
              car_gearbox: "Automatisk",
              car_color: "Grå",
              car_doors: 5,
              car_firstregistration: "2019-05-14",
              car_description: "Välservad, ett ägare.",
              car_loan_monthly_cost: 3990,
              car_site_city: "Kista",
              car_images: [
                { thumbnail_url: "https://cdn.example/a-preview.jpg", original: "https://cdn.example/a-enlarged.jpg", blur_data_url: "data:image/png;base64,xxx" },
                { thumbnail_url: "https://cdn.example/b-preview.jpg", original: "https://cdn.example/b-enlarged.jpg" },
                { thumbnail_url: "https://cdn.example/a-preview.jpg", original: "https://cdn.example/a-enlarged.jpg" },
              ],
              car_equipment: [{ name: "ABS-bromsar" }, { name: "Adaptiv farthållare" }, { name: "ABS-bromsar" }],
            },
          },
        },
      },
    },
  };
  return [
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`,
  ].join("");
}

test("parses Hedin __NEXT_DATA__ listing feed and windows a page", () => {
  const page = parseHedinSearchPage(searchHtml(3), 1);
  assert.equal(page.totalItems, 2897);
  assert.equal(page.pageSize, 48);
  assert.equal(page.documents.length, 3);
  const [first] = page.documents;
  assert.equal(first.id, "247534");
  assert.equal(first.detailPath, "/bilar/kop-bil/247534/pc-uc-toyota-rav4-2019");
  assert.equal(first.registrationNumber, "FER76A");
  assert.equal(first.modelYear, 2019);
  assert.equal(first.mileageKm, 13002);
  assert.equal(first.priceAmount, 285900);
  assert.equal(first.variant, "Hybrid AWD-i");
});

test("windowing returns the requested 48-car slice of the cumulative feed", () => {
  const page2 = parseHedinSearchPage(searchHtml(60), 2);
  assert.equal(page2.documents.length, 12); // items 48..59
  assert.equal(page2.documents[0].id, String(247534 + 48));
});

test("parses Hedin detail: Schema.org Car + __NEXT_DATA__ equipment and gallery", () => {
  const detail = parseHedinDetailPage(detailHtml());
  assert.equal(detail.vin, "JTMRW3FV20J001669");
  assert.equal(detail.registrationNumber, "FER76A");
  assert.equal(detail.mileageKm, 130020);
  assert.equal(detail.priceAmount, 285900);
  assert.equal(detail.monthlyCostAmount, 3990);
  assert.equal(detail.bodyType, "SUV");
  assert.equal(detail.sellerName, "Hedin Automotive Akalla Väst");
  assert.deepEqual(detail.equipment, ["ABS-bromsar", "Adaptiv farthållare"]);
  assert.deepEqual(detail.images, [
    "https://cdn.example/a-enlarged.jpg",
    "https://cdn.example/b-enlarged.jpg",
  ]);
});

test("normalizes Hedin to the shared source-independent listing shape", () => {
  const [document] = parseHedinSearchPage(searchHtml(1), 1).documents;
  const listing = normalizeHedinListing(document, parseHedinDetailPage(detailHtml()), "used-cars");
  assert.equal(listing.source.provider, "hedin");
  assert.equal(listing.source.externalId, "247534");
  assert.equal(listing.source.listingUrl, "https://hedinautomotive.se/bilar/kop-bil/247534/pc-uc-toyota-rav4-2019");
  assert.equal(listing.vehicle.vin, "JTMRW3FV20J001669");
  assert.equal(listing.vehicle.registrationNumber, "FER76A");
  assert.equal(listing.vehicle.make, "Toyota");
  assert.equal(listing.vehicle.fuelType, "plug_in_hybrid");
  assert.equal(listing.vehicle.transmission, "automatic");
  assert.equal(listing.vehicle.drivetrain, "all_wheel_drive");
  assert.equal(listing.vehicle.bodyStyle, "suv");
  assert.equal(listing.listing.sellerType, "dealer");
  assert.equal(listing.listing.sellerName, "Hedin Automotive Akalla Väst");
  assert.equal(listing.listing.mileageKm, 130020);
  assert.equal(listing.listing.monthlyCostAmount, 3990);
  assert.equal(listing.listing.images.length, 2);
  assert.equal(listing.listing.equipment.length, 2);
});

test("summary fingerprint tracks market-relevant fields", () => {
  const [a, b] = parseHedinSearchPage(searchHtml(2), 1).documents;
  assert.equal(hedinSummaryFingerprint(a), hedinSummaryFingerprint({ ...a }));
  assert.notEqual(hedinSummaryFingerprint(a), hedinSummaryFingerprint(b));
  assert.notEqual(hedinSummaryFingerprint(a), hedinSummaryFingerprint({ ...a, priceAmount: 1 }));
});
