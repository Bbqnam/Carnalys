import {
  classifyBlocketAvailability,
  type BlocketAvailability,
  type BlocketAvailabilityVerdict,
} from "./availability";

export type { BlocketAvailability, BlocketAvailabilityVerdict } from "./availability";

const defaultBaseUrl = "https://blocket-api.se";

export type BlocketSortOrder =
  | "PUBLISHED_ASC"
  | "PUBLISHED_DESC"
  | "PRICE_DESC";

export interface BlocketCarSearchParameters {
  query?: string;
  page?: number;
  sortOrder?: BlocketSortOrder;
  yearFrom?: number;
  yearTo?: number;
  priceFrom?: number;
  priceTo?: number;
  mileageFrom?: number;
  mileageTo?: number;
}

export class BlocketRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = "BlocketRequestError";
  }
}

export class BlocketUnofficialClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl = process.env.BLOCKET_UNOFFICIAL_API_URL ?? defaultBaseUrl,
    fetchImpl?: typeof fetch,
  ) {
    // Bound so a bare global `fetch` keeps its receiver, and so tests can
    // inject a stub for timeout / rate-limit / server-failure cases.
    this.fetchImpl = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  private async fetchJson(path: string) {
    const response = await this.fetchImpl(new URL(path, this.baseUrl), {
      headers: {
        Accept: "application/json",
        "User-Agent": "CarnalysDevelopmentImporter/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 300).replace(/\s+/g, " ");
      throw new BlocketRequestError(
        `Blocket-importen svarade med HTTP ${response.status}${
          responseBody ? `: ${responseBody}` : "."
        }`,
        response.status,
        path,
      );
    }

    return response.json() as Promise<unknown>;
  }

  searchCars({
    query,
    page = 1,
    sortOrder = "PUBLISHED_ASC",
    yearFrom,
    yearTo,
    priceFrom,
    priceTo,
    mileageFrom,
    mileageTo,
  }: BlocketCarSearchParameters) {
    const params = new URLSearchParams({
      page: page.toString(),
      sort_order: sortOrder,
    });
    if (query?.trim()) params.set("query", query.trim());
    if (yearFrom !== undefined) params.set("year_from", yearFrom.toString());
    if (yearTo !== undefined) params.set("year_to", yearTo.toString());
    if (priceFrom !== undefined) params.set("price_from", priceFrom.toString());
    if (priceTo !== undefined) params.set("price_to", priceTo.toString());
    if (mileageFrom !== undefined) params.set("milage_from", mileageFrom.toString());
    if (mileageTo !== undefined) params.set("milage_to", mileageTo.toString());
    return this.fetchJson(`/v1/search/car?${params}`);
  }

  getCar(id: string) {
    return this.fetchJson(`/v1/ad/car?id=${encodeURIComponent(id)}`);
  }

  // The unofficial API's detail endpoint omits the "Specifikationer" block
  // (horsepower, engine, drivetrain, etc.) for most listings even though
  // Blocket's own listing page always shows it — fetched directly as a
  // fallback when that happens. See listing-page-parser.ts for the scrape.
  async checkCarAvailability(id: string): Promise<BlocketAvailability> {
    return (await this.inspectCarAvailability(id)).availability;
  }

  /**
   * Fetches the advert once and classifies it from the HTTP status *and* the
   * response body. A 2xx is never enough on its own — the unofficial proxy
   * returns HTTP 200 with `{"error":"Client error '404 Not Found' ..."}` for
   * deleted adverts — so only a body carrying advert data for this id counts
   * as "active". Anything ambiguous is "inconclusive", never "active".
   */
  async inspectCarAvailability(
    id: string,
  ): Promise<BlocketAvailabilityVerdict & { status: number | null }> {
    let status: number | null = null;
    let bodyText: string | null = null;
    try {
      const response = await this.fetchImpl(
        new URL(`/v1/ad/car?id=${encodeURIComponent(id)}`, this.baseUrl),
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "CarnalysDevelopmentImporter/1.0",
          },
          signal: AbortSignal.timeout(15_000),
        },
      );
      status = response.status;
      try {
        bodyText = await response.text();
      } catch {
        bodyText = null;
      }
    } catch {
      return { ...classifyBlocketAvailability({ requestedId: id, status: null, bodyText: null, transportFailed: true }), status: null };
    }
    return { ...classifyBlocketAvailability({ requestedId: id, status, bodyText }), status };
  }
  async getListingPageHtml(url: string) {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "CarnalysDevelopmentImporter/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new BlocketRequestError(
        `Blocket-annonssidan svarade med HTTP ${response.status}.`,
        response.status,
        url,
      );
    }

    return response.text();
  }
}
