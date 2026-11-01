# Host availability and similar cars

“Liknande bilar till salu” is shopping discovery, separate from valuation
evidence. Its budget window is ±20% of the viewed asking price; that price is
never a challenger valuation feature. Candidates match body/fuel/transmission,
prefer nearby age, mileage and power, exclude the viewed physical vehicle, and
deduplicate syndicated adverts.

The detail page fetches suggestions independently after its main content loads.
Only a requested original-host advert with identifiable vehicle data and a
current asking price can be confirmed. The price is read again from storage
and checked against the budget before display. A positive host check is reused
for at most five minutes; visible recommendation sections refresh when their
evidence expires, including after returning to a backgrounded tab. The UI shows
the check time and source link. A car can sell after a check; no system without
a transactional reservation feed can guarantee it remains purchasable.

## State handling

| Host result | Carnalys action |
| --- | --- |
| Identified advert/current price | Stamp host confirmation and price time; update a changed asking price with a price-change observation; mark analysis dirty |
| 404/410, explicit sold/unpublished state or main offer out of stock | Mark removed, record disappearance, hand representative flag to an active sibling |
| Explicit reservation | Mark reserved; hide from recommendations and active results |
| 403/429, access challenge, timeout, parse failure, different advert or generic redirect | Record inconclusive; omit from recommendations; never infer a sale |

HTTP 200 alone and an unofficial proxy's cached response cannot prove current
host availability. Navigation, “recently sold” rails and recommendations on a
page are not sold signals for its main advert. Requests allow only the five
known HTTPS source hosts and listing paths; off-host redirects are not followed.

## Old catalogue adverts

Ordinary catalogue results require an ingestion observation or positive host
confirmation within seven days. This is an operational freshness budget, not
a statement that older cars sold. Old unverified ads are hidden while their
history remains. A verified live three-month-old ad can still be recommended.
Existing catalogue cache lifetimes bound removal propagation; recommendation
responses use no-store and re-read active state after verification.

## Verification worker

`npm run data:availability -- --source=bytbil --limit=500` is read-only with
respect to the database. `npm run data:availability:write -- --source=bytbil
--limit=500` persists evidence and retires confirmed removals. Sources are
blocket_unofficial, wayke, bytbil, hedin and autohero. An omitted source runs
all five. Limits are bounded; oldest checks rotate first. 403/429 stop further
requests to that source in the batch. The job does not bypass access controls.

The nightly workflow keeps its existing Blocket removal sweep and adds a bounded
500-ad verification batch per other source. This is incremental coverage, not
a promise to recheck the entire inventory every day. On-demand verification
protects recommendations and catalogue expiry protects old unverified records.
Increase worker throughput only after measuring source limits and runtime.

We remove ads from Carnalys' active inventory; we cannot delete advertisements
from the independently operated host sites. Source blocks may legitimately
produce an empty recommendations section rather than an invented availability
claim.
