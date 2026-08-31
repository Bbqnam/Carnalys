import { MAX_LISTING_IMAGES, type NormalizedVehicleListing } from "@/application/ingestion/types";
import type {
  BodyStyle,
  Drivetrain,
  FuelType,
  ServiceHistoryStatus,
  TransmissionType,
} from "@/domain/vehicle";
import { placeCoordinates } from "../swedish-place-coordinates";
import type { AutoheroListingDetail, AutoheroSearchDocument } from "./types";

/** AUTO1 fuel-type enum ids, resolved from the storefront's own filter config. */
const FUEL_BY_ID: Record<number, FuelType> = {
  1039: "petrol",
  1040: "diesel",
  1041: "other", // LPG
  1042: "other", // CNG
  1043: "other",
  1044: "electric",
  1045: "ethanol",
  1046: "self_charging_hybrid", // refined to plug-in below when the trim says so
};

const TRANSMISSION_BY_ID: Record<number, TransmissionType> = {
  1138: "manual",
  1139: "automatic",
  1140: "automatic", // semi-automatic
};

function fuelFromText(value: string): FuelType | undefined {
  const lower = value.toLocaleLowerCase("sv-SE");
  if (lower.includes("laddhybrid") || lower.includes("plug")) return "plug_in_hybrid";
  if (lower.includes("hybrid")) return "self_charging_hybrid";
  if (lower.includes("elektro") || lower === "el" || lower.includes("electric")) return "electric";
  if (lower.includes("diesel")) return "diesel";
  if (lower.includes("bensin") || lower.includes("benzin") || lower.includes("petrol")) return "petrol";
  if (lower.includes("etanol") || lower.includes("ethanol") || lower.includes("e85")) return "ethanol";
  if (lower.includes("vätgas") || lower.includes("hydrogen")) return "hydrogen";
  if (lower.includes("gas")) return "other";
  return undefined;
}

/** Autohero labels every hybrid — parallel or plug-in — simply "Hybrid" in both
 *  the enum and the localized string. `isPluginSystem` is the authoritative
 *  separator; fall back to the trim wording, then to a combined-consumption
 *  figure too low to be anything but a PHEV. */
function refineHybrid(
  base: FuelType,
  isPluginSystem: boolean | undefined,
  hints: string,
  consumption: number | undefined,
): FuelType {
  if (base !== "self_charging_hybrid") return base;
  if (isPluginSystem === true) return "plug_in_hybrid";
  if (isPluginSystem === false) return "self_charging_hybrid";
  const lower = hints.toLocaleLowerCase("sv-SE");
  if (/(plug[\s-]?in|phev|laddhybrid|e-?tense|recharge|tfsi ?e|\b\d{3}e\b|xe\b)/.test(lower)) {
    return "plug_in_hybrid";
  }
  if (consumption !== undefined && consumption > 0 && consumption < 3) return "plug_in_hybrid";
  return base;
}

function resolveFuel(
  detailText: string | undefined,
  id: number | undefined,
  isPluginSystem: boolean | undefined,
  hints: string,
  consumption: number | undefined,
): FuelType {
  const fromText = detailText ? fuelFromText(detailText) : undefined;
  const base = fromText ?? (id !== undefined ? FUEL_BY_ID[id] : undefined) ?? "other";
  return refineHybrid(base, isPluginSystem, hints, consumption);
}

function resolveTransmission(
  detailText: string | undefined,
  id: number | undefined,
): TransmissionType {
  const lower = detailText?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("automat")) return "automatic";
  if (lower.includes("manuell") || lower.includes("manual")) return "manual";
  return id !== undefined ? TRANSMISSION_BY_ID[id] ?? "other" : "other";
}

/** Autohero body types are Swedish retail labels: SUV, Kombi, Småbil, Sedan,
 *  Halvkombi, Coupé, Cab, "Van / MPV", Familjebuss, Yrkesfordon, Pickup. */
function body(value?: string): BodyStyle {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (lower.includes("suv") || lower.includes("terräng") || lower.includes("crossover")) return "suv";
  if (lower.includes("halvkombi") || lower.includes("hatchback")) return "hatchback";
  if (lower.includes("kombi")) return "estate";
  if (lower.includes("sedan")) return "sedan";
  if (lower.includes("coup")) return "coupe";
  if (lower.includes("cab") || lower.includes("convertible") || lower.includes("roadster")) {
    return "convertible";
  }
  if (lower.includes("pickup") || lower.includes("pick-up")) return "pickup";
  if (lower.includes("mpv") || lower.includes("familjebuss") || lower.includes("minibuss")) {
    return "minivan";
  }
  if (lower.includes("skåp") || lower.includes("transport") || lower.includes("yrkesfordon") || lower.includes("van")) {
    return "van";
  }
  if (lower.includes("småbil") || lower.includes("small") || lower.includes("kompakt") || lower.includes("mini")) {
    return "hatchback";
  }
  return "other";
}

function drivetrain(value?: string): Drivetrain | undefined {
  const lower = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (!lower) return undefined;
  if (lower.includes("all-wheel") || lower.includes("all wheel") || lower.includes("fyrhjul") || lower.includes("awd") || lower.includes("4wd")) {
    return "all_wheel_drive";
  }
  if (lower.includes("front")) return "front_wheel_drive";
  if (lower.includes("rear")) return "rear_wheel_drive";
  return "other";
}

function serviceHistory(
  detail: AutoheroListingDetail | undefined,
  document: AutoheroSearchDocument,
): ServiceHistoryStatus {
  if (detail?.serviceHistory && detail.serviceHistory !== "unknown") return detail.serviceHistory;
  if (document.hasFilledServiceBook === true) return "complete";
  if (document.hasFilledServiceBook === false) return "missing";
  return "unknown";
}

function place(value: string | undefined) {
  return value?.trim() || "Sverige";
}

export function normalizeAutoheroListing(
  document: AutoheroSearchDocument,
  detail: AutoheroListingDetail | undefined,
  scope: string,
): NormalizedVehicleListing {
  const observedAt = new Date();
  const trim =
    detail?.variant ??
    ([document.subType, document.subTypeExtra].filter(Boolean).join(" ") || undefined);
  const title =
    detail?.title ??
    [document.make, document.model, trim].filter(Boolean).join(" ").trim();
  const hints = [document.subType, document.subTypeExtra, detail?.variant, detail?.title]
    .filter(Boolean)
    .join(" ");
  const consumption = document.fuelConsumptionCombined;
  const city = document.city;
  const imageUrls = detail?.images.length
    ? detail.images
    : document.featuredImageUrl
      ? [document.featuredImageUrl]
      : [];
  const powerFromKw =
    document.powerKw !== undefined ? Math.round(document.powerKw * 1.35962) : undefined;

  return {
    source: {
      provider: "autohero",
      scope,
      externalId: document.id,
      listingUrl: `https://www.autohero.com/se/${document.slug}/id/${document.id}/`,
      observedAt,
      publishedAt: document.firstPublishedAt ?? document.publishedAt,
    },
    vehicle: {
      vin: detail?.vin,
      registrationNumber: detail?.registrationNumber,
      make: document.make,
      model: document.model,
      variant: trim,
      modelYear: document.modelYear,
      registrationYear: document.registrationYear,
      firstRegistration: document.firstRegistration,
      bodyStyle: body(detail?.bodyType),
      fuelType: resolveFuel(
        detail?.fuelType,
        document.fuelTypeId,
        document.isPluginSystem,
        hints,
        consumption,
      ),
      transmission: resolveTransmission(detail?.transmission, document.gearTypeId),
      drivetrain: drivetrain(detail?.drivetrain ?? document.driveTrain),
      horsepower: detail?.horsepower ?? powerFromKw,
      engineDisplacementCc: detail?.engineDisplacementCc ?? document.engineDisplacementCc,
      fuelConsumption:
        detail?.fuelConsumption ??
        (consumption !== undefined ? `${consumption} l/100km` : undefined),
    },
    listing: {
      title,
      // Autohero reconditions and sells every car itself — one seller, not a
      // marketplace of dealers. The branch is just where the car is stored.
      sellerName: "Autohero",
      sellerType: "dealer",
      priceAmount: detail?.priceAmount ?? document.priceAmount,
      previousPriceAmount: document.previousPriceAmount,
      monthlyCostAmount: document.monthlyCostAmount,
      mileageKm: detail?.mileageKm ?? document.mileageKm,
      location: place(city),
      municipality: place(city),
      latitude: placeCoordinates(city)?.latitude,
      longitude: placeCoordinates(city)?.longitude,
      description: detail?.description,
      serviceHistory: serviceHistory(detail, document),
      ownerCount: detail?.ownerCount ?? document.ownerCount,
      equipment: detail?.equipment ?? [],
      images: [...new Set(imageUrls)]
        .slice(0, MAX_LISTING_IMAGES)
        .map((url, position) => ({
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
            __normalizedAutoheroDetail: true,
            title: detail.title,
            description: detail.description,
            vin: detail.vin,
            registrationNumber: detail.registrationNumber,
            variant: detail.variant,
            bodyType: detail.bodyType,
            fuelType: detail.fuelType,
            transmission: detail.transmission,
            drivetrain: detail.drivetrain,
            colour: detail.colour,
            doors: detail.doors,
            seats: detail.seats,
            horsepower: detail.horsepower,
            engineDisplacementCc: detail.engineDisplacementCc,
            fuelConsumption: detail.fuelConsumption,
            mileageKm: detail.mileageKm,
            priceAmount: detail.priceAmount,
            ownerCount: detail.ownerCount,
            serviceHistory: detail.serviceHistory,
          }
        : undefined,
      cachedImages: detail?.images ?? [],
      cachedEquipment: detail?.equipment ?? [],
      summaryFingerprint: JSON.stringify({
        price: document.priceAmount,
        previousPrice: document.previousPriceAmount,
        monthly: document.monthlyCostAmount,
        mileage: document.mileageKm,
        subType: document.subType,
        subTypeExtra: document.subTypeExtra,
        image: document.featuredImageUrl,
        publishedAt: document.publishedAt?.toISOString(),
      }),
      importedAt: observedAt.toISOString(),
    },
  };
}
