import type { ListingImage } from "@/domain/vehicle";

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

/**
 * Finds the next image whose URL has not failed in this browser session.
 * The current index is only returned after a complete wrap, which lets the
 * same helper power both next/previous controls and automatic failover.
 */
export function nextUsableImageIndex(
  images: readonly ListingImage[],
  failedUrls: ReadonlySet<string>,
  currentIndex: number,
  direction: -1 | 1,
) {
  if (images.length === 0) return undefined;

  for (let offset = 1; offset <= images.length; offset += 1) {
    const candidate = wrapIndex(currentIndex + direction * offset, images.length);
    if (!failedUrls.has(images[candidate].url)) return candidate;
  }

  return undefined;
}

export function firstUsableImageIndex(
  images: readonly ListingImage[],
  failedUrls: ReadonlySet<string>,
) {
  const index = images.findIndex((image) => !failedUrls.has(image.url));
  return index === -1 ? undefined : index;
}
