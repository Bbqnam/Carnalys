import type {
  BlocketListingDetail,
  BlocketSearchDocument,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseTimestamp(value: unknown) {
  const timestamp = numberValue(value);
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

// Blocket buckets rare/exotic models (e.g. Ferrari Lusso) under a generic
// catch-all category instead of a real model name. When that happens, the
// actual model is only present in the free-text ad heading (e.g.
// "Ferrari Lusso"), so derive it from there instead of showing "Övriga".
const genericModelValues = new Set(["övriga", "annat", "annan"]);

function stripPrefix(text: string, prefix: string) {
  return text.toLocaleLowerCase("sv-SE").startsWith(prefix.toLocaleLowerCase("sv-SE"))
    ? text.slice(prefix.length).trim()
    : text;
}

function stripSuffix(text: string, suffix: string) {
  return text.toLocaleLowerCase("sv-SE").endsWith(suffix.toLocaleLowerCase("sv-SE"))
    ? text.slice(0, text.length - suffix.length).trim()
    : text;
}

function deriveModelFromHeading(
  heading: string,
  make: string,
  modelSpecification: string | undefined,
) {
  let remainder = stripPrefix(heading, make);
  if (modelSpecification) remainder = stripSuffix(remainder, modelSpecification);
  return remainder || undefined;
}

export function parseBlocketSearchResponse(payload: unknown): {
  documents: readonly BlocketSearchDocument[];
  rejectedCount: number;
  totalMatches: number;
  currentPage: number;
  lastPage: number;
} {
  if (!isRecord(payload) || !Array.isArray(payload.docs)) {
    throw new Error("Blocket-svaret saknar en giltig docs-lista.");
  }

  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const resultSize = isRecord(metadata?.result_size) ? metadata.result_size : undefined;
  const paging = isRecord(metadata?.paging) ? metadata.paging : undefined;
  const totalMatches = numberValue(resultSize?.match_count);
  const currentPage = numberValue(paging?.current);
  const lastPage = numberValue(paging?.last);
  if (totalMatches === undefined || currentPage === undefined || lastPage === undefined) {
    throw new Error("Blocket-svaret saknar komplett sidinformation.");
  }

  let rejectedCount = 0;
  const documents = payload.docs.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      rejectedCount += 1;
      return [];
    }

    const price = isRecord(candidate.price) ? candidate.price : undefined;
    const image = isRecord(candidate.image) ? candidate.image : undefined;
    const coordinates = isRecord(candidate.coordinates)
      ? candidate.coordinates
      : undefined;
    const id = stringValue(candidate.id) ?? numberValue(candidate.ad_id)?.toString();
    const heading = stringValue(candidate.heading);
    const canonicalUrl = stringValue(candidate.canonical_url);
    const location = stringValue(candidate.location);
    const priceAmount = numberValue(price?.amount);
    const year = numberValue(candidate.year);
    // New and pre-registration dealer cars commonly omit mileage entirely.
    // Treat that source shape as zero mileage instead of dropping the ad.
    const mileageMil = numberValue(candidate.mileage) ?? 0;
    const make = stringValue(candidate.make);
    const modelSpecification = stringValue(candidate.model_specification);
    const rawModel = stringValue(candidate.model);
    const isGenericModel =
      rawModel !== undefined && genericModelValues.has(rawModel.toLocaleLowerCase("sv-SE"));
    const model =
      (!isGenericModel ? rawModel : undefined) ??
      (heading && make ? deriveModelFromHeading(heading, make, modelSpecification) : undefined) ??
      modelSpecification ??
      heading;

    if (
      !id ||
      !heading ||
      !canonicalUrl ||
      !location ||
      !priceAmount ||
      !year ||
      !make
    ) {
      rejectedCount += 1;
      return [];
    }

    const imageUrls = Array.isArray(candidate.image_urls)
      ? candidate.image_urls.flatMap((url) => stringValue(url) ?? [])
      : [];
    const thumbnailUrl = stringValue(image?.url);

    return [
      {
        id,
        heading,
        canonicalUrl,
        location,
        coordinates:
          numberValue(coordinates?.lat) !== undefined &&
          numberValue(coordinates?.lon) !== undefined
            ? {
                latitude: numberValue(coordinates?.lat) as number,
                longitude: numberValue(coordinates?.lon) as number,
              }
            : undefined,
        timestamp: parseTimestamp(candidate.timestamp),
        priceAmount: Math.round(priceAmount),
        organisationName: stringValue(candidate.organisation_name),
        year: Math.round(year),
        mileageMil: Math.round(mileageMil),
        dealerSegment: stringValue(candidate.dealer_segment),
        registrationNumber: stringValue(candidate.regno),
        vin: stringValue(candidate.chassis_number),
        make,
        model: model ?? heading,
        variant: modelSpecification,
        transmission: stringValue(candidate.transmission),
        fuel: stringValue(candidate.fuel),
        imageUrls: imageUrls.length > 0 ? imageUrls : thumbnailUrl ? [thumbnailUrl] : [],
        thumbnail: thumbnailUrl
          ? {
              url: thumbnailUrl,
              width: numberValue(image?.width),
              height: numberValue(image?.height),
            }
          : undefined,
        raw: candidate,
      },
    ];
  });

  return {
    documents,
    rejectedCount,
    totalMatches: Math.round(totalMatches),
    currentPage: Math.round(currentPage),
    lastPage: Math.round(lastPage),
  };
}

export function parseBlocketDetail(payload: unknown): BlocketListingDetail {
  if (!isRecord(payload)) throw new Error("Annonsdetaljen är inte ett objekt.");

  const specifications = isRecord(payload.specifications)
    ? Object.fromEntries(
        Object.entries(payload.specifications).flatMap(([key, value]) => {
          const parsed = stringValue(value);
          return parsed ? [[key, parsed]] : [];
        }),
      )
    : {};

  const equipment = Array.isArray(payload.equipment)
    ? payload.equipment.flatMap((item) => stringValue(item) ?? [])
    : [];

  return {
    description: stringValue(payload.description),
    equipment,
    specifications,
    raw: payload,
  };
}
