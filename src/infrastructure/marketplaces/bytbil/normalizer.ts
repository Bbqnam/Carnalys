import { MAX_LISTING_IMAGES, type NormalizedVehicleListing } from "@/application/ingestion/types";
import type { BodyStyle, Drivetrain, FuelType, TransmissionType } from "@/domain/vehicle";
import { placeCoordinates } from "../swedish-place-coordinates";
import type { BytbilListingDetail, BytbilSearchDocument } from "./types";

function fuel(value?: string): FuelType {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("laddhybrid") || (lower.includes("el") && lower.includes("bensin"))) {
    return "plug_in_hybrid";
  }
  if (lower.includes("elhybrid") || lower.includes("hybrid")) return "self_charging_hybrid";
  if (lower === "el" || lower.includes("elbil") || lower.includes("electric")) return "electric";
  if (lower.includes("diesel")) return "diesel";
  if (lower.includes("bensin") || lower.includes("gasoline")) return "petrol";
  if (lower.includes("etanol") || lower.includes("e85")) return "ethanol";
  if (lower.includes("gas") || lower.includes("cng") || lower.includes("metan")) return "other";
  if (lower.includes("vätgas") || lower.includes("hydrogen")) return "hydrogen";
  return "other";
}

function transmission(value?: string): TransmissionType {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("automat")) return "automatic";
  if (lower.includes("manuell")) return "manual";
  return "other";
}

function body(value?: string): BodyStyle {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("suv")) return "suv";
  if (lower.includes("kombi") && !lower.includes("halv")) return "estate";
  if (lower.includes("sedan")) return "sedan";
  if (lower.includes("halvkombi") || lower.includes("hatchback")) return "hatchback";
  if (lower.includes("coup")) return "coupe";
  if (lower.includes("cabr") || lower.includes("convertible")) return "convertible";
  if (lower.includes("pickup") || lower.includes("pick-up")) return "pickup";
  if (lower.includes("familjebuss") || lower.includes("minibuss")) return "minivan";
  if (lower.includes("transportbil") || lower.includes("skåp") || lower.includes("van")) return "van";
  return "other";
}

function drivetrain(value?: string): Drivetrain | undefined {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (!lower) return undefined;
  if (lower.includes("4wd") || lower.includes("awd") || lower.includes("fyrhjul")) {
    return "all_wheel_drive";
  }
  if (lower.includes("fram")) return "front_wheel_drive";
  if (lower.includes("bak")) return "rear_wheel_drive";
  return "other";
}

/** Bytbil upper-cases the result-row city ("ALINGSÅS"); restore normal casing. */
function place(value: string | undefined) {
  if (!value) return "Sverige";
  return value
    .toLocaleLowerCase("sv-SE")
    .replace(/(^|[\s-])([a-zà-ÿ])/g, (_, boundary, char) => boundary + char.toLocaleUpperCase("sv-SE"));
}

function stripPrefix(value: string | undefined, ...prefixes: (string | undefined)[]) {
  let result = value?.trim() ?? "";
  for (const prefix of prefixes) {
    if (!prefix) continue;
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i");
    result = result.replace(pattern, "").trim();
  }
  return result || undefined;
}

export function normalizeBytbilListing(
  document: BytbilSearchDocument,
  detail: BytbilListingDetail | undefined,
  scope: string,
  /**
   * Whether `detail` was fetched fresh this run. Bytbil's search-results price
   * lags its detail page, and a cached detail's price freezes at fetch time —
   * so a fresh detail is authoritative, but a cached one is trusted only after
   * the search price (re-read every run) has nothing to offer.
   */
  detailIsFresh = true,
): NormalizedVehicleListing {
  const observedAt = new Date();
  const title = detail?.title ?? document.title;
  const titleWords = document.title.split(/\s+/).filter(Boolean);
  const make = detail?.make ?? titleWords[0] ?? "Okänt";
  const model = detail?.model ?? titleWords[1] ?? title;
  const variant =
    stripPrefix(detail?.variant, make, model) ?? stripPrefix(title, make, model);
  const imageUrls = detail?.images.length
    ? detail.images
    : document.featuredImageUrl
      ? [document.featuredImageUrl]
      : [];
  const mileageKm =
    detail?.mileageKm ??
    (document.mileageMil !== undefined ? Math.round(document.mileageMil * 10) : undefined);
  // Bytbil publishes only a town name — resolve it to an approximate point so
  // "how far is this car" still works.
  const coordinates = placeCoordinates(document.location);

  return {
    source: {
      provider: "bytbil",
      scope,
      externalId: document.id,
      listingUrl: `https://www.bytbil.com${document.detailPath}`,
      observedAt,
      publishedAt: document.publishedAt,
    },
    vehicle: {
      registrationNumber: detail?.registrationNumber,
      make,
      model,
      variant,
      modelYear: detail?.modelYear ?? document.modelYear ?? 0,
      bodyStyle: body(detail?.bodyType),
      fuelType: fuel(detail?.fuelType),
      transmission: transmission(detail?.transmission),
      drivetrain: drivetrain(detail?.drivetrain),
      horsepower: detail?.horsepower,
      engineDisplacementCc: detail?.engineDisplacementCc,
    },
    listing: {
      title,
      sellerName: detail?.sellerName,
      dealerStockNumber: undefined,
      sellerType: "dealer",
      priceAmount:
        (detailIsFresh ? detail?.priceAmount : undefined) ??
        document.priceAmount ??
        detail?.priceAmount ??
        0,
      previousPriceAmount: detail?.previousPriceAmount,
      mileageKm: mileageKm ?? 0,
      location: place(document.location),
      municipality: place(document.location),
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      description: detail?.description,
      serviceHistory: "unknown",
      equipment: detail?.equipment ?? [],
      images: [...new Set(imageUrls)].slice(0, MAX_LISTING_IMAGES).map((url, position) => ({
        url,
        thumbnailUrl: position === 0 ? document.featuredImageUrl : undefined,
        alt: title,
        position,
      })),
    },
    rawPayload: {
      document: {
        id: document.id,
        detailPath: document.detailPath,
        title: document.title,
        modelYear: document.modelYear,
        mileageMil: document.mileageMil,
        priceAmount: document.priceAmount,
        location: document.location,
        featuredImageUrl: document.featuredImageUrl,
        publishedAt: document.publishedAt?.toISOString(),
      },
      detail: detail
        ? {
            __normalizedBytbilDetail: true,
            title: detail.title,
            description: detail.description,
            make: detail.make,
            model: detail.model,
            variant: detail.variant,
            registrationNumber: detail.registrationNumber,
            modelYear: detail.modelYear,
            bodyType: detail.bodyType,
            fuelType: detail.fuelType,
            transmission: detail.transmission,
            drivetrain: detail.drivetrain,
            horsepower: detail.horsepower,
            engineDisplacementCc: detail.engineDisplacementCc,
            colour: detail.colour,
            mileageKm: detail.mileageKm,
            priceAmount: detail.priceAmount,
            previousPriceAmount: detail.previousPriceAmount,
            sellerName: detail.sellerName,
            dealerId: detail.dealerId,
          }
        : undefined,
      summaryFingerprint: JSON.stringify({
        title: document.title,
        price: document.priceAmount,
        mileage: document.mileageMil,
        year: document.modelYear,
        image: document.featuredImageUrl,
      }),
      importedAt: observedAt.toISOString(),
    },
  };
}
