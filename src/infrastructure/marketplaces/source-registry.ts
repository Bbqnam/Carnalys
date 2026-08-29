import type { MarketplaceSourceDefinition } from "@/application/ingestion/types";

export const listingSources = {
  blocket_unofficial: {
    key: "blocket_unofficial",
    displayName: "Blocket",
    type: "marketplace",
    logoKey: "blocket",
    capabilities: {
      discovery: "page",
      details: true,
      equipment: true,
      images: true,
      removalDetection: true,
    },
    requestPolicy: { minimumIntervalMs: 120, maximumAttempts: 7 },
  },
  wayke: {
    key: "wayke",
    displayName: "Wayke",
    type: "marketplace",
    logoKey: "wayke",
    capabilities: {
      discovery: "offset",
      details: true,
      equipment: true,
      images: true,
      removalDetection: true,
    },
    requestPolicy: { minimumIntervalMs: 500, maximumAttempts: 5 },
  },
  bytbil: {
    key: "bytbil",
    displayName: "Bytbil",
    type: "marketplace",
    logoKey: "bytbil",
    capabilities: {
      discovery: "page",
      details: true,
      equipment: true,
      images: true,
      removalDetection: true,
    },
    requestPolicy: { minimumIntervalMs: 700, maximumAttempts: 5 },
  },
  hedin: {
    key: "hedin",
    displayName: "Hedin",
    type: "dealer",
    logoKey: "hedin",
    capabilities: {
      discovery: "page",
      details: true,
      equipment: true,
      images: true,
      removalDetection: true,
    },
    requestPolicy: { minimumIntervalMs: 800, maximumAttempts: 5 },
  },
} as const satisfies Record<string, MarketplaceSourceDefinition>;

export type ListingSourceKey = keyof typeof listingSources;

export function listingSource(provider: string): MarketplaceSourceDefinition {
  return (
    listingSources[provider as ListingSourceKey] ?? {
      key: provider,
      displayName: provider,
      type: "marketplace",
      capabilities: {
        discovery: "page",
        details: false,
        equipment: false,
        images: true,
        removalDetection: false,
      },
      requestPolicy: { minimumIntervalMs: 1_000, maximumAttempts: 3 },
    }
  );
}
