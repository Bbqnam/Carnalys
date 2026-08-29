import { MAX_LISTING_IMAGES, type NormalizedVehicleListing } from "@/application/ingestion/types";
import type { BodyStyle, Drivetrain, FuelType, TransmissionType } from "@/domain/vehicle";
import { placeCoordinates } from "../swedish-place-coordinates";
import type { HedinListingDetail, HedinSearchDocument } from "./types";

function fuel(value?: string): FuelType {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("laddhybrid") || lower.includes("plug")) return "plug_in_hybrid";
  if (lower.includes("hybrid")) return "self_charging_hybrid";
  if (lower === "el" || lower.includes("elbil") || lower.includes("electric")) return "electric";
  if (lower.includes("diesel")) return "diesel";
  if (lower.includes("bensin") || lower.includes("gasoline")) return "petrol";
  if (lower.includes("etanol") || lower.includes("e85")) return "ethanol";
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
  if (lower.includes("minibuss") || lower.includes("familjebuss")) return "minivan";
  if (lower.includes("skåp") || lower.includes("transport") || lower.includes("van")) return "van";
  return "other";
}

function drivetrain(value?: string): Drivetrain | undefined {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (!lower) return undefined;
  if (lower.includes("fyrhjul") || lower.includes("4wd") || lower.includes("awd") || lower.includes("four")) {
    return "all_wheel_drive";
  }
  if (lower.includes("framhjul") || lower.includes("front")) return "front_wheel_drive";
  if (lower.includes("bakhjul") || lower.includes("rear")) return "rear_wheel_drive";
  return "other";
}

function place(value: string | undefined) {
  return value?.trim() || "Sverige";
}

export function normalizeHedinListing(
  document: HedinSearchDocument,
  detail: HedinListingDetail | undefined,
  scope: string,
): NormalizedVehicleListing {
  const observedAt = new Date();
  const make = detail?.brand ?? document.brand ?? "Okänt";
  const model = detail?.model ?? document.model ?? "Okänt";
  const variant = detail?.variant ?? document.variant;
  const title =
    detail?.title ??
    ([make, model, variant].filter(Boolean).join(" ").trim() || `${make} ${model}`);
  const city = detail?.city ?? document.city;
  const imageUrls = detail?.images.length
    ? detail.images
    : document.featuredImageUrl
      ? [document.featuredImageUrl]
      : [];

  return {
    source: {
      provider: "hedin",
      scope,
      externalId: document.id,
      listingUrl: `https://hedinautomotive.se${document.detailPath}`,
      observedAt,
    },
    vehicle: {
      vin: detail?.vin,
      registrationNumber: detail?.registrationNumber ?? document.registrationNumber,
      make,
      model,
      variant,
      modelYear: detail?.modelYear ?? document.modelYear ?? 0,
      firstRegistration: detail?.firstRegistration,
      bodyStyle: body(detail?.bodyType),
      fuelType: fuel(detail?.fuelType ?? document.fuel),
      transmission: transmission(detail?.transmission ?? document.gearbox),
      drivetrain: drivetrain(detail?.drivetrain),
    },
    listing: {
      title,
      // Hedin Automotive is a single dealer group; the branch name/city is the
      // seller, not a marketplace.
      sellerName: detail?.sellerName ?? (city ? `Hedin Automotive ${city}` : "Hedin Automotive"),
      sellerType: "dealer",
      priceAmount: detail?.priceAmount ?? document.priceAmount ?? 0,
      monthlyCostAmount: detail?.monthlyCostAmount,
      mileageKm: detail?.mileageKm ?? document.mileageKm ?? 0,
      location: place(city),
      municipality: place(city),
      description: detail?.description,
      latitude: detail?.latitude ?? placeCoordinates(city)?.latitude,
      longitude: detail?.longitude ?? placeCoordinates(city)?.longitude,
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
      document: document.raw,
      detail: detail
        ? {
            __normalizedHedinDetail: true,
            title: detail.title,
            description: detail.description,
            brand: detail.brand,
            model: detail.model,
            variant: detail.variant,
            vin: detail.vin,
            registrationNumber: detail.registrationNumber,
            modelYear: detail.modelYear,
            firstRegistration: detail.firstRegistration?.toISOString(),
            bodyType: detail.bodyType,
            fuelType: detail.fuelType,
            transmission: detail.transmission,
            drivetrain: detail.drivetrain,
            colour: detail.colour,
            doors: detail.doors,
            mileageKm: detail.mileageKm,
            priceAmount: detail.priceAmount,
            monthlyCostAmount: detail.monthlyCostAmount,
            sellerName: detail.sellerName,
            city: detail.city,
            latitude: detail.latitude,
            longitude: detail.longitude,
          }
        : undefined,
      summaryFingerprint: JSON.stringify({
        brand: document.brand,
        model: document.model,
        variant: document.variant,
        price: document.priceAmount,
        mileage: document.mileageKm,
        year: document.modelYear,
        image: document.featuredImageUrl,
      }),
      importedAt: observedAt.toISOString(),
    },
  };
}
