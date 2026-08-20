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
    const model =
      stringValue(candidate.model) ??
      stringValue(candidate.model_specification) ??
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
        variant: stringValue(candidate.model_specification),
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
