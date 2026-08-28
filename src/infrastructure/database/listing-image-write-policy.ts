interface ListingImageWritePolicyInput {
  existingImageCount?: number;
  existingImageHash?: string | null;
  incomingImageCount: number;
  incomingImageHash: string;
}

/**
 * An empty marketplace response is not proof that a seller removed every
 * photo. Preserve a known-good gallery until the source provides another
 * non-empty gallery; this prevents transient feed lag from erasing images.
 */
export function listingImageWritePolicy({
  existingImageCount,
  existingImageHash,
  incomingImageCount,
  incomingImageHash,
}: ListingImageWritePolicyInput) {
  const hasExistingListing = existingImageCount !== undefined;
  const preserveExisting =
    hasExistingListing && existingImageCount > 0 && incomingImageCount === 0;
  const imageHash = preserveExisting
    ? (existingImageHash ?? null)
    : incomingImageHash;
  const shouldReplaceImages =
    !hasExistingListing ||
    (!preserveExisting &&
      (existingImageHash !== incomingImageHash ||
        (existingImageCount === 0 && incomingImageCount > 0)));

  return { imageHash, shouldReplaceImages };
}
