/** The one provenance phrasing used by the card mark, the detail page and the
 *  accessible label — "where Carnalys retrieved this ad", never seller wording. */
export function sourceListingLabel(displayName: string, locale: "sv" | "en") {
  return locale === "en"
    ? `Listing from ${displayName}`
    : `Annons från ${displayName}`;
}
