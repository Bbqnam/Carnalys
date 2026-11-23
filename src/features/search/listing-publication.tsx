import { uiCopy, type Locale } from "./copy";
import { formatListingPublication } from "./format";

interface ListingPublicationProps {
  publishedAt?: string;
  provider: string;
  locale: Locale;
}

export function ListingPublication({ publishedAt, provider, locale }: ListingPublicationProps) {
  const copy = uiCopy[locale].card;
  const publication = formatListingPublication(publishedAt, provider, locale);

  if (!publication) return <span>{copy.postingTimeUnavailable}</span>;

  const { dateTime, age, estimatedRenewal } = publication;
  return (
    <time dateTime={dateTime} suppressHydrationWarning>
      {estimatedRenewal ? `${copy.estimatedRenewal} · ${age}` : age}
    </time>
  );
}
