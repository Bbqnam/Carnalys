import { catalogueFreshnessCutoff } from "@/domain/market/listing-availability";
import { Prisma } from "@/generated/prisma/client";

/** All current-catalogue views share the same freshness policy. */
export function freshListingWhere(now = new Date()): Prisma.ListingRecordWhereInput {
  const cutoff = catalogueFreshnessCutoff(now);
  return { OR: [
    { lastSeenAt: { gte: cutoff } },
    { availabilityCheckStatus: "active:host", availabilityConfirmedAt: { gte: cutoff } },
  ] };
}

/** The caller's listing table is consistently aliased `listing`. */
export function freshListingSql(now = new Date()) {
  const cutoff = catalogueFreshnessCutoff(now);
  return Prisma.sql`(listing."lastSeenAt" >= ${cutoff} OR
    (listing."availabilityCheckStatus" = 'active:host' AND listing."availabilityConfirmedAt" >= ${cutoff}))`;
}
