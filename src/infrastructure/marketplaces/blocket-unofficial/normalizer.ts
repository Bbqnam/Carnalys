import type {
  BodyStyle,
  Drivetrain,
  FuelType,
  TransmissionType,
} from "@/domain/vehicle";
import { MAX_LISTING_IMAGES, type NormalizedVehicleListing } from "@/application/ingestion/types";
import type { BlocketListingDetail, BlocketSearchDocument } from "./types";

const provider = "blocket_unofficial";

function normalizeFuel(value?: string): FuelType {
  const fuel = value?.toLocaleLowerCase("sv-SE") ?? "";
  if (fuel.includes("laddhybrid") || (/\bel\b/.test(fuel) && fuel.includes("bensin")))
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

// Blocket's fuel/energy consumption spec key isn't stable text — it's a
// label plus a baked-in tooltip explanation (and varies between the NEDC
// and WLTP test cycles), e.g. "Bränsleförbrukning(NEDC)NEDC var den
// officiella testcykeln…" or "Energiförbrukning(WLTP)WLTP är ett värde…".
// The value itself (e.g. "7,5 L/100 km") is clean, so match by prefix.
function findConsumptionValue(specifications: Record<string, string>) {
  const key = Object.keys(specifications).find(
    (candidate) =>
      candidate.startsWith("Bränsleförbrukning") ||
      candidate.startsWith("Energiförbrukning"),
  );
  return key ? specifications[key] : undefined;
}

// The unofficial API's detail response sometimes carries most of the
// "Specifikationer" block but drops individual keys — body style and
// horsepower in particular, since the deal score, body-style filter, and
// card/detail display all rely on them. An entirely-empty specifications
// object already triggers an HTML fallback in the importer; this lets it
// also trigger when just one of these is missing from an otherwise-
// populated response.
//
// Horsepower belongs here (unlike fuel/energy consumption below) because
// it's present on Blocket's own page almost every time the rest of the
// spec block is — only ~1% of listings with a recognized body style lack
// it — so checking for it catches real partial-fetch gaps without causing
// much pointless re-scraping.
//
// Deliberately NOT applied to fuel/energy consumption: most Blocket sellers
// simply never fill that field in (it's optional on their listing form), so
// its absence is normal sparse data, not a fetch failure — treating it as
// "critical" would make every listing look permanently broken and trigger a
// pointless re-fetch/re-scrape on every sync, forever, for data that was
// never going to be there.
export function isMissingCriticalSpecifications(specifications: Record<string, string>) {
  return !("Biltyp" in specifications) || !("Effekt" in specifications);
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
  const ownerCount = parseFirstNumber(specifications["Antal ägare"]);
  const seenAt = new Date();
  const imageUrls =
    document.imageUrls.length > 0 ? document.imageUrls : (detail?.imageUrls ?? []);

  return {
    source: {
      provider,
      scope,
      externalId: document.id,
      listingUrl: document.canonicalUrl,
      observedAt: seenAt,
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
      fuelConsumption: findConsumptionValue(specifications)?.trim() || undefined,
    },
    listing: {
      title: document.heading,
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
      ownerCount: ownerCount ? Math.round(ownerCount) : undefined,
      equipment: detail?.equipment ?? [],
      // Keep a useful gallery without multiplying storage by every source
      // image across a six-figure catalog. The original listing retains the
      // complete gallery. De-duplicated before the slice so a source that
      // repeats a URL spends the budget on eight distinct photos rather than
      // storing the same one twice.
      images: [...new Set(imageUrls)].slice(0, MAX_LISTING_IMAGES).map((url, position) => ({
        url,
        thumbnailUrl: position === 0 ? document.thumbnail?.url : undefined,
        alt: `${document.make} ${document.model} ${document.variant ?? ""}`.trim(),
        position,
        width: position === 0 ? document.thumbnail?.width : undefined,
        height: position === 0 ? document.thumbnail?.height : undefined,
      })),
    },
    // Store everything we fetched, not just the fields we currently map to
    // typed columns — `detail` is read back as an enrichment cache (see
    // existingListingDetailPayloads), but keeping `document` too means the
    // full search-result payload isn't thrown away, so future fields can be
    // mined from already-stored data instead of requiring a re-crawl.
    rawPayload: { document: document.raw, detail: detail?.raw, importedAt: seenAt.toISOString() },
  };
}
