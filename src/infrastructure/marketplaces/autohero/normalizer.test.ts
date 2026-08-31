import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAutoheroListing } from "./normalizer";
import type { AutoheroListingDetail, AutoheroSearchDocument } from "./types";

function document(overrides: Partial<AutoheroSearchDocument> = {}): AutoheroSearchDocument {
  return {
    id: "894fd37c-eadc-4551-a9c8-74d5b8ec2dcf",
    stockNumber: "PP87807",
    slug: "volvo-v-90",
    make: "Volvo",
    model: "V90",
    subType: "2.0 D4",
    subTypeExtra: "Momentum AWD",
    modelYear: 2019,
    registrationYear: 2019,
    mileageKm: 136300,
    priceAmount: 231000,
    previousPriceAmount: 232000,
    monthlyCostAmount: 2457,
    fuelTypeId: 1040,
    gearTypeId: 1139,
    driveTrain: "all-wheel-drive",
    isPluginSystem: false,
    powerKw: 140,
    engineDisplacementCc: 1969,
    fuelConsumptionCombined: 6.6,
    ownerCount: 2,
    hasFilledServiceBook: false,
    city: "Stockholm",
    zipcode: "195 61",
    branchName: "Autohero Center Stockholm Arlandastad",
    firstPublishedAt: new Date("2026-06-30T11:33:35.000Z"),
    publishedAt: new Date("2026-07-06T08:51:01.000Z"),
    featuredImageUrl: "https://img-eu-c1.autohero.com/img/HASH/exterior/1/1116x744-file.jpg",
    usps: ["all-wheel-drive"],
    raw: { id: "894fd37c-eadc-4551-a9c8-74d5b8ec2dcf" },
    ...overrides,
  };
}

test("summary alone produces a complete dealer listing", () => {
  const normalized = normalizeAutoheroListing(document(), undefined, "retail");
  assert.equal(normalized.source.provider, "autohero");
  assert.equal(normalized.source.listingUrl, "https://www.autohero.com/se/volvo-v-90/id/894fd37c-eadc-4551-a9c8-74d5b8ec2dcf/");
  assert.equal(normalized.source.publishedAt?.toISOString(), "2026-06-30T11:33:35.000Z");
  assert.equal(normalized.listing.sellerName, "Autohero");
  assert.equal(normalized.listing.sellerType, "dealer");
  assert.equal(normalized.listing.priceAmount, 231000);
  assert.equal(normalized.listing.previousPriceAmount, 232000);
  assert.equal(normalized.vehicle.fuelType, "diesel");
  assert.equal(normalized.vehicle.transmission, "automatic");
  assert.equal(normalized.vehicle.drivetrain, "all_wheel_drive");
  assert.equal(normalized.vehicle.horsepower, 190); // 140 kW → hp
  assert.equal(normalized.vehicle.bodyStyle, "other"); // no detail body type
  assert.equal(normalized.listing.serviceHistory, "missing"); // hasFilledServiceBook === false
});

test("enum ids resolve fuel and transmission without a detail record", () => {
  assert.equal(
    normalizeAutoheroListing(document({ fuelTypeId: 1039, gearTypeId: 1138 }), undefined, "retail").vehicle.fuelType,
    "petrol",
  );
  assert.equal(
    normalizeAutoheroListing(document({ fuelTypeId: 1039, gearTypeId: 1138 }), undefined, "retail").vehicle.transmission,
    "manual",
  );
  assert.equal(
    normalizeAutoheroListing(document({ fuelTypeId: 1044 }), undefined, "retail").vehicle.fuelType,
    "electric",
  );
});

test("isPluginSystem is the authoritative hybrid separator", () => {
  // BMW 225e — trim wording alone would not catch it; the flag does.
  const plugin = normalizeAutoheroListing(
    document({ fuelTypeId: 1046, isPluginSystem: true, subType: "225e Active Tourer", subTypeExtra: "xDrive", fuelConsumptionCombined: 6.2 }),
    undefined,
    "retail",
  );
  assert.equal(plugin.vehicle.fuelType, "plug_in_hybrid");

  // Toyota Yaris 1.5 Hybrid — a self-charging hybrid, flag false.
  const selfCharging = normalizeAutoheroListing(
    document({ fuelTypeId: 1046, isPluginSystem: false, subType: "1.5 Hybrid", subTypeExtra: undefined, fuelConsumptionCombined: 4.3 }),
    undefined,
    "retail",
  );
  assert.equal(selfCharging.vehicle.fuelType, "self_charging_hybrid");
});

test("hybrid falls back to trim wording and consumption when the flag is absent", () => {
  const byWording = normalizeAutoheroListing(
    document({ fuelTypeId: 1046, isPluginSystem: undefined, subType: "1.6 Plug-in Hybrid", fuelConsumptionCombined: undefined }),
    undefined,
    "retail",
  );
  assert.equal(byWording.vehicle.fuelType, "plug_in_hybrid");

  const byConsumption = normalizeAutoheroListing(
    document({ fuelTypeId: 1046, isPluginSystem: undefined, subType: "1.6 Hybrid", subTypeExtra: undefined, fuelConsumptionCombined: 1.5 }),
    undefined,
    "retail",
  );
  assert.equal(byConsumption.vehicle.fuelType, "plug_in_hybrid");
});

test("Autohero Swedish body labels map to the shared body styles", () => {
  const small = normalizeAutoheroListing(document(), { bodyType: "Småbil", images: [], equipment: [], raw: {} }, "retail");
  assert.equal(small.vehicle.bodyStyle, "hatchback");
  const mpv = normalizeAutoheroListing(document(), { bodyType: "Van / MPV", images: [], equipment: [], raw: {} }, "retail");
  assert.equal(mpv.vehicle.bodyStyle, "minivan");
  const estate = normalizeAutoheroListing(document(), { bodyType: "Kombi", images: [], equipment: [], raw: {} }, "retail");
  assert.equal(estate.vehicle.bodyStyle, "estate");
});

test("detail record supplies VIN, body style and equipment and overrides fuel", () => {
  const detail: AutoheroListingDetail = {
    title: "Volvo V90 2.0 D4 Momentum AWD",
    vin: "YV1PWA8UCK1105690",
    registrationNumber: "CGY22E",
    variant: "2.0 D4 Momentum AWD",
    bodyType: "Kombi",
    fuelType: "Diesel",
    transmission: "Automatisk växellåda",
    drivetrain: "all-wheel-drive",
    horsepower: 190,
    engineDisplacementCc: 1969,
    fuelConsumption: "6.6 l/100km",
    mileageKm: 136300,
    priceAmount: 231000,
    ownerCount: 2,
    serviceHistory: "partial",
    images: ["https://img-eu-c1.autohero.com/img/HASH/exterior/1/1116x744-a.jpg"],
    equipment: ["Android Auto", "Klimatanläggning"],
    raw: {},
  };
  const normalized = normalizeAutoheroListing(document(), detail, "retail");
  assert.equal(normalized.vehicle.vin, "YV1PWA8UCK1105690");
  assert.equal(normalized.vehicle.registrationNumber, "CGY22E");
  assert.equal(normalized.vehicle.bodyStyle, "estate");
  assert.equal(normalized.listing.serviceHistory, "partial");
  assert.deepEqual([...normalized.listing.equipment], ["Android Auto", "Klimatanläggning"]);
  assert.equal(normalized.listing.images[0].url, "https://img-eu-c1.autohero.com/img/HASH/exterior/1/1116x744-a.jpg");
  assert.equal(normalized.rawPayload && (normalized.rawPayload as { detail?: { __normalizedAutoheroDetail?: boolean } }).detail?.__normalizedAutoheroDetail, true);
});
