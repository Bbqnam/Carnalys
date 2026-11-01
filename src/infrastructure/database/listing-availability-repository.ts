import { recommendationVerificationMaxAgeMs, hasFreshHostConfirmation, type HostAvailabilityEvidence } from "@/domain/market/listing-availability";
import { checkHostListing } from "@/infrastructure/marketplaces/host-availability";
import { refreshVehicleRepresentatives } from "./listing-write-repository";
import { initializeDatabase, prisma } from "./prisma";

const select = {
  id: true, provider: true, externalId: true, listingUrl: true, vehicleId: true,
  status: true, priceAmount: true, previousPriceAmount: true, mileageKm: true, synchronizedAt: true,
  sellerType: true, availabilityCheckedAt: true, availabilityCheckStatus: true,
  availabilityConfirmedAt: true, priceConfirmedAt: true,
} as const;

export type AvailabilityListing = Awaited<ReturnType<typeof loadAvailabilityListings>>[number];
export async function loadAvailabilityListings(ids: readonly string[]) {
  await initializeDatabase();
  return prisma.listingRecord.findMany({ where: { id: { in: [...ids] }, status: "active" }, select });
}

export async function recordHostEvidence(row: AvailabilityListing, evidence: HostAvailabilityEvidence) {
  const checkedAt = new Date(evidence.checkedAt);
  return prisma.$transaction(async tx => {
    // A slower response cannot overwrite a newer verification or a concurrent
    // ingestion update. All changes and history facts commit together.
    await tx.$queryRaw`SELECT "id" FROM "VehicleRecord" WHERE "id" = ${row.vehicleId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "ListingRecord" WHERE "id" = ${row.id} FOR UPDATE`;
    const current = await tx.listingRecord.findUnique({ where: { id: row.id }, select });
    if (!current || !["active", "reserved"].includes(current.status) || current.synchronizedAt > checkedAt ||
        (current.availabilityCheckedAt && current.availabilityCheckedAt >= checkedAt)) return false;
    const priceChanged = evidence.availability === "active" && evidence.priceAmount != null &&
      evidence.priceAmount !== current.priceAmount && current.priceAmount === row.priceAmount;
    await tx.listingRecord.update({
      where: { id: row.id },
      data: {
        availabilityCheckedAt: checkedAt,
        availabilityCheckStatus: evidence.availability === "active" ? "active:host" : evidence.availability,
        availabilityEvidence: { ...evidence },
        ...(evidence.availability === "active" ? { status: "active", removedAt: null, availabilityConfirmedAt: checkedAt, priceConfirmedAt: checkedAt } : {}),
        ...(evidence.availability === "missing" ? { status: "removed", removedAt: checkedAt, isVehicleRepresentative: false, analysisRequiredAt: checkedAt } : {}),
        ...(evidence.availability === "reserved" ? { status: "reserved", isVehicleRepresentative: false, analysisRequiredAt: checkedAt } : {}),
        ...(priceChanged ? { priceAmount: evidence.priceAmount!, previousPriceAmount: current.priceAmount, analysisRequiredAt: checkedAt } : {}),
      },
    });
    if (priceChanged) {
      // Never keep advertising a Deal Score computed from the previous ask
      // while the asynchronous analysis worker catches up.
      await tx.listingAnalysisRecord.updateMany({
        where: { listingId: row.id },
        data: { dealScore: null, marketDiscountBps: null, confidenceRank: 0 },
      });
    }
    const statusChanged = (evidence.availability === "reserved" && current.status !== "reserved") ||
      (evidence.availability === "active" && current.status === "reserved");
    if (evidence.availability === "missing" || priceChanged || statusChanged) {
      await tx.listingObservation.createMany({ data: [{
        listingId: row.id, provider: row.provider, observedAt: checkedAt,
        kind: evidence.availability === "missing" ? "disappeared" : priceChanged ? "price_change" : "status_change",
        priceAmount: priceChanged ? evidence.priceAmount! : current.priceAmount,
        previousPriceAmount: priceChanged ? current.priceAmount : current.previousPriceAmount,
        mileageKm: current.mileageKm, sellerType: current.sellerType,
        status: evidence.availability === "missing" ? "removed" : evidence.availability === "reserved" ? "reserved" : "active", provenance: "observed",
      }], skipDuplicates: true });
    }
    if (evidence.availability === "missing" || evidence.availability === "reserved" || current.status === "reserved") {
      await refreshVehicleRepresentatives([current.vehicleId], tx);
    }
    return true;
  }, { maxWait: 5_000, timeout: 10_000 });
}

const inFlight = new Map<string, Promise<HostAvailabilityEvidence>>();
export async function verifyHostAvailability(row: AvailabilityListing, now = new Date(), force = false) {
  if (!force && hasFreshHostConfirmation(row, now) && row.priceConfirmedAt &&
      now.getTime() - row.priceConfirmedAt.getTime() <= recommendationVerificationMaxAgeMs) {
    return { availability: "active" as const, checkedAt: row.availabilityConfirmedAt!.toISOString(),
      reason: "Recent original-host verification", url: row.listingUrl, httpStatus: 200, priceAmount: row.priceAmount };
  }
  const pending = inFlight.get(row.id);
  if (pending) return pending;
  const check = (async () => {
    const evidence = await checkHostListing(row, fetch, now);
    await recordHostEvidence(row, evidence);
    return evidence;
  })();
  inFlight.set(row.id, check);
  try { return await check; } finally { inFlight.delete(row.id); }
}

export async function pollHostAvailability(options: { provider: string; limit: number; concurrency?: number; write?: boolean }) {
  await initializeDatabase();
  const rows = await prisma.listingRecord.findMany({
    where: { provider: options.provider, status: { in: ["active", "reserved"] } },
    orderBy: [{ availabilityCheckedAt: { sort: "asc", nulls: "first" } }, { lastSeenAt: "asc" }],
    select, take: Math.max(1, Math.min(20_000, options.limit)),
  });
  let index = 0;
  let blocked = false;
  const stats = { provider: options.provider, checked: 0, active: 0, missing: 0, reserved: 0, inconclusive: 0, skippedAfterBlock: 0 };
  const lane = async () => {
    while (index < rows.length) {
      const row = rows[index++];
      if (blocked) { stats.skippedAfterBlock++; continue; }
      const evidence = await checkHostListing(row);
      stats.checked++;
      stats[evidence.availability]++;
      if (evidence.httpStatus === 403 || evidence.httpStatus === 429) blocked = true;
      if (options.write) {
        await recordHostEvidence(row, evidence);
      }
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(3, options.concurrency ?? 2)) }, lane));
  return stats;
}
