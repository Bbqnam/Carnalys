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
import { parseBlocketSearchResponse } from "./parser";

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

export class BlocketUnofficialImporter implements MarketplaceImporter {
  readonly provider = "blocket_unofficial";
  readonly scope: string;
  readonly maximumResultsPerPartition = 2_450;
  private lastRequestAt = 0;
  private readonly query: string;

  constructor(private readonly client = new BlocketUnofficialClient()) {
    this.query = process.env.BLOCKET_IMPORT_QUERY?.trim() ?? "";
    this.scope = this.query || "all-cars";
  }

  async fetchPage(
    request: MarketplacePageRequest,
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumRequestAttempts; attempt += 1) {
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < requestIntervalMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, requestIntervalMs - elapsed),
        );
      }

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

        return {
          listings: parsed.documents.map((document) =>
            normalizeBlocketListing(document, undefined, this.scope),
          ),
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
