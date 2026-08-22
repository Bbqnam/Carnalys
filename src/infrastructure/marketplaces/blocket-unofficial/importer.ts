import type {
  MarketplaceImporter,
  MarketplacePageRequest,
  MarketplaceRequestFailure,
  VehicleSearchPartition,
} from "@/application/ingestion/types";
import {
  BlocketRequestError,
  BlocketUnofficialClient,
} from "./client";
import { parseListingPageSpecifications } from "./listing-page-parser";
import { isMissingCriticalSpecifications, normalizeBlocketListing } from "./normalizer";
import { parseBlocketDetail, parseBlocketSearchResponse } from "./parser";
import type { BlocketListingDetail } from "./types";

// Probed directly against the live API (16 concurrent requests, all 200 OK,
// sub-second): it comfortably absorbs far more than the previous 4 lanes /
// 250ms ever sent it, so the pacing here was leaving real headroom on the
// table. Kept below the tested ceiling since this runs sustained, not as a
// one-off burst.
const requestIntervalMs = 120;
// Detail fetches dominate a full reconciliation (one request per never-enriched
// listing), so they run across a small pool of independent lanes instead of
// one sequential connection — each lane still paces itself at
// requestIntervalMs, so this multiplies throughput without bursting requests.
const detailFetchConcurrency = 8;
const maximumRequestAttempts = 7;
// A single transient failure (timeout, rate-limit blip) shouldn't permanently
// mark a listing as "attempted" with no real detail — retry a few times
// before falling back to search-only data.
const maximumDetailAttempts = 3;

function midpoint(from: number, to: number) {
  return from + Math.floor((to - from) / 2);
}

function requestContext(
  query: string,
  request: MarketplacePageRequest,
): MarketplaceRequestFailure["requestParameters"] {
  return {
    query: query || undefined,
    page: request.page,
    sortOrder: request.sortOrder,
    yearFrom: request.partition?.yearFrom,
    yearTo: request.partition?.yearTo,
    priceFrom: request.partition?.priceFrom,
    priceTo: request.partition?.unboundedPriceTo
      ? undefined
      : request.partition?.priceTo,
    mileageFrom: request.partition?.mileageFrom,
    mileageTo: request.partition?.mileageTo,
  };
}

export type KnownListingDetailLookup = (
  provider: string,
  externalIds: readonly string[],
) => Promise<ReadonlyMap<string, unknown>>;

export class BlocketUnofficialImporter implements MarketplaceImporter {
  readonly provider = "blocket_unofficial";
  readonly scope: string;
  readonly maximumResultsPerPartition = 2_450;
  private lastRequestAt = 0;
  private readonly detailLaneLastRequestAt = new Array<number>(detailFetchConcurrency).fill(0);
  private readonly query: string;

  /**
   * Optional: given externalIds already on a fetched page, returns cached
   * raw detail JSON for the ones we've already enriched before. Lets
   * fetchPage re-normalize a known, already-enriched listing from stored
   * data instead of hitting the network for every listing on every page —
   * detail is only fetched live for genuinely new listings, or known ones
   * never successfully enriched (e.g. the pre-existing catalog).
   */
  constructor(
    private readonly client = new BlocketUnofficialClient(),
    private readonly knownDetailLookup?: KnownListingDetailLookup,
  ) {
    this.query = process.env.BLOCKET_IMPORT_QUERY?.trim() ?? "";
    this.scope = this.query || "all-cars";
  }

  private async throttle() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < requestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, requestIntervalMs - elapsed));
    }
  }

  private async paceLane(laneIndex: number) {
    const elapsed = Date.now() - this.detailLaneLastRequestAt[laneIndex];
    if (elapsed < requestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, requestIntervalMs - elapsed));
    }
  }

  /**
   * The search response alone omits body style, engine, drivetrain, and
   * equipment — those only exist on the per-listing detail endpoint. A
   * single failed detail fetch shouldn't drop the whole listing, so this
   * falls back to `undefined` (search-only data) rather than throwing.
   *
   * The unofficial API's detail endpoint itself omits the "Specifikationer"
   * block (horsepower, engine, drivetrain, ...) for most listings even
   * though Blocket's own page always renders it — when that happens, this
   * scrapes that block directly from the listing page as a fallback.
   *
   * Runs on an independent lane (its own pacing clock) so a pool of these
   * can run concurrently — see `fetchDetailsConcurrently`.
   */
  private async fetchDetail(document: { id: string; canonicalUrl: string }, laneIndex: number) {
    for (let attempt = 1; attempt <= maximumDetailAttempts; attempt += 1) {
      await this.paceLane(laneIndex);
      try {
        const payload = await this.client.getCar(document.id);
        this.detailLaneLastRequestAt[laneIndex] = Date.now();
        const detail = parseBlocketDetail(payload);

        if (
          Object.keys(detail.specifications).length === 0 ||
          isMissingCriticalSpecifications(detail.specifications)
        ) {
          await this.paceLane(laneIndex);
          try {
            const html = await this.client.getListingPageHtml(document.canonicalUrl);
            this.detailLaneLastRequestAt[laneIndex] = Date.now();
            const scraped = parseListingPageSpecifications(html);
            if (Object.keys(scraped).length > 0) {
              return { ...detail, specifications: { ...detail.specifications, ...scraped } };
            }
          } catch {
            this.detailLaneLastRequestAt[laneIndex] = Date.now();
          }
        }

        return detail;
      } catch {
        this.detailLaneLastRequestAt[laneIndex] = Date.now();
        if (attempt < maximumDetailAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
        }
      }
    }
    return undefined;
  }

  /**
   * Fetches detail for every given document across a small pool of lanes
   * running in parallel, preserving input order in the result.
   */
  private async fetchDetailsConcurrently(
    documents: readonly { id: string; canonicalUrl: string }[],
  ): Promise<(Awaited<ReturnType<BlocketUnofficialImporter["fetchDetail"]>>)[]> {
    const details = new Array<Awaited<ReturnType<BlocketUnofficialImporter["fetchDetail"]>>>(
      documents.length,
    );
    let nextIndex = 0;

    const runLane = async (laneIndex: number) => {
      while (nextIndex < documents.length) {
        const index = nextIndex;
        nextIndex += 1;
        details[index] = await this.fetchDetail(documents[index], laneIndex);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(detailFetchConcurrency, documents.length) }, (_, laneIndex) =>
        runLane(laneIndex),
      ),
    );
    return details;
  }

  async fetchPage(
    request: MarketplacePageRequest,
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumRequestAttempts; attempt += 1) {
      await this.throttle();

      try {
        const partition = request.partition;
        const payload = await this.client.searchCars({
          query: this.query,
          page: request.page,
          sortOrder: request.sortOrder,
          yearFrom: partition?.yearFrom,
          yearTo: partition?.yearTo,
          priceFrom: partition?.priceFrom,
          priceTo: partition?.unboundedPriceTo ? undefined : partition?.priceTo,
          mileageFrom: partition?.mileageFrom,
          mileageTo: partition?.mileageTo,
        });
        this.lastRequestAt = Date.now();
        const parsed = parseBlocketSearchResponse(payload);

        const cachedDetailByExternalId = this.knownDetailLookup
          ? await this.knownDetailLookup(
              this.provider,
              parsed.documents.map((document) => document.id),
            )
          : new Map<string, unknown>();

        // A cached detail payload can itself be missing the "Specifikationer"
        // block (see fetchDetail's HTML-fallback above) — most commonly
        // because it was cached before that fallback existed. Re-parsing here
        // and dropping incomplete entries lets already-cached listings
        // self-heal through the normal sync sweep instead of staying broken
        // forever just because *a* detail payload was once cached for them.
        const parsedCachedByExternalId = new Map<string, BlocketListingDetail>();
        for (const [externalId, rawDetail] of cachedDetailByExternalId) {
          const parsedDetail = parseBlocketDetail(rawDetail);
          if (!isMissingCriticalSpecifications(parsedDetail.specifications)) {
            parsedCachedByExternalId.set(externalId, parsedDetail);
          }
        }

        const uncachedDocuments = parsed.documents.filter(
          (document) => !parsedCachedByExternalId.has(document.id),
        );
        const uncachedDetails = await this.fetchDetailsConcurrently(uncachedDocuments);
        const fetchedDetailById = new Map(
          uncachedDocuments.map((document, index) => [document.id, uncachedDetails[index]]),
        );

        const listings = parsed.documents.map((document) => {
          const detail =
            parsedCachedByExternalId.get(document.id) ?? fetchedDetailById.get(document.id);
          return normalizeBlocketListing(document, detail, this.scope);
        });

        return {
          listings,
          rejectedCount: parsed.rejectedCount,
          totalMatches: parsed.totalMatches,
          currentPage: parsed.currentPage,
          lastPage: parsed.lastPage,
        };
      } catch (error) {
        lastError = error;
        this.lastRequestAt = Date.now();
        await onFailure({
          attempt,
          maximumAttempts: maximumRequestAttempts,
          error,
          httpStatus: error instanceof BlocketRequestError ? error.status : undefined,
          requestParameters: requestContext(this.query, request),
        });

        if (attempt === maximumRequestAttempts) break;
        const retryDelay = Math.min(15_000, 750 * 2 ** (attempt - 1));
        console.warn(
          `Källan svarade fel; nytt försök ${attempt + 1}/${maximumRequestAttempts} om ${retryDelay} ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Blocket-importen misslyckades efter flera försök.");
  }

  async discoverCurrentMaximumPrice(
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    const highestPricedPage = await this.fetchPage(
      { page: 1, sortOrder: "PRICE_DESC" },
      onFailure,
    );
    return highestPricedPage.listings.reduce(
      (maximum, listing) => Math.max(maximum, listing.listing.priceAmount),
      0,
    );
  }

  initialReconciliationPartition(maximumPrice: number): VehicleSearchPartition {
    const currentYear = new Date().getUTCFullYear();
    return {
      yearFrom: 1900,
      yearTo: currentYear + 1,
      priceFrom: 0,
      priceTo: maximumPrice,
      unboundedPriceTo: true,
      mileageFrom: 0,
      mileageTo: 1_000_000,
    };
  }

  splitPartition(
    partition: VehicleSearchPartition,
  ): readonly VehicleSearchPartition[] {
    if (partition.yearFrom < partition.yearTo) {
      const middle = midpoint(partition.yearFrom, partition.yearTo);
      return [
        { ...partition, yearFrom: middle + 1 },
        { ...partition, yearTo: middle },
      ];
    }

    if (partition.priceFrom < partition.priceTo) {
      const middle = midpoint(partition.priceFrom, partition.priceTo);
      return [
        { ...partition, priceFrom: middle + 1 },
        { ...partition, priceTo: middle, unboundedPriceTo: false },
      ];
    }

    if (partition.mileageFrom < partition.mileageTo) {
      const middle = midpoint(partition.mileageFrom, partition.mileageTo);
      return [
        { ...partition, mileageFrom: middle + 1 },
        { ...partition, mileageTo: middle },
      ];
    }

    throw new Error(
      `Kunde inte dela en överfull sökpartition (${partition.yearFrom}, ${partition.priceFrom} kr, ${partition.mileageFrom} mil).`,
    );
  }
}
