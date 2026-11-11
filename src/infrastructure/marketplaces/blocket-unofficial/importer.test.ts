import assert from "node:assert/strict";
import test from "node:test";
import { BlocketUnofficialClient } from "./client";
import { BlocketUnofficialImporter } from "./importer";

test("recovers a gallery from the listing page and reuses it while the search feed is empty", async () => {
  const listingUrl = "https://www.blocket.se/mobility/item/123";
  const cdn = "https://images.blocketcdn.se/dynamic";
  const fetches: string[] = [];
  let detailCache = new Map<string, unknown>();
  let searchImages: string[] = [];

  const client = new BlocketUnofficialClient("https://blocket-api.se", async (input) => {
    const url = new URL(String(input));
    fetches.push(url.pathname);
    if (url.pathname === "/v1/search/car") {
      return Response.json({
        docs: [{
          id: "123", heading: "Audi Q3", canonical_url: listingUrl,
          location: "Täby", price: { amount: 329900 }, year: 2022, make: "Audi",
          model: "Q3", image_urls: searchImages,
        }],
        metadata: { result_size: { match_count: 1 }, paging: { current: 1, last: 1 } },
      });
    }
    if (url.pathname === "/v1/ad/car") {
      return Response.json({ description: "Seller text", specifications: { Biltyp: "SUV", Effekt: "190 hk" } });
    }
    return new Response(`<img src="${cdn}/640w/item/123/front"><img src="${cdn}/320w/item/123/side">`);
  });

  const importer = new BlocketUnofficialImporter(client, async () => detailCache);
  const fetchPage = async () => {
    const result = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async ({ error }) => { throw error; });
    return result.listings[0];
  };
  const imported = await fetchPage();
  const gallery = [`${cdn}/default/item/123/front`, `${cdn}/default/item/123/side`];
  assert.deepEqual(imported.listing.images.map(({ url }) => url), gallery);
  const raw = imported.rawPayload as { detail: unknown };
  detailCache = new Map([["123", raw.detail]]);

  fetches.length = 0;
  assert.deepEqual((await fetchPage()).listing.images.map(({ url }) => url), gallery);
  assert.deepEqual(fetches, ["/v1/search/car"]);

  searchImages = [`${cdn}/default/item/123/new-front`];
  assert.deepEqual((await fetchPage()).listing.images.map(({ url }) => url), searchImages);
});
