import { MAX_LISTING_IMAGES, type NormalizedVehicleListing } from "@/application/ingestion/types";
import type { BodyStyle, Drivetrain, FuelType, TransmissionType } from "@/domain/vehicle";
import type { WaykeListingDetail, WaykeSearchDocument } from "./types";

function fuel(value?: string): FuelType {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if ((lower.includes("el") || lower.includes("electric")) && (lower.includes("bensin") || lower.includes("gasoline"))) return "plug_in_hybrid";
  if (lower.includes("hybrid")) return "self_charging_hybrid";
  if (lower === "el" || lower.includes("electric")) return "electric";
  if (lower.includes("diesel")) return "diesel";
  if (lower.includes("bensin") || lower.includes("gasoline")) return "petrol";
  if (lower.includes("etanol")) return "ethanol";
  if (lower.includes("hydrogen") || lower.includes("vätgas")) return "hydrogen";
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
  if (lower.includes("kombi")) return "estate";
  if (lower.includes("sedan")) return "sedan";
  if (lower.includes("halvkombi")) return "hatchback";
  if (lower.includes("coup")) return "coupe";
  if (lower.includes("cabr")) return "convertible";
  if (lower.includes("pickup")) return "pickup";
  if (lower.includes("buss")) return "minivan";
  if (lower.includes("transport") || lower.includes("van")) return "van";
  return "other";
}

function drivetrain(value?: string): Drivetrain | undefined {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("fourwheel") || lower.includes("fyrhjul")) return "all_wheel_drive";
  if (lower.includes("frontwheel") || lower.includes("framhjul")) return "front_wheel_drive";
  if (lower.includes("rearwheel") || lower.includes("bakhjul")) return "rear_wheel_drive";
  return lower ? "other" : undefined;
}

export function normalizeWaykeListing(
  document: WaykeSearchDocument,
  detail: WaykeListingDetail | undefined,
  scope: string,
): NormalizedVehicleListing {
  const observedAt = new Date();
  const title = detail?.title ?? document.title;
  const variant = detail?.variant
    ?.replace(new RegExp(`^${document.make}\\s+${document.model}\\s*`, "i"), "")
    .trim() || title.replace(new RegExp(`^${document.make}\\s+${document.model}\\s*`, "i"), "").trim() || undefined;
  const imageUrls = detail?.images.length ? detail.images : document.featuredImageUrl ? [document.featuredImageUrl] : [];
  return {
    source: {
      provider: "wayke",
      scope,
      externalId: document.id,
      listingUrl: `https://www.wayke.se/objekt/${encodeURIComponent(document.id)}`,
      observedAt,
      publishedAt: detail?.publishedAt ?? document.publishedAt,
      updatedAt: document.updatedAt,
    },
    vehicle: {
      vin: detail?.vin,
      registrationNumber: detail?.registrationNumber,
      make: document.make,
      model: document.model,
      variant,
      modelYear: detail?.modelYear ?? document.modelYear,
      registrationYear: detail?.registrationYear,
      bodyStyle: body(detail?.bodyType),
      fuelType: fuel(detail?.fuelType ?? document.fuel),
      transmission: transmission(detail?.transmission ?? document.transmission),
      drivetrain: drivetrain(detail?.drivetrain),
      horsepower: detail?.horsepower,
      engineDisplacementCc: detail?.engineDisplacementCc,
      fuelConsumption: detail?.fuelConsumption,
    },
    listing: {
      title,
      sellerName: detail?.sellerName ?? document.sellerName,
      sellerType: "dealer",
      priceAmount: detail?.priceAmount ? Math.round(detail.priceAmount) : document.priceAmount,
      previousPriceAmount: document.previousPriceAmount,
      mileageKm: detail?.mileageKm ?? Math.round(document.mileageMil * 10),
      location: document.location,
      municipality: document.municipality,
      latitude: document.latitude,
      longitude: document.longitude,
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
      // Keep only compact reparsing/debug fields. The source's full search and
      // Next payloads contain many responsive image formats and ancillary
      // commerce objects; normalized images/equipment already live in their
      // own tables and are supplied to the cache lookup from there.
      document: {
        id: document.id,
        title: document.title,
        make: document.make,
        model: document.model,
        modelYear: document.modelYear,
        mileageMil: document.mileageMil,
        priceAmount: document.priceAmount,
        previousPriceAmount: document.previousPriceAmount,
        sellerName: document.sellerName,
        publishedAt: document.publishedAt?.toISOString(),
        updatedAt: document.updatedAt?.toISOString(),
        featuredImageUrl: document.featuredImageUrl,
      },
      detail: detail
        ? {
            __normalizedWaykeDetail: true,
            title: detail.title,
            description: detail.description,
            vin: detail.vin,
            registrationNumber: detail.registrationNumber,
            variant: detail.variant,
            modelYear: detail.modelYear,
            registrationYear: detail.registrationYear,
            bodyType: detail.bodyType,
            fuelType: detail.fuelType,
            transmission: detail.transmission,
            drivetrain: detail.drivetrain,
            horsepower: detail.horsepower,
            engineDisplacementCc: detail.engineDisplacementCc,
            fuelConsumption: detail.fuelConsumption,
            mileageKm: detail.mileageKm,
            sellerName: detail.sellerName,
            priceAmount: detail.priceAmount,
            publishedAt: detail.publishedAt?.toISOString(),
          }
        : undefined,
      summaryFingerprint: JSON.stringify({
        title: document.title,
        price: document.priceAmount,
        previousPrice: document.previousPriceAmount,
        mileage: document.mileageMil,
        seller: document.sellerName,
        image: document.featuredImageUrl,
        updatedAt: document.updatedAt?.toISOString(),
      }),
      importedAt: observedAt.toISOString(),
    },
  };
}
