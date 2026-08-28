import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWaykeListing } from "./normalizer";
import { parseWaykeDetailPage, parseWaykeSearchPage } from "./parser";

const searchDocument = {
  _id: "e6f09124-b577-49b5-9c15-2b3db9c81ca0",
  branches: [{ name: "Porsche Center Malmö" }],
  featuredImage: { files: [{ url: "https://cdn.wayke.se/cfit/v3/gallery/first" }] },
  fuelType: "Bensin+El",
  gearboxType: "Automat",
  itemPublished: "2026-08-28T11:04:24Z",
  itemSort: "2026-08-28T11:04:24Z",
  manufacturer: "Porsche",
  mileage: 1,
  modelSeries: "911",
  modelYear: 2026,
  oldPrice: 2400000,
  position: { city: "Malmö", location: { lat: 55.56, lon: 13.07 } },
  price: 2363000,
  status: "Published",
  title: "Porsche 911 Carrera 4 GTS Cabriolet",
};

function searchHtml(document = searchDocument) {
  const payload = {
    mutations: [],
    queries: [
      { state: { data: { documentList: { numberOfHits: 100, documents: [], pagination: { offset: 0, hitsPerPage: 0 } } } } },
      { state: { data: { documentList: {
        numberOfHits: 25,
        documents: [document],
        pagination: { offset: 0, hitsPerPage: 24 },
      } } } },
    ],
  };
  return `<script>window["__RQ_R_lb_"] = []; window["__RQ_R_lb_"].push(${JSON.stringify(payload)});</script>`;
}

const detailHtml = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Car",
  name: "Porsche 911 Carrera 4 GTS Cabriolet",
  vehicleIdentificationNumber: "WP0ZZZ995TS242293",
  identifier: { propertyID: "registrationNumber", value: "WDC 52Z" },
  image: ["https://cdn.wayke.se/cfit/v3/gallery/first", "https://cdn.wayke.se/cfit/v3/gallery/second"],
  offers: { price: 2363000, validFrom: "2026-08-28T11:04:24Z", seller: { name: "Porsche Center Malmö" } },
  vehicleConfiguration: "911 Carrera 4 GTS Cabriolet",
  vehicleModelDate: "2026",
  productionDate: "2026",
  mileageFromOdometer: { value: "10", unitCode: "KMT" },
  bodyType: "Coupe",
  driveWheelConfiguration: "https://schema.org/FourWheelDriveConfiguration",
  vehicleEngine: { fuelType: "Gasoline/Electricity", enginePower: { value: "398" }, engineDisplacement: { value: "3591" } },
  vehicleTransmission: "Automat",
  fuelConsumption: { value: "10.7", unitText: "l/100km" },
})}</script><ul data-testid="equipment-list"><li data-testid="equipment-list-item-0">Adaptiv farthållare</li><li data-testid="equipment-list-item-1">BOSE® &amp; Navigation</li></ul>`;

test("parses Wayke public hydration search data and pagination", () => {
  const page = parseWaykeSearchPage(searchHtml());
  assert.equal(page.totalMatches, 25);
  assert.equal(page.hitsPerPage, 24);
  assert.equal(page.documents[0].sellerName, "Porsche Center Malmö");
  assert.equal(page.documents[0].featuredImageUrl, "https://cdn.wayke.se/cfit/v3/gallery/first");
});

test("parses Schema.org vehicle identity, gallery and rendered equipment", () => {
  const detail = parseWaykeDetailPage(detailHtml);
  assert.equal(detail.registrationNumber, "WDC52Z");
  assert.equal(detail.vin, "WP0ZZZ995TS242293");
  assert.equal(detail.images.length, 2);
  assert.deepEqual(detail.equipment, ["Adaptiv farthållare", "BOSE® & Navigation"]);
});

test("normalizes Wayke to the same essential source-independent listing shape", () => {
  const document = parseWaykeSearchPage(searchHtml()).documents[0];
  const listing = normalizeWaykeListing(document, parseWaykeDetailPage(detailHtml), "all-vehicles");
  assert.equal(listing.source.provider, "wayke");
  assert.equal(listing.listing.title, searchDocument.title);
  assert.equal(listing.listing.mileageKm, 10);
  assert.equal(listing.vehicle.fuelType, "plug_in_hybrid");
  assert.equal(listing.listing.images.length, 2);
});

test("parses the newer public Next server-component vehicle payload", () => {
  const vehicle = {
    _dpk: "16",
    _id: searchDocument._id,
    title: searchDocument.title,
    manufacturer: "Porsche",
    modelSeries: "911",
    modelYear: 2026,
    mileage: 1,
    odometerReading: { unit: "ScandinavianMile", value: 1 },
    price: 2363000,
    fuelTypes: "Bensin+El",
    gearboxType: "Automat",
    enginePower: 541,
    branches: [{ name: "Porsche Center Malmö" }],
    properties: { chassis: "Cabriolet", drivingWheel: "Fyrhjulsdrift" },
    media: [{ files: [{ url: "https://cdn.wayke.se/cfit/v3/gallery/first" }] }],
    equipment: [{ name: "Adaptiv farthållare" }],
  };
  const flight = `6:["$","component",null,{"vehicle":${JSON.stringify(vehicle)}}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
  const detail = parseWaykeDetailPage(html);
  assert.equal(detail.title, searchDocument.title);
  assert.equal(detail.mileageKm, 10);
  assert.equal(detail.sellerName, "Porsche Center Malmö");
  assert.deepEqual(detail.equipment, ["Adaptiv farthållare"]);
});
