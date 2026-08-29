import type {
  BytbilListingDetail,
  BytbilSearchDocument,
  BytbilSearchPage,
} from "./types";

type JsonObject = Record<string, unknown>;

const PAGE_SIZE = 24;

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Digits only. HTML entities — notably the `&#xA0;` / `&nbsp;` thousands
 * separators Bytbil uses — are neutralised first so the entity's own
 * characters can never leak a stray digit into the parsed number.
 */
function integer(value: string | undefined) {
  if (value === undefined || value === null) return undefined;
  const digits = value
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Last dash-separated group of digits in a detail path is the ad id. */
function externalIdFromPath(path: string) {
  const match = path.match(/-(\d+)(?:[/?#].*)?$/);
  return match ? match[1] : undefined;
}

/**
 * Bytbil shows renewal age as "Just nu" / "12 min" / "3 dagar", never an
 * absolute timestamp. An approximate publishedAt is still enough for the
 * incremental run's "known and past the lookback window" stop condition.
 */
function relativePublishedAt(label: string | undefined, now = Date.now()) {
  if (!label) return undefined;
  const value = label.toLocaleLowerCase("sv-SE").trim();
  if (value.includes("just nu") || value.includes("nyss")) return new Date(now);
  const match = value.match(/(\d+)\s*(minut|min|timm|tim|dygn|dag|veck|månad|mån|år)/);
  if (!match) return undefined;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const minute = 60_000;
  const scale = unit.startsWith("min")
    ? minute
    : unit.startsWith("tim")
      ? 60 * minute
      : unit.startsWith("dyg") || unit.startsWith("dag")
        ? 24 * 60 * minute
        : unit.startsWith("veck")
          ? 7 * 24 * 60 * minute
          : unit.startsWith("mån")
            ? 30 * 24 * 60 * minute
            : 365 * 24 * 60 * minute;
  return new Date(now - amount * scale);
}

export function parseBytbilSearchPage(html: string): BytbilSearchPage {
  const rows = [
    ...html.matchAll(
      /<li class="result-list-item[^"]*"[^>]*>([\s\S]*?)<\/li>(?=\s*(?:<li class="result-list-item|<\/ul>|<div class="pagination|<nav|<\/div>))/g,
    ),
  ];
  // Fallback: a responsive layout that wraps each hit in a div carrying the id.
  const blocks =
    rows.length > 0
      ? rows.map((match) => match[1])
      : [
          ...html.matchAll(
            /data-model-id="(\d+)"([\s\S]*?)(?=data-model-id="\d+"|<article|<footer|$)/g,
          ),
        ].map((match) => match[0]);

  const documents: BytbilSearchDocument[] = [];
  let rejectedCount = 0;
  const seen = new Set<string>();

  for (const block of blocks) {
    const detailPath = block.match(
      /href="(\/[a-z-]+\/(?:personbil|transportbil)-[^"#?]+)"/i,
    )?.[1];
    const id =
      block.match(/data-(?:model|ad)-id="(\d+)"/)?.[1] ??
      (detailPath ? externalIdFromPath(detailPath) : undefined);
    const titleMatch = block.match(
      /<a[^>]*href="\/[a-z-]+\/(?:personbil|transportbil)-[^"]+"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const title = titleMatch ? decodeHtml(titleMatch[1]) : undefined;
    if (!id || !detailPath || !title) {
      rejectedCount += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    const specLine = [...block.matchAll(/<p class="uk-text-truncate"[^>]*>([\s\S]*?)<\/p>/g)]
      .map((match) => decodeHtml(match[1]))
      .find((value) => /\d/.test(value));
    const parts = specLine ? specLine.split("|").map((part) => part.trim()) : [];
    const modelYear = parts.map((part) => part.match(/^(19|20)\d{2}$/)?.[0]).find(Boolean);
    const mileageMil = parts
      .map((part) => (/\bmil\b/i.test(part) ? integer(part) : undefined))
      .find((value) => value !== undefined);
    const location = parts.find(
      (part) => part && !/^(19|20)\d{2}$/.test(part) && !/\bmil\b/i.test(part),
    );

    const priceAmount = integer(block.match(/car-price-main[^>]*>([\s\S]*?)kr/)?.[1]);
    const featuredImageUrl = block.match(
      /background-image:\s*url\((?:&#39;|'|")?(https:\/\/[^)'"&\s]+)/,
    )?.[1];
    const publishedLabel = [
      ...block.matchAll(/<p class="published-date[^"]*"[^>]*>([\s\S]*?)<\/p>/g),
    ]
      .map((match) => decodeHtml(match[1]))
      .find(Boolean);

    documents.push({
      id,
      detailPath,
      title,
      modelYear: modelYear ? Number.parseInt(modelYear, 10) : undefined,
      mileageMil,
      priceAmount,
      location,
      featuredImageUrl,
      publishedAt: relativePublishedAt(publishedLabel),
      raw: { id, detailPath, title, specLine, priceAmount, publishedLabel },
    });
  }

  const totalMatches =
    integer(html.match(/"numResults"\s*:\s*"?([\d\s]+?)"?[,}]/)?.[1]) ??
    integer(html.match(/result-count-label[^>]*>\s*<strong>([\s\S]*?)<\/strong>/)?.[1]) ??
    documents.length;
  const currentPage =
    integer(html.match(/[?&]Page=(\d+)/)?.[1]) ??
    integer(html.match(/pagination[\s\S]*?uk-active[\s\S]*?>(\d+)</)?.[1]) ??
    1;

  if (documents.length === 0 && rejectedCount === 0) {
    throw new Error("Bytbils sökträffar kunde inte läsas; strukturen kan ha ändrats.");
  }

  return { documents, totalMatches, currentPage, pageSize: PAGE_SIZE, rejectedCount };
}

function specMap(html: string) {
  const specs = new Map<string, string>();
  for (const [, term, definition] of html.matchAll(
    /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g,
  )) {
    const key = decodeHtml(term).toLocaleLowerCase("sv-SE");
    const value = decodeHtml(definition);
    if (key && value) specs.set(key, value);
  }
  return specs;
}

function dataLayerProduct(html: string): JsonObject | undefined {
  const match = html.match(/'products'\s*:\s*\[\s*(\{[\s\S]*?\})\s*\]/);
  if (!match) return undefined;
  try {
    return object(JSON.parse(match[1]));
  } catch {
    return undefined;
  }
}

export function parseBytbilDetailPage(html: string): BytbilListingDetail {
  const specs = specMap(html);
  const product = dataLayerProduct(html);
  if (specs.size === 0 && !product) {
    throw new Error("Bytbils annonsdata kunde inte läsas; strukturen kan ha ändrats.");
  }

  const title =
    decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") || text(product?.name);

  // The viewed car's price sits in `.vehicle-detail-price`. `car-price-main`
  // is now reused by the "other listings from this dealer" widget far lower
  // on the page (~19k chars away), so scraping it across the whole document
  // returned a different car's price and its "Tidigare pris" tooltip as a
  // fake reduction. dataLayer's product price is a single id-matched value
  // for this car — trust it first; otherwise read a short fixed window right
  // after the `.vehicle-detail-price` anchor and nothing beyond it.
  const anchor = html.indexOf("vehicle-detail-price");
  const priceBlock = anchor >= 0 ? html.slice(anchor, anchor + 320) : undefined;
  const priceAmount =
    integer(text(product?.price)) ??
    integer(priceBlock?.match(/car-price-details[^>]*>([\s\S]*?)kr/)?.[1]) ??
    integer(priceBlock?.match(/>\s*([^<]*?)kr/)?.[1]);
  const previousParsed = integer(
    priceBlock?.match(/[Tt]idigare pris:\s*([\s\S]*?)kr/)?.[1],
  );
  const previousPriceAmount =
    previousParsed !== undefined &&
    priceAmount !== undefined &&
    previousParsed > priceAmount
      ? previousParsed
      : undefined;

  const mileageMil = specs.get("miltal");
  const mileageKm = mileageMil ? (integer(mileageMil) ?? 0) * 10 : undefined;
  const power = specs.get("effekt") ?? specs.get("motoreffekt") ?? specs.get("hästkrafter");

  const uuids = new Map<string, string>();
  for (const [, prefix, uuid] of html.matchAll(
    /https:\/\/pro\.bbcdn\.io\/([0-9a-f]{2})\/([0-9a-f-]{36})/g,
  )) {
    if (!uuids.has(uuid)) uuids.set(uuid, prefix);
  }
  const images = [...uuids].map(
    ([uuid, prefix]) => `https://pro.bbcdn.io/${prefix}/${uuid}?rule=legacy-largest`,
  );

  const equipmentBlock = html.match(
    /<ul class="[^"]*equipment-list"[^>]*>([\s\S]*?)<\/ul>/,
  )?.[1];
  const equipment = equipmentBlock
    ? [
        ...new Set(
          [...equipmentBlock.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
            .map((match) => decodeHtml(match[1]))
            .filter(Boolean),
        ),
      ]
    : [];

  return {
    title: title || undefined,
    description:
      decodeHtml(html.match(/vehicle-detail-description[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "") ||
      undefined,
    make: specs.get("märke") ?? text(product?.brand),
    model: specs.get("modell"),
    variant: specs.get("version") ?? specs.get("modellbeteckning"),
    registrationNumber: specs.get("regnr")?.replace(/\s+/g, "").toUpperCase(),
    modelYear: integer(specs.get("årsmodell")),
    bodyType: specs.get("karosseri") ?? text(product?.variant),
    fuelType: specs.get("drivmedel") ?? specs.get("bränsle"),
    transmission: specs.get("växellåda"),
    drivetrain: specs.get("drivhjul") ?? specs.get("drivning"),
    horsepower: integer(power),
    engineDisplacementCc: integer(specs.get("motorstorlek") ?? specs.get("cylindervolym")),
    colour: specs.get("färg"),
    mileageKm,
    priceAmount,
    previousPriceAmount,
    sellerName: text(product?.dimension7),
    dealerId: text(product?.dimension2),
    images,
    equipment,
    raw: { specs: Object.fromEntries(specs), product: product ?? null },
  };
}

export function bytbilSummaryFingerprint(document: BytbilSearchDocument) {
  return JSON.stringify({
    title: document.title,
    price: document.priceAmount,
    mileage: document.mileageMil,
    year: document.modelYear,
    image: document.featuredImageUrl,
  });
}
