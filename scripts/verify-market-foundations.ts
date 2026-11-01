import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { NormalizedVehicleListing } from "../src/application/ingestion/types";
import { prisma } from "../src/infrastructure/database/prisma";
import { loadAvailabilityListings, recordHostEvidence } from "../src/infrastructure/database/listing-availability-repository";
import { refreshStoredListingAnalyses } from "../src/infrastructure/database/listing-analysis-repository";
import { checkHostListing } from "../src/infrastructure/marketplaces/host-availability";
import { upsertNormalizedListings } from "../src/infrastructure/database/listing-write-repository";

// This integration check mutates a disposable copy, never the production DB.
const expected = process.env.CARNALYS_TEST_DATABASE_HOST;
if (!expected || expected === "ep-bitter-block-b2i2gmja.c-6.eu-central-1.aws.neon.tech" ||
    new URL(process.env.DATABASE_URL ?? "").hostname !== expected) {
  throw new Error("An explicitly selected isolated database branch is required");
}

async function main() {
  const fixtureListing: NormalizedVehicleListing = {
    source: { provider: "autohero", scope: "integration", externalId: randomUUID(),
      listingUrl: "https://www.autohero.com/se/volvo-v60/id/integration-fixture/", observedAt: new Date() },
    vehicle: { make: "Volvo", model: "V60", modelYear: 2026, bodyStyle: "estate", fuelType: "petrol", transmission: "automatic" },
    listing: { title: "Integration fixture", priceAmount: 300000, mileageKm: 0, mileageKnown: false,
      sellerType: "dealer", location: "Stockholm", municipality: "Stockholm", serviceHistory: "unknown", equipment: [], images: [] },
  };
  const initial = await upsertNormalizedListings([fixtureListing], new Date());
  const fixtureId = initial.changedListingIds[0];
  const firstFact = await prisma.listingFactObservation.findFirstOrThrow({ where: { listingId: fixtureId } });
  assert.equal((await upsertNormalizedListings([fixtureListing], new Date())).unchangedCount, 1);
  await upsertNormalizedListings([{ ...fixtureListing, listing: { ...fixtureListing.listing, priceAmount: 301000, mileageKnown: true } }], new Date());
  assert.equal(await prisma.listingFactObservation.count({ where: { listingId: fixtureId } }), 2);
  assert.deepEqual((await prisma.listingFactObservation.findUniqueOrThrow({ where: { id: firstFact.id } })).facts, firstFact.facts);
  const seeded = await prisma.listingAnalysisRecord.findUniqueOrThrow({ where: { listingId: fixtureId } });
  await prisma.listingRecord.update({ where: { id: fixtureId },
    data: { lastSeenAt: new Date("2010-01-01"), analysisRequiredAt: new Date("1970-01-01") } });
  await refreshStoredListingAnalyses(undefined, 1);
  assert.equal((await prisma.listingAnalysisRecord.findUniqueOrThrow({ where: { listingId: fixtureId } })).calculatedAt.getTime(), seeded.calculatedAt.getTime());
  await prisma.listingRecord.update({ where: { id: fixtureId }, data: { status: "removed", isVehicleRepresentative: false } });
  const target = await prisma.listingRecord.findFirstOrThrow({
    where: { status: "active", mileageKnown: true, valuationEligible: true, vehicle: { make: "Volvo", model: "V60" } },
    select: { id: true }, orderBy: { synchronizedAt: "desc" },
  });
  assert.equal(await refreshStoredListingAnalyses([target.id], 1), 1);
  const analysis = await prisma.listingAnalysisRecord.findUniqueOrThrow({ where: { listingId: target.id } });
  const evidence = analysis.valuationEvidence as { comparables: { listingId: string; vehicleId: string; adjustedPriceAmount: number }[]; target: { vehicle: object }; effectiveSampleSize: number };
  const [row] = await loadAvailabilityListings([target.id]);
  assert.equal(evidence.comparables.length, analysis.comparableCount);
  assert.ok(evidence.comparables.every(peer => peer.vehicleId !== row.vehicleId && Number.isFinite(peer.adjustedPriceAmount)));
  assert.ok(!("vin" in evidence.target.vehicle));
  assert.equal((await prisma.listingRecord.findUniqueOrThrow({ where: { id: row.id } })).analysisRequiredAt, null);

  const checkedAt = new Date();
  const fixture = { availability: "active" as const, checkedAt: checkedAt.toISOString(), url: row.listingUrl,
    httpStatus: 200, priceAmount: row.priceAmount + 100, reason: "Integration fixture on an isolated branch" };
  assert.equal(await recordHostEvidence(row, fixture), true);
  assert.equal(await recordHostEvidence(row, { ...fixture, checkedAt: new Date(checkedAt.getTime() - 1000).toISOString(), priceAmount: row.priceAmount - 100 }), false);
  const updated = await prisma.listingRecord.findUniqueOrThrow({ where: { id: row.id }, include: { analysis: true } });
  assert.equal(updated.priceAmount, row.priceAmount + 100);
  assert.ok(updated.analysisRequiredAt);
  assert.equal(updated.analysis?.dealScore, null);
  const eventCount = await prisma.listingObservation.count({ where: { listingId: row.id, observedAt: checkedAt, kind: "price_change" } });
  assert.equal(eventCount, 1);
  await recordHostEvidence(row, { ...fixture, availability: "inconclusive", checkedAt: new Date().toISOString(), reason: "Fixture verification completed" });

  const missing = await prisma.listingRecord.findFirstOrThrow({ where: { provider: "wayke", status: "active" }, orderBy: { lastSeenAt: "desc" }, select: { id: true } });
  const [stale] = await loadAvailabilityListings([missing.id]);
  const host = await checkHostListing(stale);
  if (host.availability === "missing") {
    assert.equal(await recordHostEvidence(stale, host), true);
    assert.equal(await recordHostEvidence(stale, host), false);
    const removed = await prisma.listingRecord.findUniqueOrThrow({ where: { id: stale.id } });
    assert.equal(removed.status, "removed");
    assert.equal(removed.isVehicleRepresentative, false);
    assert.equal(await prisma.listingObservation.count({ where: { listingId: stale.id, observedAt: new Date(host.checkedAt), kind: "disappeared" } }), 1);
  }
  console.log(JSON.stringify({ database: expected, immutableFacts: "passed", analysis: "passed", priceInvalidation: "passed", staleResponse: "passed", history: "passed", liveWaykeVerdict: host.availability }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
