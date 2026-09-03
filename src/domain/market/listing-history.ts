export type ListingHistoryEventKind =
  | "first_seen"
  | "price_change"
  | "mileage_change"
  | "relisted"
  | "seller_change";

export interface PreviousListingMarketState {
  status: string;
  priceAmount: number;
  mileageKm: number;
  sellerName: string | null;
  sellerOrganizationNumber: string | null;
  sellerType: string;
}

export interface IncomingListingMarketState {
  priceAmount: number;
  mileageKm: number;
  sellerName?: string;
  sellerOrganizationNumber?: string;
  sellerType: string;
}

/**
 * Returns every independently meaningful change in one observation. A price
 * and mileage changing in the same source response are two facts, not one
 * precedence-based event. Relisting is retained alongside any state changes
 * first discovered when the ad returned.
 */
export function meaningfulListingEvents(
  previous: PreviousListingMarketState | undefined,
  incoming: IncomingListingMarketState,
): readonly ListingHistoryEventKind[] {
  if (!previous) return ["first_seen"];

  const events: ListingHistoryEventKind[] = [];
  if (previous.status !== "active") events.push("relisted");
  if (previous.priceAmount !== incoming.priceAmount) events.push("price_change");
  if (previous.mileageKm !== incoming.mileageKm) events.push("mileage_change");
  if (
    previous.sellerType !== incoming.sellerType ||
    previous.sellerName !== (incoming.sellerName ?? null) ||
    previous.sellerOrganizationNumber !==
      (incoming.sellerOrganizationNumber ?? null)
  ) {
    events.push("seller_change");
  }
  return events;
}
