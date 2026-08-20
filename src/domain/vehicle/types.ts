/** An ISO 8601 calendar date (`YYYY-MM-DD`). */
export type ISODate = string;

/** An ISO 8601 timestamp including a time-zone offset. */
export type ISODateTime = string;

export type VehicleId = string;
export type ListingId = string;

/** ISO 4217 currency code. Carnalysis currently expects `SEK`. */
export type CurrencyCode = "SEK";

export interface Money {
  /** Amount in the currency's major unit; for example, Swedish kronor. */
  amount: number;
  currency: CurrencyCode;
}
