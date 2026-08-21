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
import { normalizeBlocketListing } from "./normalizer";
import { parseBlocketDetail, parseBlocketSearchResponse } from "./parser";

const requestIntervalMs = 300;
const maximumRequestAttempts = 7;

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

  /**
   * The search response alone omits body style, engine, drivetrain, and
   * equipment — those only exist on the per-listing detail endpoint. A
   * single failed detail fetch shouldn't drop the whole listing, so this
   * falls back to `undefined` (search-only data) rather than throwing.
   */
  private async fetchDetail(id: string) {
    await this.throttle();
    try {
      const payload = await this.client.getCar(id);
      this.lastRequestAt = Date.now();
      return parseBlocketDetail(payload);
    } catch {
      this.lastRequestAt = Date.now();
      return undefined;
    }
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

        const listings = [];
        for (const document of parsed.documents) {
          const cached = cachedDetailByExternalId.get(document.id);
          const detail = cached
            ? parseBlocketDetail(cached)
            : await this.fetchDetail(document.id);
          listings.push(normalizeBlocketListing(document, detail, this.scope));
        }

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
