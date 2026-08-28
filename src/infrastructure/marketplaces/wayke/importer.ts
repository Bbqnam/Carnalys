import type {
  MarketplaceImporter,
  MarketplacePageRequest,
  MarketplaceRequestFailure,
  VehicleSearchPartition,
} from "@/application/ingestion/types";
import { listingSources } from "../source-registry";
import { WaykeClient, WaykeRequestError } from "./client";
import {
  parseWaykeDetailData,
  parseWaykeDetailPage,
  parseWaykeSearchPage,
  waykeSummaryFingerprint,
} from "./parser";
import { normalizeWaykeListing } from "./normalizer";
import type { WaykeListingDetail, WaykeSearchDocument } from "./types";

export type KnownWaykePayloadLookup = (
  provider: string,
  externalIds: readonly string[],
) => Promise<ReadonlyMap<string, unknown>>;

const detailConcurrency = 3;
const detailAttempts = 3;

function cachedDetail(payload: unknown): WaykeListingDetail | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as {
    detail?: unknown;
    detailEquipment?: unknown;
    cachedImages?: unknown;
    cachedEquipment?: unknown;
  };
  if (!value.detail || typeof value.detail !== "object" || Array.isArray(value.detail)) return undefined;
  const detail = value.detail as Record<string, unknown>;
  const parsed = detail.__normalizedWaykeDetail
    ? ({
        ...detail,
        publishedAt:
          typeof detail.publishedAt === "string"
            ? new Date(detail.publishedAt)
            : undefined,
        images: [],
        equipment: [],
        raw: detail,
      } as unknown as WaykeListingDetail)
    : parseWaykeDetailData(detail);
  const equipmentSource = value.cachedEquipment ?? value.detailEquipment;
  const equipment = Array.isArray(equipmentSource)
    ? equipmentSource.filter((item): item is string => typeof item === "string")
    : [];
  const images = Array.isArray(value.cachedImages)
    ? value.cachedImages.filter((item): item is string => typeof item === "string")
    : parsed.images;
  return { ...parsed, images, equipment };
}

function cachedFingerprint(payload: unknown) {
  return payload && typeof payload === "object" && "summaryFingerprint" in payload
    ? (payload as { summaryFingerprint?: unknown }).summaryFingerprint
    : undefined;
}

export class WaykeImporter implements MarketplaceImporter {
  readonly source = listingSources.wayke;
  readonly provider = this.source.key;
  readonly scope = "all-vehicles";
  // Wayke exposes one complete offset-paginated result set. Keeping it as one
  // checkpoint lets the existing recovery/removal machinery resume exact pages
  // without inventing a second ingestion system.
  readonly maximumResultsPerPartition = Number.MAX_SAFE_INTEGER;
  private lastRequestAt = 0;
  private readonly detailLaneAt = new Array<number>(detailConcurrency).fill(0);

  constructor(
    private readonly client: Pick<WaykeClient, "search" | "detail"> = new WaykeClient(),
    private readonly knownPayloadLookup?: KnownWaykePayloadLookup,
  ) {}

  private async pace(last: number) {
    const remaining = this.source.requestPolicy.minimumIntervalMs - (Date.now() - last);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private async detail(document: WaykeSearchDocument, lane: number) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= detailAttempts; attempt += 1) {
      await this.pace(this.detailLaneAt[lane]);
      try {
        const html = await this.client.detail(document.id);
        this.detailLaneAt[lane] = Date.now();
        return parseWaykeDetailPage(html);
      } catch (error) {
        lastError = error;
        this.detailLaneAt[lane] = Date.now();
        if (attempt < detailAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
        }
      }
    }
    console.warn(`Wayke-detalj ${document.id} kunde inte hämtas:`, lastError);
    return undefined;
  }

  private async details(documents: readonly WaykeSearchDocument[]) {
    const result = new Map<string, WaykeListingDetail | undefined>();
    let cursor = 0;
    const lane = async (laneIndex: number) => {
      while (cursor < documents.length) {
        const index = cursor++;
        result.set(documents[index].id, await this.detail(documents[index], laneIndex));
      }
    };
    await Promise.all(Array.from({ length: Math.min(detailConcurrency, documents.length) }, (_, index) => lane(index)));
    return result;
  }

  async fetchPage(
    request: MarketplacePageRequest,
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    let lastError: unknown;
    const sort = request.sortOrder === "PRICE_DESC" ? "priceDefaultDesc" : "itemSortDesc";
    for (let attempt = 1; attempt <= this.source.requestPolicy.maximumAttempts; attempt += 1) {
      await this.pace(this.lastRequestAt);
      try {
        const html = await this.client.search(request.page, sort);
        this.lastRequestAt = Date.now();
        const page = parseWaykeSearchPage(html);
        const cached = this.knownPayloadLookup
          ? await this.knownPayloadLookup(this.provider, page.documents.map(({ id }) => id))
          : new Map<string, unknown>();
        const needsDetail = page.documents.filter((document) => {
          const payload = cached.get(document.id);
          return !cachedDetail(payload) || cachedFingerprint(payload) !== waykeSummaryFingerprint(document);
        });
        const fetched = await this.details(needsDetail);
        const listings = page.documents.map((document) => {
          const payload = cached.get(document.id);
          const fetchedDetail = fetched.get(document.id);
          const normalized = normalizeWaykeListing(
            document,
            fetchedDetail ?? cachedDetail(payload),
            this.scope,
          );
          // When a changed listing's detail fetch fails we may still persist
          // its safe summary update using the older detail cache. Keep the old
          // fingerprint so the next run retries enrichment instead of treating
          // that fallback as a successfully refreshed detail.
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
          currentPage: Math.floor(page.offset / page.hitsPerPage) + 1,
          lastPage: Math.max(1, Math.ceil(page.totalMatches / page.hitsPerPage)),
        };
      } catch (error) {
        lastError = error;
        this.lastRequestAt = Date.now();
        await onFailure({
          attempt,
          maximumAttempts: this.source.requestPolicy.maximumAttempts,
          error,
          httpStatus: error instanceof WaykeRequestError ? error.status : undefined,
          requestParameters: { page: request.page, sortOrder: request.sortOrder },
        });
        if (attempt < this.source.requestPolicy.maximumAttempts) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 750 * 2 ** (attempt - 1))));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Wayke-importen misslyckades.");
  }

  async discoverCurrentMaximumPrice(onFailure: (failure: MarketplaceRequestFailure) => Promise<void>) {
    const page = await this.fetchPage({ page: 1, sortOrder: "PRICE_DESC" }, onFailure);
    return page.listings.reduce((maximum, listing) => Math.max(maximum, listing.listing.priceAmount), 0);
  }

  initialReconciliationPartition(maximumPrice: number): VehicleSearchPartition {
    return {
      yearFrom: 1900,
      yearTo: new Date().getUTCFullYear() + 1,
      priceFrom: 0,
      priceTo: maximumPrice,
      unboundedPriceTo: true,
      mileageFrom: 0,
      mileageTo: 1_000_000,
    };
  }

  splitPartition(): readonly VehicleSearchPartition[] {
    throw new Error("Waykes fullständiga resultatuppsättning ska inte delas.");
  }
}
