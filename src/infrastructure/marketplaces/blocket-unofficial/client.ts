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
  constructor(private readonly baseUrl = process.env.BLOCKET_UNOFFICIAL_API_URL ?? defaultBaseUrl) {}

  private async fetchJson(path: string) {
    const response = await fetch(new URL(path, this.baseUrl), {
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
  async checkCarAvailability(id: string): Promise<"active" | "missing" | "inconclusive"> {
    try {
      const response = await fetch(
        new URL(`/v1/ad/car?id=${encodeURIComponent(id)}`, this.baseUrl),
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "CarnalysDevelopmentImporter/1.0",
          },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok) return "active";
      if (response.status === 404 || response.status === 410) return "missing";
      return "inconclusive";
    } catch {
      return "inconclusive";
    }
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
