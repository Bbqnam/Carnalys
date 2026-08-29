import type {
  MarketplaceImporter,
  MarketplacePageRequest,
  MarketplaceRequestFailure,
  VehicleSearchPartition,
} from "@/application/ingestion/types";
import { listingSources } from "../source-registry";
import { HedinClient, HedinRequestError } from "./client";
import {
  hedinSummaryFingerprint,
  parseHedinDetailPage,
  parseHedinSearchPage,
} from "./parser";
import { normalizeHedinListing } from "./normalizer";
import type { HedinListingDetail, HedinSearchDocument } from "./types";

export type KnownHedinPayloadLookup = (
  provider: string,
  externalIds: readonly string[],
) => Promise<ReadonlyMap<string, unknown>>;

const detailConcurrency = 3;
const detailAttempts = 3;

function cachedDetail(payload: unknown): HedinListingDetail | undefined {
  const value = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const detail = value?.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined;
  const record = detail as Record<string, unknown>;
  if (!record.__normalizedHedinDetail) return undefined;
  const str = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : undefined);
  const num = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : undefined);
  return {
    title: str("title"),
    description: str("description"),
    brand: str("brand"),
    model: str("model"),
    variant: str("variant"),
    vin: str("vin"),
    registrationNumber: str("registrationNumber"),
    modelYear: num("modelYear"),
    firstRegistration: str("firstRegistration") ? new Date(str("firstRegistration")!) : undefined,
    bodyType: str("bodyType"),
    fuelType: str("fuelType"),
    transmission: str("transmission"),
    drivetrain: str("drivetrain"),
    colour: str("colour"),
    doors: num("doors"),
    mileageKm: num("mileageKm"),
    priceAmount: num("priceAmount"),
    monthlyCostAmount: num("monthlyCostAmount"),
    sellerName: str("sellerName"),
    city: str("city"),
    latitude: num("latitude"),
    longitude: num("longitude"),
    images: Array.isArray(value?.cachedImages)
      ? value!.cachedImages.filter((item): item is string => typeof item === "string")
      : [],
    equipment: Array.isArray(value?.cachedEquipment)
      ? value!.cachedEquipment.filter((item): item is string => typeof item === "string")
      : [],
    raw: record,
  };
}

function cachedFingerprint(payload: unknown) {
  return payload && typeof payload === "object" && "summaryFingerprint" in payload
    ? (payload as { summaryFingerprint?: unknown }).summaryFingerprint
    : undefined;
}

export class HedinImporter implements MarketplaceImporter {
  readonly source = listingSources.hedin;
  readonly provider = this.source.key;
  readonly scope = "used-cars";
  // The listing feed is one cumulative newest-first set; the parser carves a
  // fixed 48-car window per page. Kept as one reconciliation checkpoint so the
  // existing resume/removal machinery is reused unchanged.
  readonly maximumResultsPerPartition = Number.MAX_SAFE_INTEGER;
  private lastRequestAt = 0;
  private readonly detailLaneAt = new Array<number>(detailConcurrency).fill(0);

  constructor(
    private readonly client: Pick<HedinClient, "search" | "detail"> = new HedinClient(),
    private readonly knownPayloadLookup?: KnownHedinPayloadLookup,
  ) {}

  private async pace(last: number) {
    const remaining = this.source.requestPolicy.minimumIntervalMs - (Date.now() - last);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private async detail(document: HedinSearchDocument, lane: number) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= detailAttempts; attempt += 1) {
      await this.pace(this.detailLaneAt[lane]);
      try {
        const html = await this.client.detail(document.detailPath);
        this.detailLaneAt[lane] = Date.now();
        return parseHedinDetailPage(html);
      } catch (error) {
        lastError = error;
        this.detailLaneAt[lane] = Date.now();
        if (attempt < detailAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
        }
      }
    }
    console.warn(`Hedin-detalj ${document.id} kunde inte hämtas:`, lastError);
    return undefined;
  }

  private async details(documents: readonly HedinSearchDocument[]) {
    const result = new Map<string, HedinListingDetail | undefined>();
    let cursor = 0;
    const lane = async (laneIndex: number) => {
      while (cursor < documents.length) {
        const index = cursor++;
        result.set(documents[index].id, await this.detail(documents[index], laneIndex));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(detailConcurrency, documents.length) }, (_, index) =>
        lane(index),
      ),
    );
    return result;
  }

  async fetchPage(
    request: MarketplacePageRequest,
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.source.requestPolicy.maximumAttempts; attempt += 1) {
      await this.pace(this.lastRequestAt);
      try {
        const html = await this.client.search(request.page);
        this.lastRequestAt = Date.now();
        const page = parseHedinSearchPage(html, request.page);
        const cached = this.knownPayloadLookup
          ? await this.knownPayloadLookup(this.provider, page.documents.map(({ id }) => id))
          : new Map<string, unknown>();
        const needsDetail = page.documents.filter((document) => {
          const payload = cached.get(document.id);
          return (
            !cachedDetail(payload) ||
            cachedFingerprint(payload) !== hedinSummaryFingerprint(document)
          );
        });
        const fetched = await this.details(needsDetail);
        const listings = page.documents.map((document) => {
          const payload = cached.get(document.id);
          const fetchedDetail = fetched.get(document.id);
          const normalized = normalizeHedinListing(
            document,
            fetchedDetail ?? cachedDetail(payload),
            this.scope,
          );
          if (fetched.has(document.id) && !fetchedDetail && normalized.rawPayload) {
            (normalized.rawPayload as { summaryFingerprint?: unknown }).summaryFingerprint =
              cachedFingerprint(payload);
          }
          return normalized;
        });
        return {
          listings,
          rejectedCount: page.rejectedCount,
          totalMatches: page.totalItems,
          currentPage: request.page,
          lastPage: Math.max(1, Math.ceil(page.totalItems / page.pageSize)),
        };
      } catch (error) {
        lastError = error;
        this.lastRequestAt = Date.now();
        await onFailure({
          attempt,
          maximumAttempts: this.source.requestPolicy.maximumAttempts,
          error,
          httpStatus: error instanceof HedinRequestError ? error.status : undefined,
          requestParameters: { page: request.page, sortOrder: request.sortOrder },
        });
        if (attempt < this.source.requestPolicy.maximumAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(15_000, 750 * 2 ** (attempt - 1))),
          );
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Hedin-importen misslyckades.");
  }

  async discoverCurrentMaximumPrice(
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    const page = await this.fetchPage({ page: 1, sortOrder: "PUBLISHED_DESC" }, onFailure);
    return page.listings.reduce(
      (maximum, listing) => Math.max(maximum, listing.listing.priceAmount),
      0,
    );
  }

  initialReconciliationPartition(maximumPrice: number): VehicleSearchPartition {
    return {
      yearFrom: 1900,
      yearTo: new Date().getUTCFullYear() + 1,
      priceFrom: 0,
      priceTo: Math.max(maximumPrice, 1),
      unboundedPriceTo: true,
      mileageFrom: 0,
      mileageTo: 1_000_000,
    };
  }

  splitPartition(): readonly VehicleSearchPartition[] {
    throw new Error("Hedins fullständiga resultatuppsättning ska inte delas.");
  }
}
