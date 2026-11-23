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

  const { dateTime, age, exactDate } = publication;
  if (!exactDate) {
    return (
      <time dateTime={dateTime} suppressHydrationWarning>
        {copy.estimatedRenewal} · {age}
      </time>
    );
  }

  return (
    <time dateTime={dateTime}>
      {copy.posted} {exactDate} · <span suppressHydrationWarning>{age}</span>
    </time>
  );
}
