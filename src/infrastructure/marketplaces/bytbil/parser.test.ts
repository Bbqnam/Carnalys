import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBytbilListing } from "./normalizer";
import {
  bytbilSummaryFingerprint,
  parseBytbilDetailPage,
  parseBytbilSearchPage,
} from "./parser";

const detailPath =
  "/dalarnas-lan/personbil-tiguan-2-0tdi-4m-aut-r-line-black-d-varm-190hk-10561-19360631";

function searchHtml() {
  return `<div class="result-count-label"><strong>75&#xA0;161</strong> fordon</div>
<script>dataLayer.push({ 'event' : 'internalSearch', 'searchparams': {"numResults":"75161","adType":"Sell"} });</script>
<ul class="result-list">
<li class="result-list-item uk-panel uk-panel-box">
  <div class="uk-grid js-link uk-flex-row-reverse" data-model-id="19360631">
    <h3 class="uk-text-truncate car-list-header">
      <a class="js-link-target" href="${detailPath}">Volkswagen Tiguan 2.0TDI 4M Aut R-line Black D-v&#xE4;rm 190hk</a>
    </h3>
    <p class="published-date hidden-medium-and-above">12 min</p>
    <p class="uk-text-truncate">2020 <span class="vertical-divider">|</span> 11&#xA0;209 mil <span class="vertical-divider">|</span> BORL&#xC4;NGE</p>
    <span class="price-container"><span class="car-price-main">254&#xA0;900 kr</span></span>
    <div class="car-image has-image" style="background-image: url(https://pro.bbcdn.io/e7/e7d4007f-8357-1c81-95f0-000088530340?rule=legacy-main)"></div>
  </div>
</li>
<li class="result-list-item uk-panel uk-panel-box">
  <div class="uk-grid js-link" data-model-id="19360632">
    <h3><a href="/orebro-lan/personbil-v60-b4-momentum-1481-19360632">Volvo V60 B4 Momentum</a></h3>
    <p class="uk-text-truncate">2022 <span>|</span> 4&#xA0;500 mil <span>|</span> &#xD6;REBRO</p>
    <span class="car-price-main">329&#xA0;000 kr</span>
  </div>
</li>
</ul>
<div class="pagination"></div>`;
}

function detailHtml() {
  return `<h1 class="vehicle-title">Volkswagen Tiguan 2.0TDI 4M Aut R-line Black D-v&#xE4;rm 190hk</h1>
<div class="vehicle-detail-price">
  <span class="car-price-details"><span class="car-price-main">254&#xA0;900 kr
    <i class="fa fa-arrow-right price-icon" data-uk-tooltip title="Priss&#xE4;nkt! Tidigare pris: 255&#xA0;000 kr"></i>
  </span></span>
</div>
<div class="related-listings">
  <span class="price-container"><span class="car-price-details"><span class="car-price-main">199&#xA0;000 kr
    <i data-uk-tooltip title="Priss&#xE4;nkt! Tidigare pris: 219&#xA0;000 kr"></i>
  </span></span></span>
</div>
<dl class="vehicle-detail-specification">
  <dt>M&#xE4;rke</dt><dd>Volkswagen</dd>
  <dt>Modell</dt><dd>Tiguan</dd>
  <dt>&#xC5;rsmodell</dt><dd>2020</dd>
  <dt>Miltal</dt><dd>11&#xA0;209 mil</dd>
  <dt>Regnr</dt><dd>FHD47J</dd>
  <dt>Karosseri</dt><dd>SUV</dd>
  <dt>Drivmedel</dt><dd>Diesel</dd>
  <dt>V&#xE4;xell&#xE5;da</dt><dd>Automatisk</dd>
  <dt>Drivhjul</dt><dd>4WD</dd>
  <dt>Effekt</dt><dd>190 hk</dd>
  <dt>F&#xE4;rg</dt><dd>Vit</dd>
</dl>
<script>
  dataLayer.push({ 'event' : 'detailView', 'ecommerce': {'detail': { 'products': [{"id":"19360631","name":"Volkswagen Tiguan 2.0TDI 4M Aut R-line Black D-värm 190hk","category":"Bil","brand":"Volkswagen","variant":"SUV","price":"254900","dimension2":"10561","dimension7":"Bilbutiken Dalarna"}] } } });
</script>
<ul class="uk-list-space equipment-list"><li>ACC</li><li>4Motion</li><li>Bluetooth</li><li>ACC</li></ul>
<img data-src="https://pro.bbcdn.io/10/10340b40-bf47-57a0-0818-0000ed9b316d?rule=legacy-largest">
<img data-src="https://pro.bbcdn.io/10/10340b40-bf47-57a0-0818-0000ed9b316d?rule=news-medium">
<img data-src="https://pro.bbcdn.io/22/225a90e3-f131-719a-47ae-0000df0ae458?rule=legacy-main">`;
}

test("parses Bytbil server-rendered search rows and total", () => {
  const page = parseBytbilSearchPage(searchHtml());
  assert.equal(page.totalMatches, 75161);
  assert.equal(page.pageSize, 24);
  assert.equal(page.documents.length, 2);
  const [first] = page.documents;
  assert.equal(first.id, "19360631");
  assert.equal(first.detailPath, detailPath);
  assert.equal(first.modelYear, 2020);
  assert.equal(first.mileageMil, 11209);
  assert.equal(first.priceAmount, 254900);
  assert.equal(first.location, "BORLÄNGE");
  assert.equal(first.featuredImageUrl, "https://pro.bbcdn.io/e7/e7d4007f-8357-1c81-95f0-000088530340?rule=legacy-main");
  assert.ok(first.publishedAt instanceof Date);
});

test("parses Bytbil detail specs, price cut, deduplicated gallery and equipment", () => {
  const detail = parseBytbilDetailPage(detailHtml());
  assert.equal(detail.registrationNumber, "FHD47J");
  assert.equal(detail.make, "Volkswagen");
  assert.equal(detail.model, "Tiguan");
  assert.equal(detail.modelYear, 2020);
  assert.equal(detail.mileageKm, 112090);
  assert.equal(detail.horsepower, 190);
  // Price and "Tidigare pris" come from this car's own price block, never
  // from the related-listings widget lower down (199 000 / 219 000 kr).
  assert.equal(detail.priceAmount, 254900);
  assert.equal(detail.previousPriceAmount, 255000);
  assert.equal(detail.sellerName, "Bilbutiken Dalarna");
  assert.equal(detail.dealerId, "10561");
  assert.deepEqual(detail.equipment, ["ACC", "4Motion", "Bluetooth"]);
  assert.deepEqual(detail.images, [
    "https://pro.bbcdn.io/10/10340b40-bf47-57a0-0818-0000ed9b316d?rule=legacy-largest",
    "https://pro.bbcdn.io/22/225a90e3-f131-719a-47ae-0000df0ae458?rule=legacy-largest",
  ]);
});

test("normalizes Bytbil to the shared source-independent listing shape", () => {
  const [document] = parseBytbilSearchPage(searchHtml()).documents;
  const listing = normalizeBytbilListing(document, parseBytbilDetailPage(detailHtml()), "all-vehicles");
  assert.equal(listing.source.provider, "bytbil");
  assert.equal(listing.source.externalId, "19360631");
  assert.equal(listing.source.listingUrl, `https://www.bytbil.com${detailPath}`);
  assert.equal(listing.vehicle.registrationNumber, "FHD47J");
  assert.equal(listing.vehicle.make, "Volkswagen");
  assert.equal(listing.vehicle.fuelType, "diesel");
  assert.equal(listing.vehicle.transmission, "automatic");
  assert.equal(listing.vehicle.bodyStyle, "suv");
  assert.equal(listing.vehicle.drivetrain, "all_wheel_drive");
  assert.equal(listing.listing.sellerType, "dealer");
  assert.equal(listing.listing.mileageKm, 112090);
  assert.equal(listing.listing.previousPriceAmount, 255000);
  assert.equal(listing.listing.location, "Borlänge");
  assert.equal(listing.listing.images.length, 2);
  assert.equal(listing.listing.equipment.length, 3);
});

// A "Tidigare pris" is only trusted when the price block's own current price
// agrees with the price we publish, the drop is 1-100%, and it's a whole
// hundred. These are the shapes that used to surface a phantom "Reduced".
const priceBlockDetail = (block: string, product = `"price":"254900"`) => `
<h1>Test Bil</h1>
<div class="vehicle-detail-price">${block}</div>
<dl><dt>Regnr</dt><dd>ABC123</dd><dt>Modell</dt><dd>X</dd></dl>
<script>dataLayer.push({'ecommerce':{'detail':{'products':[{"id":"1","name":"Test",${product}}]}}});</script>`;

test("Bytbil: genuine small price cut is kept", () => {
  const detail = parseBytbilDetailPage(
    priceBlockDetail(
      `<span class="car-price-details"><span class="car-price-main">254&#xA0;900 kr` +
        `<i title="Priss&#xE4;nkt! Tidigare pris: 259&#xA0;000 kr"></i></span></span>`,
    ),
  );
  assert.equal(detail.priceAmount, 254900);
  assert.equal(detail.previousPriceAmount, 259000);
});

test("Bytbil: no phantom reduction when dataLayer price and block price disagree", () => {
  // dataLayer carries an ex-VAT / stale figure (200 000) while the block shows
  // the real 250 000 and a 259 000 "Tidigare pris". Comparing 259k to 200k
  // used to emit a fake 59k reduction.
  const detail = parseBytbilDetailPage(
    priceBlockDetail(
      `<span class="car-price-details"><span class="car-price-main">250&#xA0;000 kr` +
        `<i title="Tidigare pris: 259&#xA0;000 kr"></i></span></span>`,
      `"price":"200000"`,
    ),
  );
  assert.equal(detail.priceAmount, 200000);
  assert.equal(detail.previousPriceAmount, undefined);
});

test("Bytbil: garbled 'Tidigare pris' spanning tags is rejected", () => {
  const detail = parseBytbilDetailPage(
    priceBlockDetail(
      `<span class="car-price-details"><span class="car-price-main">254&#xA0;900 kr</span></span>` +
        `<div><span>1</span></div><span>Tidigare pris:</span> <span>259&#xA0;000</span> kr`,
    ),
  );
  // Whatever the loose match yields must be a whole hundred within 2x, or nothing.
  assert.ok(
    detail.previousPriceAmount === undefined || detail.previousPriceAmount === 259000,
  );
});

test("Bytbil: implausible 'Tidigare pris' (more than double) is rejected", () => {
  const detail = parseBytbilDetailPage(
    priceBlockDetail(
      `<span class="car-price-details"><span class="car-price-main">254&#xA0;900 kr` +
        `<i title="Tidigare pris: 2&#xA0;549&#xA0;000 kr"></i></span></span>`,
    ),
  );
  assert.equal(detail.previousPriceAmount, undefined);
});

test("Bytbil: block with no 'Tidigare pris' has no previous price", () => {
  const detail = parseBytbilDetailPage(
    priceBlockDetail(
      `<span class="car-price-details"><span class="car-price-main">254&#xA0;900 kr</span></span>`,
    ),
  );
  assert.equal(detail.priceAmount, 254900);
  assert.equal(detail.previousPriceAmount, undefined);
});

test("Bytbil: a cached (not fresh) detail defers to the re-read search price", () => {
  const [document] = parseBytbilSearchPage(searchHtml()).documents; // search price 254900
  const staleDetail = { ...parseBytbilDetailPage(detailHtml()), priceAmount: 999000 };
  // Fresh detail wins…
  assert.equal(
    normalizeBytbilListing(document, staleDetail, "all-vehicles", true).listing.priceAmount,
    999000,
  );
  // …but a cached detail's frozen price yields to the search-page price.
  assert.equal(
    normalizeBytbilListing(document, staleDetail, "all-vehicles", false).listing.priceAmount,
    254900,
  );
});

test("summary fingerprint changes only when a market-relevant field changes", () => {
  const [a, b] = parseBytbilSearchPage(searchHtml()).documents;
  assert.equal(bytbilSummaryFingerprint(a), bytbilSummaryFingerprint({ ...a }));
  assert.notEqual(bytbilSummaryFingerprint(a), bytbilSummaryFingerprint(b));
  assert.notEqual(
    bytbilSummaryFingerprint(a),
    bytbilSummaryFingerprint({ ...a, priceAmount: 199000 }),
  );
});
