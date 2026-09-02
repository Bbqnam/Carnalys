# Historical market intelligence

Carnalys treats current listings as an incoming market-data stream. Permanent,
normalized observations are the durable asset; daily aggregates are a
rebuildable query accelerator.

The implemented flow is:

`ListingRecord → ListingObservation → MarketCohort → MarketSnapshot → historical query layer`

## Existing foundation reused

`ListingRecord` already retains removed ads, provider/external identity,
vehicle identity, first/last seen times, latest asking price, removal time,
seller, URL, and normalized vehicle attributes. Removal is applied only after
two complete reconciliation runs miss an ad. Incremental sync never removes
ads.

`ListingObservation` already existed as the sparse append-only history log. A
listing seen unchanged hundreds of times creates no new event. The historical
work extends that table instead of introducing a parallel event store.

`ListingAnalysisRecord` remains the current, precomputed Deal Score / Market
Value / Buy Confidence path. Normal browsing does not read either historical
table.

## Permanent listing events

Events are written in the same transaction as current listing state:

- `first_seen`
- `price_change`
- `mileage_change`
- `seller_change`
- `disappeared`
- `relisted`
- reserved enum values for source status and other future meaningful changes

One fetch can write more than one fact. If price and mileage both change, both
events are retained. Every event carries the compact state needed to rebuild
its validity interval; changed-value fields such as previous price, previous
mileage, and previous seller are populated only for their event type.

`disappeared` means only “no longer observed after safe verification.” It is
never treated as a sale and the final observed asking price is never called a
transaction price.

`provenance` distinguishes `observed` changes from `reconstructed` lifecycle
facts. The 2026-08-22 history migration seeded first-seen and disappearance
facts from listing rows that already existed. Those rows are useful coverage,
but do not fabricate an earlier price-change date. Snapshot reconstruction
uses their database creation time as the moment their market state became
known, while retaining their actual first-seen time for listing age.
The additive migration also fills any listing that missed that original seed;
the audit found 10 such rows among 127,902 listings.

The vehicle foreign key now uses `RESTRICT`, so deleting a vehicle identity
cannot cascade-delete its lifetime listings. Historical events deliberately
have no listing foreign key and therefore survive even an explicit listing
cleanup.

## Daily snapshots and cohort policy

`MarketCohort` stores repeated dimensions once. `MarketSnapshot` stores only a
cohort foreign key, date, watermark, and numeric metrics. Both are derived and
versioned (`vehicle-normalization-v1`), so normalization improvements can
rebuild them from the permanent listing/event facts.

The daily job reconstructs listing state at the end of a completed UTC date,
deduplicates multiple source ads to one physical `vehicleId`, and creates only
cohorts with at least 10 active vehicles. The threshold is evidence-based: in
the current 127,902-listing catalog, the median fully detailed cohort contains
one vehicle; 2,294 detailed cohorts and 9,188 cohorts across the complete
fallback hierarchy meet a threshold of 10.

The hierarchy is:

1. make + model
2. make + model + fuel
3. make + model + fuel + transmission
4. make + model + fuel + transmission + model year
5. make + model + fuel + transmission + model year + mileage band

Historical queries start at the requested detail and fall back one level at a
time. Variants and generations are intentionally excluded for now because the
current free-text variant data is not normalized reliably enough for durable
analytics.

Mileage bands match common Swedish `mil` ranges:

- 0–2,500 mil
- 2,500–5,000 mil
- 5,000–7,500 mil
- 7,500–10,000 mil
- 10,000–15,000 mil
- 15,000+ mil

The snapshot contains active inventory, mean/median/min/max and P10/P25/P75/P90
asking prices, mean/median mileage, mean/median days on market, new/reactivated/
removed listing counts, price-reduction count/share/size, and medians of Deal
Score and Market Value where an analysis actually existed before the snapshot
cutoff. Implausible monthly-rate/placeholder prices use the same shared filter
as current Deal Score and Market Analysis.

Daily event metrics count observed source listings. Inventory and price
distribution count one representative per exact physical vehicle. This
distinction keeps duplicate marketplace exposure out of market level while
preserving source behavior.

## Scheduling, backfill, and idempotency

The Vercel job calls `/api/market-snapshot` at 04:00 UTC, after ingestion, and
builds the previous completed UTC date. The job is separate from ingestion so
listing writes and browsing do not wait on aggregate work.

Manual commands:

```bash
npm run data:snapshot
npm run data:snapshot -- --date=2026-08-30
npm run data:snapshot:backfill -- --from=2026-08-22 --to=2026-08-30
```

Re-running a date atomically replaces only that date's derived snapshots for
the current normalization version. It never mutates or deletes listing events.
This is also the backfill strategy: build dates from the history bootstrap
forward. Dates before event capture cannot be reconstructed faithfully and
must not be invented.

## Internal query strategy

`getHistoricalMarketTrend` reads one bounded cohort from `MarketSnapshot`. It
returns the latest point, nearest points at or before 30/90/180/365 days ago,
absolute and percentage price/inventory changes, and daily trend points for a
requested range. It never scans `ListingObservation` in request-serving code.

Example:

```ts
await getHistoricalMarketTrend(
  {
    make: "Toyota",
    model: "Corolla",
    fuelType: "hybrid",
    transmission: "automatic",
    modelYear: 2021,
    mileageBucket: 2,
  },
  { from: new Date("2026-08-01"), to: new Date("2027-08-01") },
);
```

The unique `(cohortId, snapshotDate)` index serves point/range history reads.
The cohort dimension index serves Explorer-style drilldown. A date index serves
daily replacement and latest-date discovery. Event indexes remain limited to
listing timelines, time coverage, and event-type/time metrics.

## Measured size and growth model

Measurements on 2026-08-31:

- 127,902 listings / 124,530 physical vehicles
- 131,974 events across 12 captured dates
- `ListingObservation`: 23.3 MB heap + 29.1 MB indexes = 52.5 MB
- measured event footprint: about 0.18 KB heap + 0.22 KB indexes per row
- 9,188 eligible daily cohorts at the size-10 threshold

Planning assumptions are deliberately explicit:

- four permanent meaningful events per lifetime listing on average (creation,
  disappearance, and two changes); actual data should replace this assumption
  after a full year;
- 0.40 KB total per event, based on the measured table and indexes;
- 0.30 KB total per numeric snapshot row (approximately 0.18 KB heap and 0.12
  KB indexes); this is an estimate until the new table has production volume;
- 9,188 rows/day at the present market shape; dimension cardinality grows much
  more slowly than listing count because cohorts below 10 are omitted.

Permanent event storage by lifetime catalog size:

| Lifetime listings | Event rows (4×) | Heap | Indexes | Total |
| ---: | ---: | ---: | ---: | ---: |
| 100,000 | 400,000 | ~72 MB | ~88 MB | ~160 MB |
| 500,000 | 2,000,000 | ~360 MB | ~440 MB | ~800 MB |
| 1,000,000 | 4,000,000 | ~720 MB | ~880 MB | ~1.6 GB |
| 3,000,000 | 12,000,000 | ~2.16 GB | ~2.64 GB | ~4.8 GB |

Daily aggregate storage at the current 9,188-cohort shape:

| Retention | Snapshot rows | Heap | Indexes | Total |
| ---: | ---: | ---: | ---: | ---: |
| 1 year | ~3.35 million | ~0.60 GB | ~0.40 GB | ~1.0 GB |
| 3 years | ~10.06 million | ~1.81 GB | ~1.21 GB | ~3.0 GB |
| 5 years | ~16.77 million | ~3.02 GB | ~2.01 GB | ~5.0 GB |

Representative combined scenarios are therefore ~1.2 GB for 100,000 lifetime
listings plus one year of snapshots, ~3.8 GB for 500,000 plus three years,
~6.6 GB for 1,000,000 plus five years, and ~9.8 GB for 3,000,000 plus five
years. `MarketCohort` itself is only thousands of rows and negligible beside
the fact table.

At 600,000 new lifetime listings/year, the planning growth rate is about 2.4
million event rows (~0.96 GB) plus ~3.35 million snapshots (~1.0 GB): roughly
2 GB/year including indexes. At one million new listings/year it is about 2.6
GB/year. Daily snapshots should not be compacted while this remains affordable;
only the rebuildable snapshot layer—not unique events—is a candidate for future
weekly/monthly compaction, and only after real storage measurements justify it.

If active inventory grows far beyond today's level, illustrative daily cohort
counts of 20,000 / 30,000 / 50,000 would cost roughly 2.2 / 3.3 / 5.5 GB per
year. This is the scaling signal to monitor; it is not a reason to discard
history today.

## Current data limitations

- Captured history begins in August 2026 and contains only 12 dates at audit
  time. Genuine seasonality and 30/90/365-day comparisons need time to accrue.
- No safely verified disappearance had yet been recorded in the audited live
  dataset. Removal metrics remain zero until full reconciliation completes the
  existing two-pass check.
- For listings present before the original history migration, the exact
  original asking price and any earlier intermediate prices are unknowable.
  They are not fabricated.
- Seller-name and previous-mileage deltas are complete only from this migration
  forward.
- A disappearance supplies a final observed asking price, never a confirmed
  selling price.
- Normalized generation and variant dimensions are not yet trustworthy enough
  for snapshot keys. Body style and drivetrain can be added later if measured
  cohorts justify the extra cardinality.
- Historical Deal Score / Market Value medians exist only when their current
  analysis record had already been calculated by that day's cutoff. Listing
  scores themselves are not event-sourced.
