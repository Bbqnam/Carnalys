export class WaykeRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly url?: string) {
    super(message);
    this.name = "WaykeRequestError";
  }
}

export class WaykeClient {
  constructor(private readonly baseUrl = "https://www.wayke.se") {}

  private async html(path: string) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "CarnalysDevelopmentImporter/1.0",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      throw new WaykeRequestError(`Wayke svarade med HTTP ${response.status}.`, response.status, url.toString());
    }
    return response.text();
  }

  search(page: number, sort: "itemSortDesc" | "priceDefaultDesc") {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (sort === "priceDefaultDesc") params.set("sort", "price-desc");
    return this.html(params.size ? `/sok?${params}` : "/sok");
  }

  detail(externalId: string) {
    return this.html(`/objekt/${encodeURIComponent(externalId)}`);
  }
}
