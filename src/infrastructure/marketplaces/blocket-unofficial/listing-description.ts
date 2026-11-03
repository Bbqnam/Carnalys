import { parseListingPageDescription } from "./listing-page-parser";

/** Recover descriptions for older listings without a database backfill. */
export async function getBlocketListingDescription(
  externalId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  if (!/^\d+$/.test(externalId)) return undefined;
  try {
    const response = await fetchImpl(`https://www.blocket.se/mobility/item/${externalId}`, {
      headers: { Accept: "text/html" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return undefined;
    return parseListingPageDescription(await response.text());
  } catch {
    return undefined;
  }
}
