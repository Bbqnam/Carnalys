// Classifies whether a Blocket advert is still live from a single call to the
// unofficial `blocket-api.se` proxy.
//
// The proxy is not a faithful mirror of Blocket's own status codes: a deleted
// advert comes back as an OUTER HTTP 200 whose JSON body carries the upstream
// failure, e.g.
//
//   {"error":"Client error '404 Not Found' for url
//     'https://www.blocket.se/mobility/item/1'"}
//
// so status alone can never prove an advert is active. This function inspects
// the status *and* the body and only reports "active" when the payload
// actually contains advert data for the requested id.

export type BlocketAvailability = "active" | "missing" | "inconclusive";

/**
 * How a listing was found to be gone. `deactivated` is the strongest signal
 * Blocket gives short of official transfer data — the ad page still loads but
 * its body is replaced with "Den här annonsen är inte längre tillgänglig.
 * Varan har sålts eller tagits bort från marknaden." `purged` is the later
 * hard 404. `unknown` covers the unofficial proxy's 404 error body, which does
 * not say which of the two it is.
 */
export type BlocketMissingKind = "deactivated" | "purged" | "unknown";

export interface BlocketListingPageVerdict {
  availability: BlocketAvailability;
  missingKind: BlocketMissingKind | null;
  reason: string;
}

// Blocket's deactivated-ad notice. Distinctive to a `variant="negative"` alert
// on the ad page — not the stray "såld" / "410" strings that also appear in
// nav, "recently sold" rails and analytics on perfectly live pages.
const PAGE_DEACTIVATED =
  /annonsen är inte längre tillgänglig|varan har sålts eller tagits bort|har sålts eller tagits bort från marknaden/i;
const PAGE_NOT_FOUND = /sidan (?:kunde inte hittas|hittades inte|kunde inte hämtas)|hittade inte sidan/i;

/**
 * Classifies the REAL Blocket ad page (blocket.se/mobility/item/<id>), which
 * the unofficial proxy cannot see: the proxy keeps serving cached car data for
 * a deactivated ad. `html` is the raw markup; `status` its HTTP status.
 */
export function classifyBlocketListingPage(
  status: number | null,
  html: string | null,
  transportFailed = false,
): BlocketListingPageVerdict {
  if (transportFailed) {
    return { availability: "inconclusive", missingKind: null, reason: "The ad page request failed before a response." };
  }
  if (status == null) {
    return { availability: "inconclusive", missingKind: null, reason: "No response from the ad page." };
  }
  if (status === 404 || status === 410) {
    return { availability: "missing", missingKind: "purged", reason: `The ad page returned HTTP ${status}.` };
  }
  if (status === 429 || status === 408 || status >= 500) {
    return { availability: "inconclusive", missingKind: null, reason: `The ad page returned HTTP ${status}.` };
  }
  if (status < 200 || status >= 300) {
    return { availability: "inconclusive", missingKind: null, reason: `The ad page returned HTTP ${status}.` };
  }
  if (!html || html.length < 200) {
    return { availability: "inconclusive", missingKind: null, reason: "The ad page body was empty or truncated." };
  }
  if (PAGE_DEACTIVATED.test(html)) {
    return {
      availability: "missing",
      missingKind: "deactivated",
      reason: 'The ad page shows "annonsen är inte längre tillgänglig — varan har sålts eller tagits bort".',
    };
  }
  if (PAGE_NOT_FOUND.test(html)) {
    return { availability: "missing", missingKind: "purged", reason: "The ad page rendered a not-found page." };
  }
  return { availability: "active", missingKind: null, reason: "The ad page still renders a live listing." };
}

export interface BlocketAvailabilityInput {
  /** The listing id we asked about. */
  requestedId: string;
  /** HTTP status of the proxy response, or null if no response arrived. */
  status: number | null;
  /** Raw response body, or null if it could not be read. */
  bodyText: string | null;
  /** True when the request threw before a response (timeout, DNS, socket). */
  transportFailed?: boolean;
}

export interface BlocketAvailabilityVerdict {
  availability: BlocketAvailability;
  /** Short human-readable explanation, surfaced in diagnostics. */
  reason: string;
}

const UPSTREAM_404 = /(?:client error\s+)?'?\b404\b(?:\s+not\s+found)?'?|not\s+found/i;
const UPSTREAM_410 = /(?:client error\s+)?'?\b410\b(?:\s+gone)?'?|\bgone\b/i;
const REMOVED_WORDING =
  /borttagen|inte längre (?:tillgänglig|aktiv|till salu)|no longer (?:available|active|for sale)|has been (?:removed|deleted)|annonsen (?:är )?(?:borttagen|avpublicerad)|avpublicerad/i;

function verdict(availability: BlocketAvailability, reason: string): BlocketAvailabilityVerdict {
  return { availability, reason };
}

function stringFields(value: Record<string, unknown>): string[] {
  const keys = ["error", "message", "detail", "details", "reason", "status", "title"];
  const out: string[] = [];
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string" && field.trim()) out.push(field);
    else if (Array.isArray(field)) {
      for (const entry of field) {
        if (typeof entry === "string" && entry.trim()) out.push(entry);
        else if (entry && typeof entry === "object") out.push(JSON.stringify(entry));
      }
    } else if (field && typeof field === "object") {
      out.push(JSON.stringify(field));
    }
  }
  return out;
}

function looksLikeAdvert(value: Record<string, unknown>): boolean {
  const identity = value.ad_id ?? value.adId ?? value.id ?? value.url ?? value.title;
  const detail =
    value.price ?? value.model_year ?? value.modelYear ?? value.mileage ?? value.subtitle ?? value.equipment;
  return identity != null && detail != null;
}

export function classifyBlocketAvailability(
  input: BlocketAvailabilityInput,
): BlocketAvailabilityVerdict {
  const { requestedId, status, bodyText, transportFailed } = input;

  if (transportFailed) {
    return verdict("inconclusive", "The request failed before a response (timeout or network error).");
  }
  if (status == null) {
    return verdict("inconclusive", "No HTTP response was received.");
  }

  // The proxy itself reporting the advert gone is the one status we trust.
  if (status === 404 || status === 410) {
    return verdict("missing", `The availability service returned HTTP ${status}.`);
  }
  // Overload, throttling, gateway and validation failures tell us nothing
  // about the advert.
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return verdict("inconclusive", `The availability service returned HTTP ${status}.`);
  }
  if (status === 422) {
    return verdict("inconclusive", "The availability service rejected the identifier (HTTP 422).");
  }
  if (status < 200 || status >= 300) {
    return verdict("inconclusive", `The availability service returned an unexpected HTTP ${status}.`);
  }

  // 2xx: the body has to carry the proof.
  if (bodyText == null || !bodyText.trim()) {
    return verdict("inconclusive", "The availability service returned an empty response body.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return verdict("inconclusive", "The availability response was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return verdict("inconclusive", "The availability response was not a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const messages = stringFields(record);
  const blob = messages.join(" ‖ ");

  if (blob) {
    if (REMOVED_WORDING.test(blob)) {
      return verdict("missing", `The service reports the advert was removed: ${blob.slice(0, 160)}`);
    }
    // "404 Not Found" and "not found" both point at a deleted upstream advert;
    // require the 404/410 shape rather than any stray digits.
    if (/\b410\b|\bgone\b/i.test(blob) && UPSTREAM_410.test(blob)) {
      return verdict("missing", `The upstream Blocket advert returned 410 Gone: ${blob.slice(0, 160)}`);
    }
    if (/\b404\b|not\s+found/i.test(blob) && UPSTREAM_404.test(blob)) {
      return verdict("missing", `The upstream Blocket advert returned 404 Not Found: ${blob.slice(0, 160)}`);
    }
    if (record.error != null || record.detail != null || record.details != null) {
      return verdict("inconclusive", `Unrecognized upstream error: ${blob.slice(0, 160)}`);
    }
  }

  if (!looksLikeAdvert(record)) {
    return verdict("inconclusive", "The response did not contain recognizable advert data.");
  }

  const responseId = record.ad_id ?? record.adId ?? record.id;
  if (
    responseId != null &&
    /^\d+$/.test(requestedId) &&
    String(responseId).replace(/\D/g, "") !== requestedId
  ) {
    return verdict(
      "inconclusive",
      `The response describes advert ${String(responseId)}, not the requested ${requestedId}.`,
    );
  }

  return verdict("active", "The response contained advert data for the requested listing.");
}
