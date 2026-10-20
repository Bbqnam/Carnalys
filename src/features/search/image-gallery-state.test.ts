import assert from "node:assert/strict";
import test from "node:test";
import type { ListingImage } from "@/domain/vehicle";
import {
  firstUsableImageIndex,
  nextUsableImageIndex,
} from "./image-gallery-state";

const images: readonly ListingImage[] = ["broken-cover", "front", "broken-side", "rear"].map(
  (url, position) => ({ url, position }),
);
const failed = new Set(["broken-cover", "broken-side"]);

test("finds the first working gallery image when the cover URL failed", () => {
  assert.equal(firstUsableImageIndex(images, failed), 1);
});

test("steps past failed images in both directions", () => {
  assert.equal(nextUsableImageIndex(images, failed, 1, 1), 3);
  assert.equal(nextUsableImageIndex(images, failed, 3, -1), 1);
});

test("returns undefined when every image failed", () => {
  assert.equal(
    nextUsableImageIndex(images, new Set(images.map(({ url }) => url)), 0, 1),
    undefined,
  );
});
