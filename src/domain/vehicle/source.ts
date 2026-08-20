import type { ISODateTime } from "./types";

export type SourceType = "marketplace" | "dealer" | "feed" | "api";

/** Provenance retained when an external listing is normalized. */
export interface SourceMetadata {
  /** Stable internal adapter key; for example, `marketplace-a`. */
  provider: string;
  type: SourceType;
  externalId: string;
  url: string;
  firstSeenAt: ISODateTime;
  lastSeenAt: ISODateTime;
}
