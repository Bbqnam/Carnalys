import type { NormalizedVehicleListing } from "./types";

// Dated search results establish the time boundary even when first discovered
// during recovery. Undated results require evidence they predate that boundary.
export function pageCoversPreviousUpdate(
  listings: readonly NormalizedVehicleListing[],
  rejectedCount: number,
  previouslyKnownIds: ReadonlySet<string>,
  cutoff: Date,
) {
  return rejectedCount === 0 && listings.length > 0 &&
    listings.every(({ source }) => {
      const latestPublication = source.publishedBefore ?? source.publishedAt;
      return latestPublication
        ? latestPublication <= cutoff
        : previouslyKnownIds.has(source.externalId);
    });
}
