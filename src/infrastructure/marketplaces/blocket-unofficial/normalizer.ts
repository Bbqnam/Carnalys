import type {
  BodyStyle,
  Drivetrain,
  FuelType,
  TransmissionType,
} from "@/domain/vehicle";
import type { NormalizedVehicleListing } from "@/application/ingestion/types";
import type { BlocketListingDetail, BlocketSearchDocument } from "./types";

const provider = "blocket_unofficial";

function normalizeFuel(value?: string): FuelType {
  const fuel = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (fuel.includes("laddhybrid") || (fuel.includes("el") && fuel.includes("bensin")))
    return "plug_in_hybrid";
  if (fuel.includes("hybrid")) return "self_charging_hybrid";
  if (fuel === "el" || fuel.includes("elektrisk")) return "electric";
  if (fuel.includes("diesel")) return "diesel";
  if (fuel.includes("bensin")) return "petrol";
  if (fuel.includes("etanol")) return "ethanol";
  if (fuel.includes("vätgas")) return "hydrogen";
  return "other";
}

function normalizeTransmission(value?: string): TransmissionType {
  const transmission = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (transmission.includes("automat")) return "automatic";
  if (transmission.includes("manuell")) return "manual";
  return "other";
}

function normalizeBodyStyle(value?: string): BodyStyle {
  const bodyStyle = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (bodyStyle.includes("suv")) return "suv";
  if (bodyStyle.includes("kombi")) return "estate";
  if (bodyStyle.includes("sedan")) return "sedan";
  if (bodyStyle.includes("halvkombi")) return "hatchback";
  if (bodyStyle.includes("coup")) return "coupe";
  if (bodyStyle.includes("cabriolet")) return "convertible";
  if (bodyStyle.includes("pickup")) return "pickup";
  if (bodyStyle.includes("minibuss")) return "minivan";
  if (bodyStyle.includes("transport")) return "van";
  return "other";
}

function normalizeDrivetrain(value?: string): Drivetrain | undefined {
  const drivetrain = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (drivetrain.includes("fyrhjul")) return "all_wheel_drive";
  if (drivetrain.includes("framhjul")) return "front_wheel_drive";
  if (drivetrain.includes("bakhjul")) return "rear_wheel_drive";
  return drivetrain ? "other" : undefined;
}

function parseFirstNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized.match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export function normalizeBlocketListing(
  document: BlocketSearchDocument,
  detail: BlocketListingDetail | undefined,
  scope: string,
): NormalizedVehicleListing {
  const specifications = detail?.specifications ?? {};
  const firstRegistration = parseDate(specifications.Registreringsdatum);
  const engineLiters = parseFirstNumber(specifications.Motorvolym);
  const horsepower = parseFirstNumber(specifications.Effekt);
  const seenAt = new Date();

  return {
    source: {
      provider,
      scope,
      externalId: document.id,
      listingUrl: document.canonicalUrl,
      publishedAt: document.timestamp,
    },
    vehicle: {
      vin: document.vin ?? specifications.Chassinummer,
      registrationNumber:
        document.registrationNumber ?? specifications.Registreringsnummer,
      make: document.make,
      model: document.model,
      variant: document.variant,
      modelYear: document.year,
      registrationYear: firstRegistration?.getUTCFullYear(),
      firstRegistration,
      bodyStyle: normalizeBodyStyle(specifications.Biltyp),
      fuelType: normalizeFuel(document.fuel ?? specifications.Drivmedel),
      transmission: normalizeTransmission(
        document.transmission ?? specifications.Växellåda,
      ),
      drivetrain: normalizeDrivetrain(specifications.Drivhjul),
      horsepower: horsepower ? Math.round(horsepower) : undefined,
      engineDescription: specifications.Motorvolym,
      engineDisplacementCc: engineLiters ? Math.round(engineLiters * 1000) : undefined,
    },
    listing: {
      sellerName: document.organisationName,
      sellerType:
        document.dealerSegment?.toLocaleLowerCase("sv-SE") === "företag"
          ? "dealer"
          : "private",
      priceAmount: document.priceAmount,
      mileageKm: document.mileageMil * 10,
      location: document.location,
      municipality: document.location,
      latitude: document.coordinates?.latitude,
      longitude: document.coordinates?.longitude,
      description: detail?.description,
      serviceHistory: "unknown",
      equipment: detail?.equipment ?? [],
      // Keep a useful gallery without multiplying storage by every source
      // image across a six-figure catalog. The original listing retains the
      // complete gallery.
      images: document.imageUrls.slice(0, 8).map((url, position) => ({
        url,
        thumbnailUrl: position === 0 ? document.thumbnail?.url : undefined,
        alt: `${document.make} ${document.model} ${document.variant ?? ""}`.trim(),
        position,
        width: position === 0 ? document.thumbnail?.width : undefined,
        height: position === 0 ? document.thumbnail?.height : undefined,
      })),
    },
    rawPayload: {
      search: document.raw,
      detail: detail?.raw,
      importedAt: seenAt.toISOString(),
    },
  };
}
