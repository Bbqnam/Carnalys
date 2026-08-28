export interface RepresentativeListingCandidate {
  id: string;
  vehicleId: string;
  synchronizedAt: Date;
}

/**
 * Market cohorts count one ad per physical vehicle: the most recently
 * synchronized active listing wins, with listing id as a deterministic tie
 * breaker. Every source listing remains stored and visible; only statistical
 * input is deduplicated.
 */
export function selectRepresentativeListings<T extends RepresentativeListingCandidate>(
  listings: readonly T[],
) {
  const selected = new Map<string, T>();
  for (const listing of listings) {
    const current = selected.get(listing.vehicleId);
    if (
      !current ||
      listing.synchronizedAt > current.synchronizedAt ||
      (listing.synchronizedAt.valueOf() === current.synchronizedAt.valueOf() && listing.id < current.id)
    ) {
      selected.set(listing.vehicleId, listing);
    }
  }
  return [...selected.values()];
}
