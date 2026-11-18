import type { VehicleSearchPartition } from "@/application/ingestion/types";
export class BytbilRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly url?: string) {
    super(message);
    this.name = "BytbilRequestError";
  }
}

/**
 * Bytbil serves no public JSON API and no Schema.org vehicle data — the ad
 * pages are server-rendered HTML with an embedded analytics `dataLayer`
 * object. robots.txt disallows `/api/` and `/car/` (the English alias) but
 * permits `/bil` and the localized `/{lan}/personbil-…` detail pages, which
 * is all this client requests.
 */
export class BytbilClient {
  constructor(private readonly baseUrl = "https://www.bytbil.com") {}

  private async html(path: string) {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sv-SE,sv;q=0.9",
        "User-Agent": "CarnalysDevelopmentImporter/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      throw new BytbilRequestError(
        `Bytbil svarade med HTTP ${response.status}.`,
        response.status,
        url.toString(),
      );
    }
    return response.text();
  }

  search(page: number, order: "published" | "priceDesc", partition?: VehicleSearchPartition) {
    const params = new URLSearchParams({ Page: String(Math.max(1, page)) });
    params.set("SortParams.SortField", order === "priceDesc" ? "price_value" : "publishedDate");
    params.set("SortParams.IsAscending", "false");
    if (partition) {
      params.set("ModelYearRange.From", String(partition.yearFrom));
      params.set("ModelYearRange.To", String(partition.yearTo));
      params.set("PriceRange.From", String(partition.priceFrom));
      if (!partition.unboundedPriceTo) params.set("PriceRange.To", String(partition.priceTo));
      params.set("MilageRange.From", String(partition.mileageFrom));
      params.set("MilageRange.To", String(partition.mileageTo));
    }
    return this.html(`/bil?${params}`);
  }

  detail(detailPath: string) {
    return this.html(detailPath.startsWith("/") ? detailPath : `/${detailPath}`);
  }
}
