import type {
  MarketplaceImporter,
  MarketplacePageRequest,
  MarketplaceRequestFailure,
  VehicleSearchPartition,
} from "@/application/ingestion/types";
import { listingSources } from "../source-registry";
import { BytbilClient, BytbilRequestError } from "./client";
import {
  bytbilSummaryFingerprint,
  parseBytbilDetailPage,
  parseBytbilSearchPage,
} from "./parser";
import { normalizeBytbilListing } from "./normalizer";
import type { BytbilListingDetail, BytbilSearchDocument } from "./types";

export type KnownBytbilPayloadLookup = (
  provider: string,
  externalIds: readonly string[],
) => Promise<ReadonlyMap<string, unknown>>;

const detailConcurrency = 3;
const detailAttempts = 3;

function cachedDetail(payload: unknown): BytbilListingDetail | undefined {
  const value = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const detail = value?.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined;
  const record = detail as Record<string, unknown>;
  if (!record.__normalizedBytbilDetail) return undefined;
  const images = Array.isArray(value?.cachedImages)
    ? value!.cachedImages.filter((item): item is string => typeof item === "string")
    : [];
  const equipment = Array.isArray(value?.cachedEquipment)
    ? value!.cachedEquipment.filter((item): item is string => typeof item === "string")
    : [];
  return {
    title: typeof record.title === "string" ? record.title : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    make: typeof record.make === "string" ? record.make : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    variant: typeof record.variant === "string" ? record.variant : undefined,
    registrationNumber:
      typeof record.registrationNumber === "string" ? record.registrationNumber : undefined,
    modelYear: typeof record.modelYear === "number" ? record.modelYear : undefined,
    bodyType: typeof record.bodyType === "string" ? record.bodyType : undefined,
    fuelType: typeof record.fuelType === "string" ? record.fuelType : undefined,
    transmission: typeof record.transmission === "string" ? record.transmission : undefined,
    drivetrain: typeof record.drivetrain === "string" ? record.drivetrain : undefined,
    horsepower: typeof record.horsepower === "number" ? record.horsepower : undefined,
    engineDisplacementCc:
      typeof record.engineDisplacementCc === "number" ? record.engineDisplacementCc : undefined,
    colour: typeof record.colour === "string" ? record.colour : undefined,
    mileageKm: typeof record.mileageKm === "number" ? record.mileageKm : undefined,
    priceAmount: typeof record.priceAmount === "number" ? record.priceAmount : undefined,
    previousPriceAmount:
      typeof record.previousPriceAmount === "number" ? record.previousPriceAmount : undefined,
    sellerName: typeof record.sellerName === "string" ? record.sellerName : undefined,
    dealerId: typeof record.dealerId === "string" ? record.dealerId : undefined,
    images,
    equipment,
    raw: record,
  };
}

function cachedFingerprint(payload: unknown) {
  return payload && typeof payload === "object" && "summaryFingerprint" in payload
    ? (payload as { summaryFingerprint?: unknown }).summaryFingerprint
    : undefined;
}

export class BytbilImporter implements MarketplaceImporter {
  readonly source = listingSources.bytbil;
  readonly provider = this.source.key;
  readonly scope = "all-vehicles";
  // Bytbil is one complete `?Page=` paginated result set, like Wayke — kept as
  // a single reconciliation checkpoint so the existing resume/removal machinery
  // works unchanged.
  readonly maximumResultsPerPartition = Number.MAX_SAFE_INTEGER;
  private lastRequestAt = 0;
  private readonly detailLaneAt = new Array<number>(detailConcurrency).fill(0);

  constructor(
    private readonly client: Pick<BytbilClient, "search" | "detail"> = new BytbilClient(),
    private readonly knownPayloadLookup?: KnownBytbilPayloadLookup,
  ) {}

  private async pace(last: number) {
    const remaining = this.source.requestPolicy.minimumIntervalMs - (Date.now() - last);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private async detail(document: BytbilSearchDocument, lane: number) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= detailAttempts; attempt += 1) {
      await this.pace(this.detailLaneAt[lane]);
      try {
        const html = await this.client.detail(document.detailPath);
        this.detailLaneAt[lane] = Date.now();
        return parseBytbilDetailPage(html);
      } catch (error) {
        lastError = error;
        this.detailLaneAt[lane] = Date.now();
        if (attempt < detailAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
        }
      }
    }
    console.warn(`Bytbil-detalj ${document.id} kunde inte hämtas:`, lastError);
    return undefined;
  }

  private async details(documents: readonly BytbilSearchDocument[]) {
    const result = new Map<string, BytbilListingDetail | undefined>();
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
    const order = request.sortOrder === "PRICE_DESC" ? "priceDesc" : "published";
    for (let attempt = 1; attempt <= this.source.requestPolicy.maximumAttempts; attempt += 1) {
      await this.pace(this.lastRequestAt);
      try {
        const html = await this.client.search(request.page, order);
        this.lastRequestAt = Date.now();
        const page = parseBytbilSearchPage(html);
        const cached = this.knownPayloadLookup
          ? await this.knownPayloadLookup(
              this.provider,
              page.documents.map(({ id }) => id),
            )
          : new Map<string, unknown>();
        const needsDetail = page.documents.filter((document) => {
          const payload = cached.get(document.id);
          return (
            !cachedDetail(payload) ||
            cachedFingerprint(payload) !== bytbilSummaryFingerprint(document)
          );
        });
        const fetched = await this.details(needsDetail);
        const listings = page.documents.map((document) => {
          const payload = cached.get(document.id);
          const fetchedDetail = fetched.get(document.id);
          const normalized = normalizeBytbilListing(
            document,
            fetchedDetail ?? cachedDetail(payload),
            this.scope,
          );
          // A changed summary whose detail fetch failed still persists its safe
          // summary update, but must keep the stale fingerprint so the next run
          // retries enrichment rather than trusting the fallback.
          if (fetched.has(document.id) && !fetchedDetail && normalized.rawPayload) {
            (normalized.rawPayload as { summaryFingerprint?: unknown }).summaryFingerprint =
              cachedFingerprint(payload);
          }
          return normalized;
        });
        return {
          listings,
          rejectedCount: page.rejectedCount,
          totalMatches: page.totalMatches,
          currentPage: page.currentPage,
          lastPage: Math.max(1, Math.ceil(page.totalMatches / page.pageSize)),
        };
      } catch (error) {
        lastError = error;
        this.lastRequestAt = Date.now();
        await onFailure({
          attempt,
          maximumAttempts: this.source.requestPolicy.maximumAttempts,
          error,
          httpStatus: error instanceof BytbilRequestError ? error.status : undefined,
          requestParameters: { page: request.page, sortOrder: request.sortOrder },
        });
        if (attempt < this.source.requestPolicy.maximumAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(15_000, 750 * 2 ** (attempt - 1))),
          );
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Bytbil-importen misslyckades.");
  }

  async discoverCurrentMaximumPrice(
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    const page = await this.fetchPage({ page: 1, sortOrder: "PRICE_DESC" }, onFailure);
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
    throw new Error("Bytbils fullständiga resultatuppsättning ska inte delas.");
  }
}
