import type {
  HedinListingDetail,
  HedinSearchDocument,
  HedinSearchPage,
} from "./types";

type JsonObject = Record<string, unknown>;

const PAGE_SIZE = 48;

function object(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function integer(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : undefined;
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function date(value: unknown) {
  const candidate = text(value);
  if (!candidate) return undefined;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function nextData(html: string): JsonObject {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error("Hedins strukturerade siddata (__NEXT_DATA__) saknas; importen pausas.");
  }
  try {
    return JSON.parse(match[1]) as JsonObject;
  } catch {
    throw new Error("Hedins __NEXT_DATA__ kunde inte tolkas; strukturen kan ha ändrats.");
  }
}

/** Depth-first search for the first node matching a predicate. */
function findNode(
  root: unknown,
  predicate: (node: JsonObject) => boolean,
): JsonObject | undefined {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const record = object(current);
    if (record) {
      if (predicate(record)) return record;
      stack.push(...Object.values(record));
    } else if (Array.isArray(current)) {
      stack.push(...current);
    }
  }
  return undefined;
}

function slug(document: JsonObject) {
  return text(document.slug);
}

function normalizeReg(value: unknown) {
  return text(value)?.replace(/\s+/g, "").toUpperCase();
}

/** `car_model_text` is prefixed with the brand and/or model ("TOYOTA RAV4 2.5
 *  HSD"); strip both so only the trim/engine designation remains. */
function variantOf(modelText: string | undefined, brand?: string, model?: string) {
  let value = modelText?.trim() ?? "";
  for (const prefix of [brand, model]) {
    if (!prefix) continue;
    value = value.replace(
      new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"),
      "",
    ).trim();
  }
  return value || undefined;
}

function mapSearchDocument(raw: JsonObject): HedinSearchDocument | undefined {
  const id = text(raw.car_id);
  const s = slug(raw);
  if (!id || !s) return undefined;
  const image = object(raw.car_primary_image);
  const brand = text(raw.car_brand);
  const model = text(raw.car_model);
  return {
    id,
    slug: s,
    detailPath: `/bilar/kop-bil/${id}/${s}`,
    brand,
    model,
    variant: variantOf(text(raw.car_model_text), brand, model),
    registrationNumber: normalizeReg(raw.car_regno),
    modelYear: integer(raw.car_year),
    mileageKm: integer(raw.car_mileage_text),
    priceAmount: integer(raw.car_price_text ?? raw.car_price_title),
    fuel: text(raw.car_fuel),
    gearbox: text(raw.car_gearbox),
    city: text(raw.car_site_city),
    condition: text(raw.car_condition),
    featuredImageUrl: text(image?.thumbnail_url ?? image?.original),
    raw: {
      car_id: id,
      slug: s,
      car_brand: raw.car_brand,
      car_model: raw.car_model,
      car_model_text: raw.car_model_text,
      car_regno: raw.car_regno,
      car_year: raw.car_year,
      car_mileage_text: raw.car_mileage_text,
      car_price_text: raw.car_price_text,
      car_fuel: raw.car_fuel,
      car_gearbox: raw.car_gearbox,
      car_site_city: raw.car_site_city,
      car_condition: raw.car_condition,
      indexed_at: raw.indexed_at,
    },
  };
}

export function parseHedinSearchPage(
  html: string,
  windowPage: number,
): HedinSearchPage {
  const carsQuery = findNode(nextData(html), (node) => {
    const key = node.queryKey;
    return Array.isArray(key) && key[0] === "cars";
  });
  const pages = Array.isArray(object(object(carsQuery?.state)?.data)?.pages)
    ? ((object(object(carsQuery?.state)?.data) as JsonObject).pages as unknown[])
    : undefined;
  if (!pages) {
    throw new Error("Hedins fordonsträffar kunde inte läsas; strukturen kan ha ändrats.");
  }

  const content: JsonObject[] = [];
  const seen = new Set<string>();
  let totalItems = 0;
  for (const page of pages) {
    const record = object(page);
    if (!record) continue;
    totalItems = integer(record.total_items) ?? totalItems;
    for (const item of Array.isArray(record.content) ? record.content : []) {
      const raw = object(item);
      const id = text(raw?.car_id);
      if (!raw || !id || seen.has(id)) continue;
      seen.add(id);
      content.push(raw);
    }
  }

  const start = Math.max(0, (windowPage - 1) * PAGE_SIZE);
  const slice = content.slice(start, start + PAGE_SIZE);
  const documents: HedinSearchDocument[] = [];
  let rejectedCount = 0;
  for (const raw of slice) {
    const mapped = mapSearchDocument(raw);
    if (mapped) documents.push(mapped);
    else rejectedCount += 1;
  }

  return {
    documents,
    totalItems: totalItems || content.length,
    pageSize: PAGE_SIZE,
    rejectedCount,
  };
}

function schemaOrgCar(html: string): JsonObject | undefined {
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed = object(JSON.parse(match[1]));
      const type = parsed?.["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes("Car")) return parsed;
    } catch {
      // Skip unrelated malformed blocks.
    }
  }
  return undefined;
}

const DRIVE_WHEELS = "https://schema.org/";

export function parseHedinDetailPage(html: string): HedinListingDetail {
  const car =
    findNode(nextData(html), (node) => Boolean(node.car_id) && Boolean(node.car_equipment)) ??
    findNode(nextData(html), (node) => Boolean(node.car_id) && Array.isArray(node.car_images));
  const schema = schemaOrgCar(html);
  if (!car && !schema) {
    throw new Error("Hedins annonsdata kunde inte läsas; strukturen kan ha ändrats.");
  }

  const offers = object(schema?.offers);
  const seller = object(offers?.seller);
  const odometer = object(schema?.mileageFromOdometer);
  const images = Array.isArray(car?.car_images)
    ? (car!.car_images as unknown[])
        .map((entry) => text(object(entry)?.original ?? object(entry)?.thumbnail_url))
        .filter((url): url is string => Boolean(url))
    : text(schema?.image)
      ? [text(schema?.image) as string]
      : [];
  const equipment = Array.isArray(car?.car_equipment)
    ? (car!.car_equipment as unknown[])
        .map((entry) => text(object(entry)?.name ?? object(entry)?.text) ?? text(entry))
        .filter((label): label is string => Boolean(label))
    : [];
  const brand = text(object(schema?.brand)?.name) ?? text(car?.car_brand);
  const model = text(car?.car_model) ?? text(schema?.model);
  const variant =
    variantOf(text(car?.car_model_text), brand, model) ??
    variantOf(text(schema?.vehicleConfiguration), brand, model);

  // The detail page carries the selling branch's coordinates as
  // `site.site_geocoord: "lat,lon"`; without them a listing has no distance.
  const siteNode = findNode(nextData(html), (node) => Boolean(node.site_geocoord));
  const [geoLat, geoLon] = (text(siteNode?.site_geocoord) ?? "")
    .split(",")
    .map((part) => Number.parseFloat(part.trim()));

  return {
    title: text(schema?.name) ?? text(car?.car_title),
    description: text(car?.car_description),
    brand,
    model,
    variant,
    vin: normalizeReg(schema?.vehicleIdentificationNumber ?? car?.car_chassino),
    registrationNumber: normalizeReg(car?.car_regno),
    modelYear: integer(schema?.vehicleModelDate ?? car?.car_year),
    firstRegistration: date(car?.car_firstregistration),
    bodyType: text(schema?.bodyType ?? car?.car_body),
    fuelType: text(car?.car_fuel),
    transmission: text(schema?.vehicleTransmission ?? car?.car_gearbox),
    drivetrain:
      text(schema?.driveWheelConfiguration)?.replace(DRIVE_WHEELS, "") ?? text(car?.car_drive),
    colour: text(schema?.color ?? car?.car_color),
    doors: integer(car?.car_doors),
    mileageKm: integer(odometer?.value ?? car?.car_mileage_text),
    priceAmount: integer(offers?.price ?? car?.car_price_text),
    monthlyCostAmount: integer(car?.car_loan_monthly_cost),
    sellerName: text(seller?.name) ?? text(car?.car_department_name),
    city: text(car?.car_site_city),
    latitude: Number.isFinite(geoLat) ? geoLat : undefined,
    longitude: Number.isFinite(geoLon) ? geoLon : undefined,
    images: [...new Set(images)],
    equipment: [...new Set(equipment)],
    raw: {
      schema: schema ?? null,
      car: car
        ? Object.fromEntries(
            Object.entries(car).filter(
              ([key]) => key !== "car_images" && key !== "car_equipment",
            ),
          )
        : null,
    },
  };
}

export function hedinSummaryFingerprint(document: HedinSearchDocument) {
  return JSON.stringify({
    brand: document.brand,
    model: document.model,
    variant: document.variant,
    price: document.priceAmount,
    mileage: document.mileageKm,
    year: document.modelYear,
    image: document.featuredImageUrl,
  });
}
