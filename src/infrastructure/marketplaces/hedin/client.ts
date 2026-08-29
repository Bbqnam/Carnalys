export class HedinRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly url?: string) {
    super(message);
    this.name = "HedinRequestError";
  }
}

/**
 * Hedin Automotive's public site (Next.js + Sitecore). Both the used-car
 * listing page and every `/bilar/kop-bil/{id}/{slug}` detail page embed the
 * data in `__NEXT_DATA__`; detail pages also carry a Schema.org Car block.
 * robots.txt publishes `car_0.xml` / `car_1.xml` (every car URL) and does not
 * disallow the listing or detail paths this client requests.
 */
export class HedinClient {
  constructor(private readonly baseUrl = "https://hedinautomotive.se") {}

  private async html(path: string) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sv-SE,sv;q=0.9",
        "User-Agent": "CarnalysDevelopmentImporter/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new HedinRequestError(
        `Hedin svarade med HTTP ${response.status}.`,
        response.status,
        url.toString(),
      );
    }
    return response.text();
  }

  /**
   * The listing page hydrates a cumulative, newest-first result set: `?page=N`
   * returns the newest 48·(N+1) cars. The importer slices its own 48-car window
   * out of that.
   */
  search(page: number) {
    const params = new URLSearchParams({ page: String(Math.max(1, page)) });
    return this.html(`/bilar/kop-bil/begagnade-bilar-i-lager?${params}`);
  }

  detail(detailPath: string) {
    return this.html(detailPath.startsWith("/") ? detailPath : `/${detailPath}`);
  }
}
