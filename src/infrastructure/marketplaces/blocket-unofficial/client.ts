const defaultBaseUrl = "https://blocket-api.se";

export class BlocketUnofficialClient {
  constructor(private readonly baseUrl = process.env.BLOCKET_UNOFFICIAL_API_URL ?? defaultBaseUrl) {}

  private async fetchJson(path: string) {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers: {
        Accept: "application/json",
        "User-Agent": "CarFinderDevelopmentImporter/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Blocket-importen svarade med HTTP ${response.status}.`);
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
  }: {
    query?: string;
    page?: number;
    sortOrder?: "PUBLISHED_ASC" | "PRICE_DESC";
    yearFrom?: number;
    yearTo?: number;
    priceFrom?: number;
    priceTo?: number;
    mileageFrom?: number;
    mileageTo?: number;
  }) {
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
}
