import type {
  AutoheroListingDetail,
  AutoheroSearchDocument,
  AutoheroSearchPage,
} from "./types";

type JsonObject = Record<string, unknown>;

/** Autohero image URLs carry a literal `{size}` token where a `WxH-` prefix
 *  belongs (`.../exterior/1/{size}abc.jpg` → `.../exterior/1/1116x744-abc.jpg`).
 *  One large size is requested for every stored image. */
const IMAGE_SIZE = "1116x744-";

function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown) {
  const parsed = number(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

/** Autohero timestamps are compact ISO basic format: `20260630T113335.000Z`. */
function autoheroDate(value: unknown) {
  const raw = text(value);
  if (!raw) return undefined;
  const basic = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  const iso = basic
    ? `${basic[1]}-${basic[2]}-${basic[3]}T${basic[4]}:${basic[5]}:${basic[6]}${basic[7] ?? ""}${basic[8] ?? "Z"}`
    : raw;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function money(value: unknown) {
  const record = object(value);
  const minor = number(record?.amountMinorUnits);
  if (minor === undefined) return undefined;
  const conversion = number(record?.conversionMajor) || 100;
  return Math.round(minor / conversion);
}

function resolveImage(url: string | undefined) {
  return url ? url.replace("{size}", IMAGE_SIZE) : undefined;
}

function normalizeReg(value: unknown) {
  return text(value)?.replace(/\s+/g, "").toUpperCase();
}

// --- search -----------------------------------------------------------------

function mapSearchDocument(raw: JsonObject): AutoheroSearchDocument | undefined {
  const id = text(raw.id);
  const slug = text(raw.carUrlTitle);
  const make = text(raw.manufacturer);
  const model = text(raw.model);
  const modelYear =
    integer(raw.builtYear) ?? integer(raw.firstRegistrationYear);
  const mileageKm = integer(object(raw.mileage)?.distance);
  const priceAmount = money(raw.offerPrice);
  if (!id || !slug || !make || !model || !modelYear || mileageKm === undefined || priceAmount === undefined) {
    return undefined;
  }
  const branch = object(raw.esBranch);
  const usps = Array.isArray(raw.usps)
    ? raw.usps.filter((item): item is string => typeof item === "string")
    : [];
  const previous = money(raw.previousPrice);
  const singleOwner = usps.includes("single-owner");
  const preowners = integer(raw.carPreownerCount);
  return {
    id,
    stockNumber: text(raw.stockNumber),
    slug,
    make,
    model,
    subType: text(raw.subType),
    subTypeExtra: text(raw.subTypeExtra),
    modelYear,
    registrationYear: integer(raw.firstRegistrationYear),
    firstRegistration: autoheroDate(raw.registration),
    mileageKm,
    priceAmount,
    previousPriceAmount: previous && previous > priceAmount ? previous : undefined,
    monthlyCostAmount: money(raw.monthlyPayment),
    fuelTypeId: integer(raw.fuelType),
    gearTypeId: integer(raw.gearType),
    driveTrain: text(raw.driveTrain),
    isPluginSystem:
      typeof raw.isPluginSystem === "boolean" ? raw.isPluginSystem : undefined,
    powerKw: number(raw.kw),
    engineDisplacementCc: integer(raw.ccm),
    co2Value: integer(raw.co2Value),
    fuelConsumptionCombined: number(object(raw.fuelConsumption)?.combined),
    ownerCount: singleOwner ? 1 : preowners,
    hasFilledServiceBook:
      typeof raw.hasFilledServiceBook === "boolean"
        ? raw.hasFilledServiceBook
        : undefined,
    city: text(branch?.city),
    zipcode: text(branch?.zipcode),
    branchName: text(branch?.name),
    publishedAt: autoheroDate(raw.publishedAt),
    firstPublishedAt: autoheroDate(raw.firstPublishedAt),
    featuredImageUrl: resolveImage(text(raw.mainImageUrl)),
    usps,
    raw: {
      id,
      stockNumber: raw.stockNumber,
      carUrlTitle: slug,
      manufacturer: make,
      model: raw.model,
      subType: raw.subType,
      subTypeExtra: raw.subTypeExtra,
      builtYear: raw.builtYear,
      firstRegistrationYear: raw.firstRegistrationYear,
      registration: raw.registration,
      mileage: raw.mileage,
      offerPrice: raw.offerPrice,
      previousPrice: raw.previousPrice,
      monthlyPayment: raw.monthlyPayment,
      fuelType: raw.fuelType,
      gearType: raw.gearType,
      driveTrain: raw.driveTrain,
      isPluginSystem: raw.isPluginSystem,
      kw: raw.kw,
      ccm: raw.ccm,
      co2Value: raw.co2Value,
      fuelConsumption: raw.fuelConsumption,
      carPreownerCount: raw.carPreownerCount,
      hasFilledServiceBook: raw.hasFilledServiceBook,
      esBranch: raw.esBranch,
      publishedAt: raw.publishedAt,
      firstPublishedAt: raw.firstPublishedAt,
      mainImageUrl: raw.mainImageUrl,
      usps: raw.usps,
    },
  };
}

/** Parse the `searchAdV9AdsV2` GraphQL response body. */
export function parseAutoheroSearchResponse(
  body: string,
  requestedOffset = 0,
  hitsPerPage = 24,
): AutoheroSearchPage {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Autoheros sökrespons kunde inte tolkas som JSON; importen pausas.");
  }
  const errors = object(payload)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = object(errors[0]);
    throw new Error(
      `Autoheros sök-API svarade med fel: ${text(first?.message) ?? "okänt fel"}.`,
    );
  }
  const result = object(object(object(payload)?.data)?.searchAdV9AdsV2);
  const rawList = Array.isArray(result?.data) ? result.data : undefined;
  const totalMatches = integer(result?.total);
  if (!rawList || totalMatches === undefined) {
    throw new Error("Autoheros sökresultat saknar förväntad struktur; importen pausas.");
  }

  const documents: AutoheroSearchDocument[] = [];
  let rejectedCount = 0;
  for (const value of rawList) {
    const raw = object(value);
    const mapped = raw ? mapSearchDocument(raw) : undefined;
    if (mapped) documents.push(mapped);
    else rejectedCount += 1;
  }
  return {
    documents,
    totalMatches,
    offset: requestedOffset,
    hitsPerPage,
    rejectedCount,
  };
}

// --- detail ---------------------------------------------------------------

/** Autohero detail pages ship the resolved Apollo cache as a JSON string
 *  literal: `window.__APOLLO_STATE__ = "{...}";`. */
function extractApolloState(html: string): JsonObject {
  const marker = 'window.__APOLLO_STATE__ = ';
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("Autoheros strukturerade siddata (__APOLLO_STATE__) saknas; importen pausas.");
  }
  const from = start + marker.length;
  // The value is a double-quoted JS string; scan to its unescaped closing quote.
  let index = from + 1;
  let escaped = false;
  for (; index < html.length; index += 1) {
    const character = html[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') break;
  }
  const literal = html.slice(from, index + 1);
  try {
    return JSON.parse(JSON.parse(literal)) as JsonObject;
  } catch {
    throw new Error("Autoheros __APOLLO_STATE__ kunde inte tolkas; strukturen kan ha ändrats.");
  }
}

function galleryFrom(composites: JsonObject | undefined) {
  if (!composites) return [];
  const ordered: { url: string; group: number; order: number }[] = [];
  // Photos a buyer would recognise as the listing gallery — not the damage
  // close-ups, wheel macros or scanned service book.
  const groups = ["exterior", "interior", "regular", "nextgen_highlight"];
  groups.forEach((key, group) => {
    const list = Array.isArray(composites[key]) ? (composites[key] as unknown[]) : [];
    for (const entry of list) {
      const url = resolveImage(text(object(entry)?.fullUrl));
      if (url) ordered.push({ url, group, order: number(object(entry)?.order) ?? 0 });
    }
  });
  return [
    ...new Set(
      ordered
        .sort((a, b) => a.group - b.group || a.order - b.order)
        .map((entry) => entry.url),
    ),
  ];
}

function equipmentFrom(features: unknown) {
  if (!Array.isArray(features)) return [];
  const labels: string[] = [];
  for (const category of features) {
    const items = Array.isArray(object(category)?.items) ? (object(category)!.items as unknown[]) : [];
    for (const item of items) {
      const label = text(object(item)?.description);
      if (label) labels.push(label);
    }
  }
  return [...new Set(labels)];
}

function serviceHistoryFrom(
  record: JsonObject,
): AutoheroListingDetail["serviceHistory"] {
  if (record.hasFilledServiceBook === true) return "complete";
  const history = object(record.serviceHistory);
  const records = Array.isArray(history?.records) ? history.records : [];
  if (record.hasFilledServiceBook === false && records.length === 0) return "missing";
  return records.length > 0 ? "partial" : "unknown";
}

/** Build a detail record from an already-resolved `getCarDetailsStoreAd`
 *  object (both a freshly parsed page and the retained raw payload use this). */
export function parseAutoheroDetailData(raw: JsonObject): AutoheroListingDetail {
  const subType = text(raw.subType);
  const subTypeExtra = text(raw.subTypeExtra);
  return {
    title: [text(raw.manufacturer), text(raw.model), subType, subTypeExtra]
      .filter(Boolean)
      .join(" ") || undefined,
    description: undefined,
    vin: text(raw.vin)?.toUpperCase(),
    registrationNumber: normalizeReg(raw.licensePlate),
    variant: [subType, subTypeExtra].filter(Boolean).join(" ") || undefined,
    bodyType: text(raw.bodyType),
    fuelType: text(raw.fuelType),
    transmission: text(raw.gearType),
    drivetrain: text(raw.drivetrain),
    colour: text(object(raw.color)?.outside),
    doors: integer(raw.doorCount),
    seats: integer(raw.seatCount),
    horsepower: integer(raw.horsePower),
    engineDisplacementCc: integer(raw.ccm),
    fuelConsumption:
      number(object(raw.fuelConsumption)?.combined) !== undefined
        ? `${number(object(raw.fuelConsumption)?.combined)} l/100km`
        : undefined,
    mileageKm: integer(object(raw.mileage)?.distance),
    priceAmount: money(raw.price),
    ownerCount: integer(raw.carPreownerCount),
    serviceHistory: serviceHistoryFrom(raw),
    images: galleryFrom(object(raw.carDetailsImageComposites)),
    equipment: equipmentFrom(raw.features),
    raw,
  };
}

export function parseAutoheroDetailPage(html: string): AutoheroListingDetail {
  const state = extractApolloState(html);
  const rootQuery = object(state.ROOT_QUERY);
  const key = rootQuery
    ? Object.keys(rootQuery).find((name) => name.startsWith("getCarDetailsStoreAd"))
    : undefined;
  const ad = key ? object(rootQuery![key]) : undefined;
  if (!ad || !text(ad.adId)) {
    throw new Error("Autoheros annonsdata (getCarDetailsStoreAd) saknas på detaljsidan.");
  }
  return parseAutoheroDetailData(ad);
}

export function autoheroSummaryFingerprint(document: AutoheroSearchDocument) {
  return JSON.stringify({
    price: document.priceAmount,
    previousPrice: document.previousPriceAmount,
    monthly: document.monthlyCostAmount,
    mileage: document.mileageKm,
    subType: document.subType,
    subTypeExtra: document.subTypeExtra,
    image: document.featuredImageUrl,
    publishedAt: document.publishedAt?.toISOString(),
  });
}
