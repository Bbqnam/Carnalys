import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBlocketListing } from "./normalizer";
import type { BlocketListingDetail, BlocketSearchDocument } from "./types";

const document: BlocketSearchDocument = {
  id: "123",
  heading: "Volvo V60",
  canonicalUrl: "https://www.blocket.se/mobility/item/123",
  location: "Stockholm",
  priceAmount: 250_000,
  year: 2021,
  mileageMil: 5_000,
  make: "Volvo",
  model: "V60",
  imageUrls: ["https://images.example/stale-cover"],
  thumbnail: { url: "https://images.example/stale-cover" },
  raw: {},
};

test("prefers a public-page gallery over stale non-empty search-feed images", () => {
  const detail: BlocketListingDetail = {
    equipment: [],
    specifications: {},
    imageUrls: [
      "https://images.example/fresh-cover",
      "https://images.example/fresh-side",
    ],
    raw: {},
  };

  const normalized = normalizeBlocketListing(document, detail, "all-cars");

  assert.deepEqual(
    normalized.listing.images.map(({ url }) => url),
    detail.imageUrls,
  );
  assert.equal(normalized.listing.images[0].thumbnailUrl, undefined);
});

test("keeps search-feed images when no page gallery was fetched", () => {
  const normalized = normalizeBlocketListing(document, undefined, "all-cars");
  assert.equal(normalized.listing.images[0].url, document.imageUrls[0]);
});
