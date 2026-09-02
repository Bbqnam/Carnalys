import { prisma, initializeDatabase } from "@/infrastructure/database/prisma";
import { BlocketUnofficialClient } from "@/infrastructure/marketplaces/blocket-unofficial/client";

const provider = "blocket_unofficial";

export type BlocketVerificationResult = {
  checked: number;
  active: number;
  missing: number;
  inconclusive: number;
};

export async function verifyBlocketListingSample(requestedLimit = 300) {
  await initializeDatabase();
  const limit = Math.max(1, Math.min(requestedLimit, 500));
  const candidates = await prisma.listingRecord.findMany({
    where: { provider, status: "active" },
    orderBy: [{ availabilityCheckedAt: { sort: "asc", nulls: "first" } }, { lastSeenAt: "asc" }],
    take: limit,
    select: {
      id: true,
      externalId: true,
      priceAmount: true,
      previousPriceAmount: true,
      mileageKm: true,
      sellerType: true,
      vehicleId: true,
    },
  });
  const client = new BlocketUnofficialClient();
  const result: BlocketVerificationResult = { checked: 0, active: 0, missing: 0, inconclusive: 0 };
  let nextIndex = 0;

  async function runLane() {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex++];
      const checkedAt = new Date();
      const availability = await client.checkCarAvailability(candidate.externalId);
      result.checked += 1;

      if (availability === "active") {
        result.active += 1;
        await prisma.listingRecord.updateMany({
          where: { id: candidate.id, status: "active" },
          data: { availabilityCheckedAt: checkedAt, availabilityCheckStatus: "active" },
        });
        continue;
      }
      if (availability === "inconclusive") {
        result.inconclusive += 1;
        await prisma.listingRecord.updateMany({
          where: { id: candidate.id, status: "active" },
          data: { availabilityCheckedAt: checkedAt, availabilityCheckStatus: "inconclusive" },
        });
        continue;
      }

      const removed = await prisma.$transaction(async (transaction) => {
        const current = await transaction.listingRecord.findUnique({
          where: { id: candidate.id },
          select: { status: true },
        });
        if (current?.status !== "active") return false;
        await transaction.listingRecord.update({
          where: { id: candidate.id },
          data: {
            status: "removed",
            removedAt: checkedAt,
            availabilityCheckedAt: checkedAt,
            availabilityCheckStatus: "missing",
          },
        });
        await transaction.listingObservation.createMany({
          data: [{
            listingId: candidate.id,
            provider,
            observedAt: checkedAt,
            kind: "disappeared",
            priceAmount: candidate.priceAmount,
            previousPriceAmount: candidate.previousPriceAmount,
            mileageKm: candidate.mileageKm,
            sellerType: candidate.sellerType,
            status: "removed",
          }],
          skipDuplicates: true,
        });
        return true;
      });
      if (removed) result.missing += 1;
    }
  }

  await Promise.all(Array.from({ length: Math.min(12, candidates.length) }, () => runLane()));
  return result;
}
