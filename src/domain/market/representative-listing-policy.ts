import { catalogueFreshnessCutoff } from "./listing-availability";
export interface RepresentativeListingCandidate {
  id: string;
  vehicleId: string;
  synchronizedAt: Date;
  lastSeenAt?: Date;
  availabilityCheckStatus?: string | null;
  availabilityConfirmedAt?: Date | null;
  listedAt?: Date | null;
  publishedAt?: Date | null;
  firstSeenAt?: Date;
}

/**
 * Market cohorts count one ad per physical vehicle: the most recently
 * published or discovered active listing wins. Refresh time and listing id
 * break ties. Every source listing remains stored and visible; only statistical
 * input is deduplicated.
 */
export function selectRepresentativeListings<T extends RepresentativeListingCandidate>(
  listings: readonly T[],
  now = new Date(),
) {
  const cutoff = catalogueFreshnessCutoff(now);
  const selected = new Map<string, T>();
  for (const listing of listings) {
    const fresh = !listing.lastSeenAt || listing.lastSeenAt >= cutoff ||
      (listing.availabilityCheckStatus === "active:host" &&
        listing.availabilityConfirmedAt && listing.availabilityConfirmedAt >= cutoff);
    if (!fresh) continue;
    const current = selected.get(listing.vehicleId);
    const listingDate = listing.listedAt ?? listing.publishedAt ?? listing.firstSeenAt ?? listing.synchronizedAt;
    const currentDate = current && (current.listedAt ?? current.publishedAt ?? current.firstSeenAt ?? current.synchronizedAt);
    if (
      !currentDate || listingDate > currentDate ||
      (listingDate.valueOf() === currentDate.valueOf() &&
        (listing.synchronizedAt > current.synchronizedAt ||
          (listing.synchronizedAt.valueOf() === current.synchronizedAt.valueOf() && listing.id < current.id)))
    ) {
      selected.set(listing.vehicleId, listing);
    }
  }
  return [...selected.values()];
}
