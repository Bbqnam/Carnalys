// Blocket's own listing page always renders a "Specifikationer" section as
// <dt>Label</dt><dd>Value</dd> pairs (Effekt, Motorvolym, Drivhjul, ...) —
// the same field names the unofficial API's `specifications` object uses
// when it happens to provide one, so this can slot into the exact same
// normalizer code path. Regex-based rather than a full HTML parser since
// only this one well-known, stable structure needs extracting.
const specificationsSectionPattern =
  /<h2[^>]*>\s*Specifikationer\s*<\/h2>\s*<dl[^>]*>([\s\S]*?)<\/dl>/;
const entryPattern = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
const blocketImageUrlPattern =
  /https:\/\/images\.blocketcdn\.se\/dynamic\/[^\s"'<>\\]+/g;

const namedEntities: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|nbsp|quot|apos|lt|gt);/g, (_, name: string) => namedEntities[name]);
}

function stripTagsAndDecode(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

export function parseListingPageSpecifications(html: string): Record<string, string> {
  const sectionMatch = specificationsSectionPattern.exec(html);
  if (!sectionMatch) return {};

  const specifications: Record<string, string> = {};
  entryPattern.lastIndex = 0;
  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryPattern.exec(sectionMatch[1])) !== null) {
    const label = stripTagsAndDecode(entryMatch[1]);
    const value = stripTagsAndDecode(entryMatch[2]);
    if (label && value) specifications[label] = value;
  }
  return specifications;
}

/**
 * Extracts the listing's own gallery from Blocket's server-rendered page.
 *
 * The search feed occasionally exposes a newly-published ad before its
 * `image_urls` field has caught up, while the public page already contains
 * the complete gallery. Restricting matches to this listing's item path
 * avoids accidentally importing recommendation-card photos from the same
 * HTML document. Query parameters are dropped so the normal image loader can
 * request its own responsive width without producing two sizing queries.
 */
export function parseListingPageImageUrls(html: string, externalId: string): readonly string[] {
  const expectedPath = `/item/${encodeURIComponent(externalId)}/`;
  const imageUrls = new Set<string>();

  blocketImageUrlPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = blocketImageUrlPattern.exec(html)) !== null) {
    try {
      const url = new URL(decodeHtmlEntities(match[0]));
      if (
        url.hostname !== "images.blocketcdn.se" ||
        !url.pathname.includes(expectedPath)
      ) {
        continue;
      }
      imageUrls.add(`${url.origin}${url.pathname}`);
    } catch {
      // Ignore malformed source URLs and keep scanning the rest of the page.
    }
  }

  return [...imageUrls];
}

/** Read only the seller's description, excluding surrounding page content. */
export function parseListingPageDescription(html: string): string | undefined {
  const heading = /<h2\b[^>]*>\s*Beskrivning\s*<\/h2>/i.exec(html);
  if (!heading) return undefined;
  const section = html.slice(heading.index + heading[0].length).split(/<\/section>/i)[0];
  const content = /<div\b[^>]*class=["'][^"']*\b(?:import-decoration|whitespace-pre-wrap)\b[^"']*["'][^>]*>/i.exec(section);
  if (!content) return undefined;
  const start = content.index + content[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  let end = section.length;
  for (let tag = tags.exec(section); tag; tag = tags.exec(section)) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (depth === 0) { end = tag.index; break; }
  }
  const text = decodeHtmlEntities(section.slice(start, end)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, ""))
    .replace(/\r\n?/g, "\n")
    .split("\n").map((line) => line.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  return text || undefined;
}
