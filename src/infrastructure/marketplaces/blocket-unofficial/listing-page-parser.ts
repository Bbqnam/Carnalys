// Blocket's own listing page always renders a "Specifikationer" section as
// <dt>Label</dt><dd>Value</dd> pairs (Effekt, Motorvolym, Drivhjul, ...) —
// the same field names the unofficial API's `specifications` object uses
// when it happens to provide one, so this can slot into the exact same
// normalizer code path. Regex-based rather than a full HTML parser since
// only this one well-known, stable structure needs extracting.
const specificationsSectionPattern =
  /<h2[^>]*>\s*Specifikationer\s*<\/h2>\s*<dl[^>]*>([\s\S]*?)<\/dl>/;
const entryPattern = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;

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
