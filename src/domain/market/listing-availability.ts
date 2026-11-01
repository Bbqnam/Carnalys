export type HostAvailability = "active" | "missing" | "reserved" | "inconclusive";

export interface HostAvailabilityEvidence {
  availability: HostAvailability;
  reason: string;
  checkedAt: string;
  url: string;
  httpStatus: number | null;
  priceAmount?: number;
}

// A freshness policy, not a claim that a car cannot sell between two checks.
// Only a positive original-host check is reusable for recommendations.
export const recommendationVerificationMaxAgeMs = 5 * 60_000;
export const catalogueConfirmationMaxAgeMs = 7 * 86_400_000;

export function hasFreshHostConfirmation(
  listing: { status: string; availabilityCheckStatus: string | null; availabilityConfirmedAt: Date | null },
  now = new Date(),
  maxAgeMs = recommendationVerificationMaxAgeMs,
) {
  const confirmed = listing.availabilityConfirmedAt?.getTime();
  return listing.status === "active" && listing.availabilityCheckStatus === "active:host" &&
    confirmed != null && confirmed <= now.getTime() && now.getTime() - confirmed <= maxAgeMs;
}

export function catalogueFreshnessCutoff(now = new Date()) {
  // Stable within the catalogue count cache's 15-minute window.
  return new Date(Math.floor(now.getTime() / 900_000) * 900_000 - catalogueConfirmationMaxAgeMs);
}
