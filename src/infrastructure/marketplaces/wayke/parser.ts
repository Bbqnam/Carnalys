import type {
  WaykeListingDetail,
  WaykeSearchDocument,
  WaykeSearchPage,
} from "./types";

type JsonObject = Record<string, unknown>;

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

function date(value: unknown) {
  const candidate = text(value);
  if (!candidate) return undefined;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function structuredData(html: string, type: string) {
  const scripts = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const match of scripts) {
    try {
      const data = object(JSON.parse(match[1]));
      if (data?.["@type"] === type) return data;
    } catch {
      // An unrelated structured block can be malformed.
    }
  }
}

function parseCurrentSearchData(html: string) {
  const list = structuredData(html, "ItemList");
  if (!Array.isArray(list?.itemListElement)) return undefined;

  const flight = waykeFlightData(html);
  const vehicles = new Map<string, JsonObject>();
  const images = new Map<string, string>();
  for (const match of flight.matchAll(/"(legacyItem|body)":\{/g)) {
    const start = match.index + match[0].length - 1;
    const candidate = extractJsonObject(flight, start);
    if (!candidate) continue;
    const data = object(JSON.parse(candidate));
    if (match[1] === "legacyItem") {
      const id = text(data?.id);
      if (data && id && text(data.manufacturer)) vehicles.set(id, data);
    } else {
      const id = text(data?.advertisementId);
      const image = text(data?.image);
      if (id && image) images.set(id, image);
    }
  }

  const pageSize = 24;
  const firstPosition = number(object(list.itemListElement[0])?.position);
  if (firstPosition === undefined && number(list.numberOfItems) !== 0) return undefined;
  const documents = list.itemListElement.flatMap((entry: unknown) => {
    const car = object(object(entry)?.item);
    const id = text(car?.url)?.match(/\/objekt\/([\w-]+)\/?$/)?.[1];
    const vehicle = id ? vehicles.get(id) : undefined;
    const mileage = object(car?.mileageFromOdometer);
    const distance = number(mileage?.value);
    const offers = object(car?.offers);
    // Wayke also shows lease and made-to-order offers without a cash price.
    if (offers && number(offers.price) === undefined && number(vehicle?.price) === 0) return [];
    const seller = object(offers?.seller);
    const address = object(seller?.address);
    return {
      _id: id,
      title: car?.name,
      manufacturer: vehicle?.manufacturer,
      modelSeries: vehicle?.model,
      modelYear: car?.vehicleModelDate,
      mileage: text(mileage?.unitCode) === "KMT" && distance !== undefined
        ? distance / 10
        : vehicle?.mileage,
      price: offers?.price,
      fuelType: vehicle?.fuelType,
      gearboxType: vehicle?.gearboxType,
      branches: [seller],
      position: { city: address?.addressLocality },
      featuredImage: id && images.has(id) ? { files: [{ url: images.get(id) }] } : undefined,
    };
  });
  return {
    documents,
    numberOfHits: list.numberOfItems,
    pagination: { offset: (firstPosition ?? 1) - 1, hitsPerPage: pageSize },
  };
}

function parseLegacySearchData(html: string) {
  const payloadMatch = html.match(
    /<script>window\["__RQ_R_lb_"\][\s\S]*?\.push\((\{"mutations":[\s\S]*?\})\);<\/script>/,
  );
  if (!payloadMatch) return undefined;
  const payload = JSON.parse(payloadMatch[1]) as {
    queries?: { state?: { data?: unknown } }[];
  };
  const state = payload.queries
    ?.map((query) => object(query.state?.data))
    .find((candidate) => {
      const list = object(candidate?.documentList);
      const pagination = object(list?.pagination);
      return Array.isArray(list?.documents) && (number(pagination?.hitsPerPage) ?? 0) > 0;
    });
  return object(state?.documentList);
}

export function parseWaykeSearchPage(html: string): WaykeSearchPage {
  const documentList = parseCurrentSearchData(html) ?? parseLegacySearchData(html);
  if (!documentList) {
    throw new Error("Wayke-sökningens strukturerade siddata saknas; importen pausas.");
  }
  const pagination = object(documentList?.pagination);
  const rawDocuments = Array.isArray(documentList?.documents)
    ? documentList.documents
    : [];
  const documents: WaykeSearchDocument[] = [];
  let rejectedCount = 0;

  for (const value of rawDocuments) {
    const raw = object(value);
    const id = text(raw?._id);
    const title = text(raw?.title);
    const make = text(raw?.manufacturer);
    const model = text(raw?.modelSeries);
    const modelYear = number(raw?.modelYear);
    const mileageMil = number(raw?.mileage) ?? number(object(raw?.odometerReading)?.value);
    const priceAmount = number(raw?.price);
    if (!raw || !id || !title || !make || !model || !modelYear || mileageMil === undefined || priceAmount === undefined) {
      rejectedCount += 1;
      continue;
    }
    if (text(raw.status) && text(raw.status) !== "Published") continue;

    const branches = Array.isArray(raw.branches) ? raw.branches : [];
    const branch = object(branches[0]);
    const position = object(raw.position);
    const coordinates = object(position?.location);
    const featuredImage = object(raw.featuredImage);
    const files = Array.isArray(featuredImage?.files) ? featuredImage.files : [];
    const featuredFile = object(files[0]);
    const oldPrice = number(raw.oldPrice);
    documents.push({
      id,
      title,
      make,
      model,
      modelYear: Math.trunc(modelYear),
      mileageMil,
      priceAmount: Math.round(priceAmount),
      previousPriceAmount: oldPrice && oldPrice > 0 ? Math.round(oldPrice) : undefined,
      fuel: text(raw.fuelType),
      transmission: text(raw.gearboxType),
      sellerName: text(branch?.name),
      publishedAt: date(raw.itemPublished),
      updatedAt: date(object(raw.odometerReading)?.updatedAt) ?? date(raw.itemSort),
      location: text(position?.city) ?? text(position?.county) ?? "Sverige",
      municipality: text(position?.city) ?? text(position?.county) ?? "Sverige",
      latitude: number(coordinates?.lat),
      longitude: number(coordinates?.lon),
      featuredImageUrl: text(featuredFile?.url),
      raw,
    });
  }

  const totalMatches = number(documentList?.numberOfHits);
  const offset = number(pagination?.offset);
  const hitsPerPage = number(pagination?.hitsPerPage);
  if (totalMatches === undefined || offset === undefined || !hitsPerPage) {
    throw new Error("Wayke-sökningens paginering kunde inte valideras; importen pausas.");
  }
  return {
    documents,
    totalMatches: Math.trunc(totalMatches),
    offset: Math.trunc(offset),
    hitsPerPage: Math.trunc(hitsPerPage),
    rejectedCount,
  };
}

export function parseWaykeDetailData(raw: Record<string, unknown>): WaykeListingDetail {
  // Wayke currently serves two detail-page generations. The established page
  // exposes Schema.org Car JSON; the newer Next page embeds the same public ad
  // object in its server-component stream. Normalize either representation.
  if (raw["@type"] !== "Car") {
    const properties = object(raw.properties);
    const odometer = object(raw.odometerReading);
    const branches = Array.isArray(raw.branches) ? raw.branches : [];
    const seller = object(branches[0]);
    const media = Array.isArray(raw.media) ? raw.media : [];
    const images = media.flatMap((entry) => {
      const mediaEntry = object(entry);
      const files = Array.isArray(mediaEntry?.files) ? mediaEntry.files : [];
      return files
        .map((file) => text(object(file)?.url))
        .filter((url): url is string => Boolean(url));
    });
    const equipment = Array.isArray(raw.equipment)
      ? raw.equipment
          .map((item) => text(object(item)?.name) ?? text(item))
          .filter((item): item is string => Boolean(item))
      : [];
    const mileageValue = number(odometer?.value) ?? number(raw.mileage);
    const mileageKm =
      mileageValue === undefined
        ? undefined
        : text(odometer?.unit) === "Kilometer"
          ? mileageValue
          : mileageValue * 10;
    return {
      title: text(raw.title),
      description: text(raw.description) ?? text(raw.shortDescription),
      vin: text(raw.vin),
      registrationNumber: text(raw.registrationNumber)
        ?.replace(/\s+/g, "")
        .toUpperCase(),
      variant: text(raw.salesName) ?? text(raw.vehicleDescription),
      modelYear: number(raw.modelYear),
      registrationYear: number(raw.manufactureYear),
      bodyType: text(properties?.chassis),
      fuelType: text(raw.fuelTypes) ?? text(raw.fuelType),
      transmission: text(raw.gearboxType),
      drivetrain: text(properties?.drivingWheel),
      horsepower: number(raw.enginePower),
      engineDisplacementCc: number(properties?.engineDisplacement),
      fuelConsumption: text(properties?.fuelConsumptionMixedDriving),
      mileageKm,
      sellerName: text(seller?.name),
      priceAmount: number(raw.price),
      publishedAt: date(raw.itemPublished) ?? date(raw.publishedAt),
      images: [...new Set(images)],
      equipment: [...new Set(equipment)],
      raw,
    };
  }
  const offers = object(raw.offers);
  const seller = object(offers?.seller);
  const identifier = object(raw.identifier);
  const engine = object(raw.vehicleEngine);
  const enginePower = object(engine?.enginePower);
  const engineDisplacement = object(engine?.engineDisplacement);
  const consumption = object(raw.fuelConsumption);
  const mileage = object(raw.mileageFromOdometer);
  const images = Array.isArray(raw.image)
    ? raw.image.map(text).filter((url): url is string => Boolean(url))
    : [];
  const kilowatts = number(enginePower?.value);
  return {
    title: text(raw.name),
    description: text(raw.description),
    vin: text(raw.vehicleIdentificationNumber),
    registrationNumber:
      text(identifier?.propertyID) === "registrationNumber"
        ? text(identifier?.value)?.replace(/\s+/g, "").toUpperCase()
        : undefined,
    variant: text(raw.vehicleConfiguration),
    modelYear: number(raw.vehicleModelDate),
    registrationYear: number(raw.productionDate),
    bodyType: text(raw.bodyType),
    fuelType: text(engine?.fuelType),
    transmission: text(raw.vehicleTransmission),
    drivetrain: text(raw.driveWheelConfiguration),
    horsepower: kilowatts ? Math.round(kilowatts * 1.35962) : undefined,
    engineDisplacementCc: number(engineDisplacement?.value),
    fuelConsumption:
      number(consumption?.value) !== undefined
        ? `${number(consumption?.value)} ${text(consumption?.unitText) ?? ""}`.trim()
        : undefined,
    mileageKm: number(mileage?.value),
    sellerName: text(seller?.name),
    priceAmount: number(offers?.price),
    publishedAt: date(offers?.validFrom),
    images,
    equipment: [],
    raw,
  };
}

function extractJsonObject(value: string, start: number) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      return value.slice(start, index + 1);
    }
  }
  return undefined;
}

function waykeFlightData(html: string) {
  return [
    ...html.matchAll(
      /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g,
    ),
  ]
    .map((match) => {
      try {
        return JSON.parse(match[1]) as string;
      } catch {
        return "";
      }
    })
    .join("");
}

function parseWaykeNextVehicle(html: string) {
  const flight = waykeFlightData(html);
  for (const match of flight.matchAll(/"vehicle":\{/g)) {
    const start = match.index + '"vehicle":'.length;
    const candidate = extractJsonObject(flight, start);
    if (!candidate) continue;
    try {
      const parsed = object(JSON.parse(candidate));
      if (
        parsed &&
        text(parsed._id ?? parsed.id) &&
        text(parsed.manufacturer) &&
        text(parsed.title)
      ) {
        return parsed;
      }
    } catch {
      // Continue to the next server-component vehicle prop.
    }
  }
  return undefined;
}

/** Parse only structured Schema.org data and the rendered equipment list. */
export function parseWaykeDetailPage(html: string): WaykeListingDetail {
  const nextVehicle = parseWaykeNextVehicle(html);
  const raw = structuredData(html, "Car") ?? nextVehicle;
  if (!raw) throw new Error("Wayke-annonsens strukturerade fordonsdata saknas.");
  const equipment = [...html.matchAll(/data-testid="equipment-list-item-[^"]*"[^>]*>([\s\S]*?)<\/li>/g)]
    .map((match) => decodeHtml(match[1]))
    .filter(Boolean);
  const parsed = parseWaykeDetailData(raw);
  const publishedTime = html.match(
    /data-testid="item-v2-published-at"[^>]*>[^<]*<time[^>]*\sdatetime="([^"]+)"/i,
  )?.[1];
  // Some Wayke pages publish a valid Schema.org Car block without its image
  // field while including the full gallery in the server-component vehicle
  // prop. Prefer Schema.org for the core fields, but recover that gallery so a
  // newly imported listing does not incorrectly appear image-less.
  const nextImages = nextVehicle
    ? parseWaykeDetailData(nextVehicle).images
    : [];
  return {
    ...parsed,
    publishedAt: parsed.publishedAt ?? date(publishedTime),
    images: parsed.images.length > 0 ? parsed.images : nextImages,
    equipment: equipment.length > 0 ? [...new Set(equipment)] : parsed.equipment,
  };
}

export function waykeSummaryFingerprint(document: WaykeSearchDocument) {
  return JSON.stringify({
    title: document.title,
    price: document.priceAmount,
    previousPrice: document.previousPriceAmount,
    mileage: document.mileageMil,
    seller: document.sellerName,
    image: document.featuredImageUrl,
    updatedAt: document.updatedAt?.toISOString(),
  });
}
