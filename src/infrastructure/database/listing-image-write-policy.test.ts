import assert from "node:assert/strict";
import test from "node:test";
import { listingImageWritePolicy } from "./listing-image-write-policy";

test("preserves a known-good gallery when the incoming feed is empty", () => {
  assert.deepEqual(
    listingImageWritePolicy({
      existingImageCount: 4,
      existingImageHash: "existing",
      incomingImageCount: 0,
      incomingImageHash: "empty",
    }),
    { imageHash: "existing", shouldReplaceImages: false },
  );
});

test("writes a recovered gallery into a listing that currently has no images", () => {
  assert.deepEqual(
    listingImageWritePolicy({
      existingImageCount: 0,
      existingImageHash: "empty",
      incomingImageCount: 3,
      incomingImageHash: "recovered",
    }),
    { imageHash: "recovered", shouldReplaceImages: true },
  );
});

test("allows an initial empty gallery for a newly discovered listing", () => {
  assert.deepEqual(
    listingImageWritePolicy({
      incomingImageCount: 0,
      incomingImageHash: "empty",
    }),
    { imageHash: "empty", shouldReplaceImages: true },
  );
});
