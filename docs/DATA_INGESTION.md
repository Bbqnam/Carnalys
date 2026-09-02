# Vehicle data ingestion

## Sources and isolation

The development adapter uses `blocket-api.se`, an unofficial third-party API
that exposes current Blocket vehicle-search records without credentials. The
browser never contacts it. The application always reads the last durable
database snapshot, so an importer or network failure does not make the catalog
unavailable.

Before commercial production, replace this adapter with a licensed marketplace,
aggregator, dealer, or DMS feed. The source boundary is expressed through the
`MarketplaceImporter` interface so synchronization and storage do not depend
on Blocket response shapes.

`ListingProvider` stores extensible source keys, display names, logo keys,
types, and capabilities. A source is a retrieval origin, not a seller. Every
ad remains unique on `(provider, externalId)` and retains its original URL.
`VehicleRecord` is the physical-identity layer: only exact registration or VIN
evidence merges cross-source listings, with method/confidence stored on the
listing. Similar-looking cars are never silently merged.

Wayke is the second real adapter. It reads the public server-rendered React
Query search payload, then Schema.org Car data or the newer Next
server-component vehicle payload on detail pages. Detail is fetched only for a
new or apparently changed summary; unchanged ads reuse structured cached data.
No HTML or image bytes are stored. Wayke is opt-in only and is not invoked by
Vercel cron, the Blocket watcher, or request-serving code.

## Why the previous pipeline became slow and stale

The original command attempted a roughly 142,000-listing crawl every time. It
started with old partitions and `PUBLISHED_ASC`, so recent ads were discovered
late. Progress lived in the process; a crash left a run marked `running` and
the next attempt restarted at page one. Per-listing writes also rebuilt images
and equipment even when nothing changed.

At the same time, listing-page requests loaded full rows including raw source
JSON, rebuilt all filter facets, and queried comparable listings to calculate
analysis for every displayed card. Those reads competed with a large SQLite
writer using rollback journaling. This combination explains the variable
loading time and lock errors. Updates appeared late because the only freshness
path was the slow full crawl, not because the page itself was missing a cache
refresh.

## Two synchronization modes

### Incremental

`npm run data:sync:incremental` is the normal frequent workflow. It requests
`PUBLISHED_DESC`, upserts newest pages first, and never performs missing-ad
cleanup.

The default boundary is conservative and configurable:

- inspect at most 40 pages;
- keep a 72-hour lookback;
- stop after two consecutive pages where every listing ID was already known
  and the oldest timestamp on the page crossed the lookback.

A new or unknown listing resets that consecutive-page boundary. The hard page
cap prevents an unofficial API anomaly from turning a quick refresh into a
full crawl.

### Full reconciliation

`npm run data:sync:full` traverses the complete scoped inventory. Blocket's
result-window limit is handled by persisted year, price, and mileage
partitions. Overfull partitions are split newest/highest-first. The command
automatically resumes the latest interrupted or failed reconciliation;
`npm run data:sync:resume` requires one to exist.

Full reconciliation is periodic repair and removal verification, not the
normal freshness mechanism.

## Durable state, heartbeat, and locking

`ImportRun` stores mode, phase, counters, status, stop reason, and heartbeat.
`ImportCheckpoint` stores typed partition bounds, next page, last page, last
external ID, counters, errors, and timestamps. A page is advanced only after
its database transaction succeeds. On restart, the same run and first
pending/running/failed checkpoint continue at `nextPage`.

`SynchronizationLock` permits only one job per provider. Every page or state
transition refreshes the lock and run heartbeats. A second process exits with a
clear active-job error. A lock or `running` run older than five minutes is
classified as interrupted and released before new work begins, so killed
processes cannot leave synchronization permanently stuck.

`ImportRunError` records phase, checkpoint, page, attempt, HTTP status,
request parameters, and error text. Retries remain rate-limited and
exponential, but their failures are now observable.

## Safe missing-listing reconciliation

Incremental synchronization cannot remove anything. A full run may reconcile
missing listings only when every checkpoint is `completed` or `split`, all
writes succeeded, and no listing was rejected during parsing/normalization.
Any incomplete page or partition withholds cleanup.

Even after a verified traversal, an unseen active listing gets a missing count
first. It is marked removed only after a second complete reconciliation also
misses it. Listings observed in between reset the count. This guards against
temporary API gaps and records moving between live partitions.

## Write behavior

The write repository loads existing hashes for a page in one query and uses a
bounded transaction. Unchanged ads update only observation timestamps. Vehicle
and listing values are upserted only when content changed; images and equipment
are rebuilt only when their own hashes changed. Raw source JSON is not rewritten
for unchanged records.

`RAW_LISTING_PAYLOAD_RETENTION` can be `full` (default, enables detail-cache
reuse), `metadata`, or `none`. The latter modes reduce storage at the cost of
future re-fetches. Galleries are capped at eight normalized remote references;
a temporarily empty source response cannot erase a known-good gallery.

The application connects to PostgreSQL through `@prisma/adapter-pg`, using the
pooled `DATABASE_URL` at runtime and the direct `DIRECT_URL` for migrations and
admin tooling. PostgreSQL's MVCC lets readers and the ingestion writer proceed
concurrently without the manual journaling tuning SQLite required.

## Listing-page and analysis behavior

The page selects only card fields and relations. It does not fetch raw payloads.
Make/model/year facets and catalog price/sync summaries are precomputed in
small database tables after synchronization. Market value, Deal Score, Buy
Confidence, and ownership cost are stored in `ListingAnalysisRecord` instead
of rebuilding comparable cohorts for each page request.

Analysis counts one representative active ad per exact `vehicleId`: the most
recently synchronized listing, then the smallest listing id as a deterministic
tie-break. All source ads remain visible, but duplicate marketplace exposure
cannot inflate medians, counts, distributions, or comparable selection.

Changed ads receive a safe neutral stored value transactionally. A bounded
number are recomputed after each sync. Run `npm run data:analyze` to process
the remaining background backlog in batches.

## Blocket availability sampling

Full reconciliation is the only sweep that flips missing ads to `removed`, and
it only does so after two complete passes miss an ad. On the current schedule
that sweep rarely completes, so a direct availability check gives a faster,
independent removal signal.

`BlocketUnofficialClient.inspectCarAvailability(id)` calls
`GET /v1/ad/car?id=<id>` on `blocket-api.se` once and classifies the result
from **both** the HTTP status and the body:

- **missing** — the service returns HTTP 404/410; or a 2xx JSON body proves the
  underlying Blocket advert returned 404/410 (`"Client error '404 Not Found'…"`,
  `"410 Gone"`); or the body states the advert was removed.
- **active** — a 2xx JSON body carries advert data (`url`/`title`/`price`/
  `ad_id`) for the requested id and no error marker.
- **inconclusive** — timeout, transport error, HTTP 408/425/429, HTTP ≥ 500,
  HTTP 422 (malformed id), empty body, unparseable body, an unrecognised error,
  or a 2xx body without enough evidence either way.

A 2xx status is **never** enough on its own — the proxy returns HTTP 200 with
`{"error":"Client error '404 Not Found' …"}` for deleted adverts. The pure
classifier lives in `blocket-unofficial/availability.ts` and is covered by
`availability.test.ts`.

`verifyBlocketListingSample()` selects up to `BLOCKET_VERIFICATION_SAMPLE_SIZE`
active Blocket listings, ordered by: never directly checked first, then oldest
`availabilityCheckedAt`, then highest `missingReconciliationCount` (the
reconciler already failed to re-find it), then oldest `lastSeenAt`. A listing
checked in one run sorts to the back of the queue for the next, so older
unchecked inventory is never starved.

Each result stamps `availabilityCheckStatus` (`active` / `inconclusive` /
`missing`) and `availabilityCheckedAt`. A **missing** verdict, in one
transaction: sets `status = removed`, records `removedAt`, and appends one
`disappeared` `ListingObservation` (the existing enum value — never a new
`verified_missing` kind) carrying the final observed asking price, mileage and
seller type. A second check of an already-removed listing writes no duplicate
observation. The run returns sample telemetry (checked/active/missing/
inconclusive, never-checked count, listing-age spread, dealer/private split,
completion time) and a `sampleTooRecent` flag with warnings when the sample is
too fresh to estimate daily removals.

Entry points: the admin "Check Blocket listings now" button, the
`/api/verify-blocket` cron (CRON_SECRET, 20:00 UTC), and the read-only
`npm run blocket:probe` integration probe.

## Commands

```bash
npm run data:sync:incremental
npm run data:sync:full
npm run data:sync:resume
npm run data:sync:watch
npm run data:sync:wayke:sample
npm run data:sync:wayke:incremental
npm run data:sync:wayke:full
npm run data:sync:wayke:resume
npm run data:analyze
```

The optional watch command runs incremental jobs sequentially at the configured
interval and does not start a large crawl with `npm run dev`. Production
scheduling and multi-instance operation should be introduced with PostgreSQL
and an external job runner.

## Next work

The next scaling step is to collect run-duration, API-failure, checkpoint, and
page-latency metrics under real schedules. That evidence should determine
partition tuning and when to move to PostgreSQL. After that, add an approved
source feed and a durable scheduler/worker. Redis is unnecessary while compact
facet tables and stored analyses keep request queries fast.
