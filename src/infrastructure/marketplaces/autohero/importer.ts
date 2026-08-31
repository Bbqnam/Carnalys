import type {
  MarketplaceImporter,
  MarketplacePageRequest,
  MarketplaceRequestFailure,
  VehicleSearchPartition,
} from "@/application/ingestion/types";
import { listingSources } from "../source-registry";
import { AutoheroClient, AutoheroRequestError, type AutoheroSort } from "./client";
import {
  autoheroSummaryFingerprint,
  parseAutoheroDetailPage,
  parseAutoheroSearchResponse,
} from "./parser";
import { normalizeAutoheroListing } from "./normalizer";
import type { AutoheroListingDetail, AutoheroSearchDocument } from "./types";

export type KnownAutoheroPayloadLookup = (
  provider: string,
  externalIds: readonly string[],
) => Promise<ReadonlyMap<string, unknown>>;

const HITS_PER_PAGE = 24;
const detailConcurrency = 3;
const detailAttempts = 3;

/** Rebuild a detail record from the flat form retained on the listing's raw
 *  payload, so an unchanged summary never re-fetches the detail page. */
function cachedDetail(payload: unknown): AutoheroListingDetail | undefined {
  const value = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const detail = value?.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined;
  const record = detail as Record<string, unknown>;
  if (!record.__normalizedAutoheroDetail) return undefined;
  const str = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : undefined);
  const num = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : undefined);
  const serviceHistory = str("serviceHistory");
  return {
    title: str("title"),
    description: str("description"),
    vin: str("vin"),
    registrationNumber: str("registrationNumber"),
    variant: str("variant"),
    bodyType: str("bodyType"),
    fuelType: str("fuelType"),
    transmission: str("transmission"),
    drivetrain: str("drivetrain"),
    colour: str("colour"),
    doors: num("doors"),
    seats: num("seats"),
    horsepower: num("horsepower"),
    engineDisplacementCc: num("engineDisplacementCc"),
    fuelConsumption: str("fuelConsumption"),
    mileageKm: num("mileageKm"),
    priceAmount: num("priceAmount"),
    ownerCount: num("ownerCount"),
    serviceHistory:
      serviceHistory === "complete" ||
      serviceHistory === "partial" ||
      serviceHistory === "missing"
        ? serviceHistory
        : "unknown",
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

export class AutoheroImporter implements MarketplaceImporter {
  readonly source = listingSources.autohero;
  readonly provider = this.source.key;
  readonly scope = "retail";
  // Autohero exposes one Sweden-wide result set over offset pagination; kept as
  // a single reconciliation checkpoint so the existing resume/removal machinery
  // is reused unchanged.
  readonly maximumResultsPerPartition = Number.MAX_SAFE_INTEGER;
  private lastRequestAt = 0;
  private readonly detailLaneAt = new Array<number>(detailConcurrency).fill(0);

  constructor(
    private readonly client: Pick<AutoheroClient, "search" | "detail"> = new AutoheroClient(),
    private readonly knownPayloadLookup?: KnownAutoheroPayloadLookup,
  ) {}

  private async pace(last: number) {
    const remaining = this.source.requestPolicy.minimumIntervalMs - (Date.now() - last);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private async detail(document: AutoheroSearchDocument, lane: number) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= detailAttempts; attempt += 1) {
      await this.pace(this.detailLaneAt[lane]);
      try {
        const html = await this.client.detail(document.slug, document.id);
        this.detailLaneAt[lane] = Date.now();
        return parseAutoheroDetailPage(html);
      } catch (error) {
        lastError = error;
        this.detailLaneAt[lane] = Date.now();
        if (attempt < detailAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
        }
      }
    }
    console.warn(`Autohero-detalj ${document.id} kunde inte hämtas:`, lastError);
    return undefined;
  }

  private async details(documents: readonly AutoheroSearchDocument[]) {
    const result = new Map<string, AutoheroListingDetail | undefined>();
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
    // Autohero's gateway only accepts a handful of sort keys and rejects every
    // price sort outright. The result set is one un-partitioned Sweden-wide
    // list, so newest-first is all the ingestion ever needs — it lets the
    // incremental walk stop early once a page is past the lookback window.
    const sort: AutoheroSort = "newest_eligible";
    void request.sortOrder;
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.source.requestPolicy.maximumAttempts; attempt += 1) {
      await this.pace(this.lastRequestAt);
      try {
        const body = await this.client.search(request.page, sort, HITS_PER_PAGE);
        this.lastRequestAt = Date.now();
        const page = parseAutoheroSearchResponse(
          body,
          Math.max(0, request.page - 1) * HITS_PER_PAGE,
          HITS_PER_PAGE,
        );
        const cached = this.knownPayloadLookup
          ? await this.knownPayloadLookup(this.provider, page.documents.map(({ id }) => id))
          : new Map<string, unknown>();
        const needsDetail = page.documents.filter((document) => {
          const payload = cached.get(document.id);
          return (
            !cachedDetail(payload) ||
            cachedFingerprint(payload) !== autoheroSummaryFingerprint(document)
          );
        });
        const fetched = await this.details(needsDetail);
        const listings = page.documents.map((document) => {
          const payload = cached.get(document.id);
          const fetchedDetail = fetched.get(document.id);
          const normalized = normalizeAutoheroListing(
            document,
            fetchedDetail ?? cachedDetail(payload),
            this.scope,
          );
          // A changed summary whose detail fetch failed is still persisted from
          // the older cache; keep the previous fingerprint so the next run
          // retries enrichment instead of treating the fallback as fresh.
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
          httpStatus: error instanceof AutoheroRequestError ? error.status : undefined,
          requestParameters: { page: request.page, sortOrder: request.sortOrder },
        });
        if (attempt < this.source.requestPolicy.maximumAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(15_000, 750 * 2 ** (attempt - 1))),
          );
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Autohero-importen misslyckades.");
  }

  async discoverCurrentMaximumPrice(
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    // Autohero has no usable price sort; the single result set is never split
    // (see `maximumResultsPerPartition`), so the exact catalogue maximum is not
    // needed — the initial partition is unbounded on price regardless. Page one
    // gives a sensible non-zero floor.
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
    throw new Error("Autoheros fullständiga resultatuppsättning ska inte delas.");
  }
}
