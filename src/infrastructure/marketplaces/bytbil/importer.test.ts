import assert from "node:assert/strict";
import test from "node:test";
import { BytbilImporter } from "./importer";
import { bytbilSummaryFingerprint, parseBytbilSearchPage } from "./parser";

const detailPath = "/dalarnas-lan/personbil-tiguan-190hk-10561-19360631";

function searchHtml() {
  return `<script>dataLayer.push({ 'searchparams': {"numResults":"48"} });</script>
<ul class="result-list">
<li class="result-list-item">
  <div class="uk-grid js-link" data-model-id="19360631">
    <a href="${detailPath}">Volkswagen Tiguan 2.0TDI 4M 190hk</a>
    <p class="published-date">1 timme</p>
    <p class="uk-text-truncate">2020 <span>|</span> 11&#xA0;209 mil <span>|</span> BORL&#xC4;NGE</p>
    <span class="car-price-main">254&#xA0;900 kr</span>
    <div class="car-image has-image" style="background-image: url(https://pro.bbcdn.io/e7/e7d4007f-8357-1c81-95f0-000088530340?rule=legacy-main)"></div>
  </div>
</li>
</ul>
<div class="pagination"></div>`;
}

function detailHtml() {
  return `<h1>Volkswagen Tiguan 2.0TDI 4M 190hk</h1>
<span class="car-price-main">254&#xA0;900 kr</span>
<dl>
  <dt>M&#xE4;rke</dt><dd>Volkswagen</dd>
  <dt>Modell</dt><dd>Tiguan</dd>
  <dt>Miltal</dt><dd>11&#xA0;209 mil</dd>
  <dt>Regnr</dt><dd>FHD47J</dd>
  <dt>Drivmedel</dt><dd>Diesel</dd>
  <dt>V&#xE4;xell&#xE5;da</dt><dd>Automatisk</dd>
</dl>
<script>dataLayer.push({ 'ecommerce': {'detail': { 'products': [{"id":"19360631","brand":"Volkswagen","variant":"SUV","dimension2":"10561","dimension7":"Bilbutiken Dalarna"}] } } });</script>`;
}

test("Bytbil adapter fetches detail for a newly discovered summary", async () => {
  let detailRequests = 0;
  const importer = new BytbilImporter(
    {
      search: async () => searchHtml(),
      detail: async () => {
        detailRequests += 1;
        return detailHtml();
      },
    },
    async () => new Map(),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(page.listings.length, 1);
  assert.equal(page.currentPage, 1);
  assert.equal(page.lastPage, 2);
  assert.equal(detailRequests, 1);
  assert.equal(page.listings[0].vehicle.registrationNumber, "FHD47J");
});

test("an unchanged summary reuses the structured detail cache without a request", async () => {
  const parsedDocument = parseBytbilSearchPage(searchHtml()).documents[0];
  let detailRequests = 0;
  const importer = new BytbilImporter(
    {
      search: async () => searchHtml(),
      detail: async () => {
        detailRequests += 1;
        return detailHtml();
      },
    },
    async () =>
      new Map([
        [
          parsedDocument.id,
          {
            detail: {
              __normalizedBytbilDetail: true,
              registrationNumber: "FHD47J",
              make: "Volkswagen",
              model: "Tiguan",
              fuelType: "Diesel",
              transmission: "Automatisk",
              mileageKm: 112090,
            },
            cachedImages: ["https://pro.bbcdn.io/10/10340b40-bf47-57a0-0818-0000ed9b316d?rule=legacy-largest"],
            cachedEquipment: ["ACC"],
            summaryFingerprint: bytbilSummaryFingerprint(parsedDocument),
            // Confirmed against the detail page recently, so the staleness
            // re-fetch does not trigger.
            detailFetchedAt: new Date().toISOString(),
          },
        ],
      ]),
  );
  const page = await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(detailRequests, 0);
  assert.equal(page.listings[0].vehicle.registrationNumber, "FHD47J");
  assert.equal(page.listings[0].listing.equipment.length, 1);
});

test("a detail not confirmed in days is re-fetched even when the summary is unchanged", async () => {
  const parsedDocument = parseBytbilSearchPage(searchHtml()).documents[0];
  let detailRequests = 0;
  const importer = new BytbilImporter(
    {
      search: async () => searchHtml(),
      detail: async () => {
        detailRequests += 1;
        return detailHtml();
      },
    },
    async () =>
      new Map([
        [
          parsedDocument.id,
          {
            detail: { __normalizedBytbilDetail: true, registrationNumber: "FHD47J", make: "Volkswagen", model: "Tiguan", fuelType: "Diesel", transmission: "Automatisk", mileageKm: 112090 },
            cachedImages: [],
            cachedEquipment: [],
            summaryFingerprint: bytbilSummaryFingerprint(parsedDocument),
            detailFetchedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      ]),
  );
  await importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => undefined);
  assert.equal(detailRequests, 1);
});

test("a structural break is retried, reported, then surfaced without touching other sources", async () => {
  let failures = 0;
  const importer = new BytbilImporter({
    search: async () => "<html>structure changed</html>",
    detail: async () => detailHtml(),
  });
  await assert.rejects(
    importer.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, async () => {
      failures += 1;
    }),
    /kunde inte läsas/,
  );
  assert.equal(failures, 5);
});
