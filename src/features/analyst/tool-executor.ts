import "server-only";

import { defaultSearchFilters } from "@/features/search/search-state";
import type { SearchFilters } from "@/features/search/types";
import {
  analyseListingMarketEvidence,
  compareListingsEvidence,
  getListingAnalysisEvidence,
  searchInventoryEvidence,
} from "./repository";
import type { AnalystContext, AnalystToolResult } from "./types";
import { AnalystValidationError, validateToolArguments } from "./validation";
import { withAbortAndTimeout } from "./async-control";

export interface ToolExecutionOptions {
  context: AnalystContext;
  signal: AbortSignal;
  timeoutMs?: number;
}

function hasSearchValue<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
  const fallback = defaultSearchFilters[key];
  return Array.isArray(value) ? value.length > 0 : value !== fallback;
}

export function mergeTrustedSearchFilters(trusted: SearchFilters, requested: SearchFilters): SearchFilters {
  const result = { ...trusted } as SearchFilters;
  for (const key of Object.keys(requested) as (keyof SearchFilters)[]) {
    if (hasSearchValue(key, requested[key])) {
      Object.assign(result, { [key]: requested[key] });
    }
  }
  return result;
}

export class AnalystToolSession {
  private readonly allowedListingIds = new Set<string>();
  private readonly detailedListingIds = new Set<string>();

  constructor(private readonly options: ToolExecutionOptions) {
    if (options.context.surface === "listing") this.allowedListingIds.add(options.context.listingId);
    if (options.context.surface === "comparison") {
      options.context.listingIds.forEach((id) => this.allowedListingIds.add(id));
    }
  }

  private assertAllowed(listingId: string) {
    if (!this.allowedListingIds.has(listingId)) {
      throw new AnalystValidationError("The requested listing is outside this Analyst session.");
    }
  }

  private registerDetail(listingId: string) {
    this.assertAllowed(listingId);
    this.detailedListingIds.add(listingId);
    if (this.detailedListingIds.size > 5) {
      throw new AnalystValidationError("At most five detailed finalists may be inspected.");
    }
  }

  async execute(name: string, rawArguments: unknown): Promise<AnalystToolResult> {
    const call = validateToolArguments(name, rawArguments);
    const timeoutMs = this.options.timeoutMs ?? 10_000;
    let work: Promise<AnalystToolResult>;
    if (call.name === "get_listing_analysis") {
      this.registerDetail(call.arguments.listingId);
      work = getListingAnalysisEvidence(call.arguments.listingId, call.arguments.includeDescription);
    } else if (call.name === "analyse_listing_market") {
      this.registerDetail(call.arguments.listingId);
      work = analyseListingMarketEvidence(call.arguments.listingId);
    } else if (call.name === "compare_listings") {
      call.arguments.listingIds.forEach((id) => this.registerDetail(id));
      work = compareListingsEvidence(call.arguments.listingIds);
    } else {
      call.arguments.finalistIds.forEach((id) => this.registerDetail(id));
      const filters = this.options.context.surface === "search"
        ? mergeTrustedSearchFilters(this.options.context.filters, call.arguments.filters)
        : call.arguments.filters;
      work = searchInventoryEvidence(filters, call.arguments.finalistIds, call.arguments.excludeCommercialBodyStyles);
    }
    const result = await withAbortAndTimeout(work, this.options.signal, timeoutMs);
    if (call.name === "search_inventory") {
      const data = result.data as { candidates?: readonly { listingId?: unknown }[] };
      data.candidates?.forEach((candidate) => {
        if (typeof candidate.listingId === "string") this.allowedListingIds.add(candidate.listingId);
      });
    }
    return result;
  }
}
