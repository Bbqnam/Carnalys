import type {
  MarketplaceImportChunk,
  MarketplaceImporter,
} from "@/application/ingestion/types";
import { BlocketUnofficialClient } from "./client";
import { normalizeBlocketListing } from "./normalizer";
import { parseBlocketSearchResponse } from "./parser";

const requestIntervalMs = 300;
const maximumResultsPerPartition = 2_450;
const maximumRequestAttempts = 7;

interface SearchPartition {
  yearFrom: number;
  yearTo: number;
  priceFrom: number;
  priceTo: number;
  /** Keeps the highest partition open so newly listed cars cannot exceed a fixed ceiling. */
  unboundedPriceTo?: boolean;
  mileageFrom: number;
  mileageTo: number;
}

function midpoint(from: number, to: number) {
  return from + Math.floor((to - from) / 2);
}

function splitPartition(partition: SearchPartition): readonly SearchPartition[] {
  if (partition.yearFrom < partition.yearTo) {
    const middle = midpoint(partition.yearFrom, partition.yearTo);
    return [
      { ...partition, yearTo: middle },
      { ...partition, yearFrom: middle + 1 },
    ];
  }

  if (partition.priceFrom < partition.priceTo) {
    const middle = midpoint(partition.priceFrom, partition.priceTo);
    return [
      { ...partition, priceTo: middle, unboundedPriceTo: false },
      { ...partition, priceFrom: middle + 1 },
    ];
  }

  if (partition.mileageFrom < partition.mileageTo) {
    const middle = midpoint(partition.mileageFrom, partition.mileageTo);
    return [
      { ...partition, mileageTo: middle },
      { ...partition, mileageFrom: middle + 1 },
    ];
  }

  throw new Error(
    `Kunde inte dela en överfull sökpartition (${partition.yearFrom}, ${partition.priceFrom} kr, ${partition.mileageFrom} mil).`,
  );
}

export class BlocketUnofficialImporter implements MarketplaceImporter {
  readonly provider = "blocket_unofficial";
  readonly scope: string;
  private lastRequestAt = 0;
  private readonly query: string;

  constructor(private readonly client = new BlocketUnofficialClient()) {
    this.query = process.env.BLOCKET_IMPORT_QUERY?.trim() ?? "";
    this.scope = this.query || "all-cars";
  }

  private async search(
    partition: SearchPartition | undefined,
    page: number,
    sortOrder: "PUBLISHED_ASC" | "PRICE_DESC" = "PUBLISHED_ASC",
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumRequestAttempts; attempt += 1) {
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < requestIntervalMs) {
        await new Promise((resolve) => setTimeout(resolve, requestIntervalMs - elapsed));
      }

      try {
        const payload = await this.client.searchCars({
          query: this.query,
          page,
          sortOrder,
          ...(partition
            ? {
                yearFrom: partition.yearFrom,
                yearTo: partition.yearTo,
                priceFrom: partition.priceFrom,
                priceTo: partition.unboundedPriceTo ? undefined : partition.priceTo,
                mileageFrom: partition.mileageFrom,
                mileageTo: partition.mileageTo,
              }
            : {}),
        });
        this.lastRequestAt = Date.now();
        return parseBlocketSearchResponse(payload);
      } catch (error) {
        lastError = error;
        this.lastRequestAt = Date.now();
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

  private normalizeChunk(
    parsed: ReturnType<typeof parseBlocketSearchResponse>,
  ): MarketplaceImportChunk {
    return {
      listings: parsed.documents.map((document) =>
        normalizeBlocketListing(document, undefined, this.scope),
      ),
      rejectedCount: parsed.rejectedCount,
    };
  }

  private async *importPartition(
    partition: SearchPartition,
  ): AsyncGenerator<MarketplaceImportChunk> {
    const firstPage = await this.search(partition, 1);

    if (firstPage.totalMatches > maximumResultsPerPartition) {
      for (const child of splitPartition(partition)) {
        yield* this.importPartition(child);
      }
      return;
    }

    if (firstPage.documents.length > 0) yield this.normalizeChunk(firstPage);

    for (let page = 2; page <= firstPage.lastPage; page += 1) {
      const parsed = await this.search(partition, page);
      if (parsed.documents.length > 0) yield this.normalizeChunk(parsed);
    }
  }

  private async discoverCurrentMaximumPrice() {
    const highestPricedPage = await this.search(undefined, 1, "PRICE_DESC");
    return highestPricedPage.documents.reduce(
      (maximum, listing) => Math.max(maximum, listing.priceAmount),
      0,
    );
  }

  async *import(): AsyncGenerator<MarketplaceImportChunk> {
    const currentYear = new Date().getUTCFullYear();
    const currentMaximumPrice = await this.discoverCurrentMaximumPrice();
    yield* this.importPartition({
      yearFrom: 1886,
      yearTo: currentYear + 2,
      priceFrom: 0,
      priceTo: currentMaximumPrice,
      unboundedPriceTo: true,
      mileageFrom: 0,
      mileageTo: 1_000_000,
    });
  }
}
