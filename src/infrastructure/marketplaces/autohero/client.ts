export class AutoheroRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly url?: string) {
    super(message);
    this.name = "AutoheroRequestError";
  }
}

const SEARCH_QUERY =
  "query searchAdV9AdsV2($search: EsSearchRequestProjectionInput!, $tradeInId: UUID) { searchAdV9AdsV2(search: $search, tradeInId: $tradeInId) }";

/** Sort keys the customer gateway actually accepts. It rejects every price
 *  sort, so ingestion only ever asks for newest-first. */
export type AutoheroSort = "newest_eligible" | "most_popular";

/**
 * Autohero's storefront (`www.autohero.com/se`). Search is a plain GraphQL POST
 * to the public customer gateway; detail pages are HTML that embed the resolved
 * `getCarDetailsStoreAd` result in `window.__APOLLO_STATE__`.
 */
export class AutoheroClient {
  constructor(private readonly baseUrl = "https://www.autohero.com") {}

  private headers(extra: Record<string, string> = {}) {
    return {
      "Accept-Language": "sv-SE,sv;q=0.9",
      "User-Agent": "CarnalysDevelopmentImporter/1.0",
      ...extra,
    };
  }

  /** One offset-paginated result set (24 cars/page), filtered to Sweden. */
  async search(page: number, sort: AutoheroSort, hitsPerPage = 24): Promise<string> {
    const offset = Math.max(0, page - 1) * hitsPerPage;
    const url = new URL("/v1/retail-customer-gateway/graphql", this.baseUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: this.baseUrl,
        Referer: `${this.baseUrl}/se/search/`,
      }),
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          search: {
            filter: { field: "countryCode", op: "eq", value: "SE" },
            sort,
            limit: hitsPerPage,
            offset,
          },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      throw new AutoheroRequestError(
        `Autohero svarade med HTTP ${response.status}.`,
        response.status,
        url.toString(),
      );
    }
    return response.text();
  }

  async detail(slug: string, id: string): Promise<string> {
    const url = new URL(
      `/se/${encodeURIComponent(slug)}/id/${encodeURIComponent(id)}/`,
      this.baseUrl,
    );
    const response = await fetch(url, {
      headers: this.headers({ Accept: "text/html,application/xhtml+xml" }),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new AutoheroRequestError(
        `Autohero svarade med HTTP ${response.status}.`,
        response.status,
        url.toString(),
      );
    }
    return response.text();
  }
}
