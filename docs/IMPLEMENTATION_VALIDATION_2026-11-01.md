# Implementation and verification — 1 November 2026

## Implemented foundations

- Analysis aggregates use one maintained representative per physical vehicle,
  known mileage, eligible records and the shared seven-day catalogue freshness
  policy. The small facet read runs before the expensive aggregates. A shared
  three-task analysis budget leaves database capacity for other requests.
- Valuation refreshes persist a batch with four database queries instead of two
  sequential writes per listing. Vehicle/listing locks and dirty timestamps
  protect concurrent ingestion, price checks and newer calculations.
- Actual final comparables, adjusted prices, clipping, effective sample size,
  input fingerprint and observation times are retained as calculation evidence.
  Explanation cards use the final selected set. Confidence counts use that set,
  rather than every candidate considered before trimming. Confidence remains
  an explicitly uncalibrated evidence diagnostic.
- Missing mileage remains unknown through ingestion, scoring and display.
  Known combustion petrol/diesel mismatches are excluded. Cross-model price-band
  fallback does not qualify as an individual estimate. Low-evidence valuations
  do not receive a ranked Deal Score. Host-observed price changes invalidate
  their previous Deal Score while recalculation is queued.
- Changed ingestions append immutable normalized source facts. Nightly frozen
  snapshots allow prospective validation; prior specifications are not invented.
- Similar-car suggestions are separate from valuation: same vehicle type and
  fuel/transmission, nearby age/mileage/power and a ±20% shopping budget. They
  exclude every syndicated listing of the viewed physical car. The section
  loads after the vehicle page and only displays recently host-confirmed ads.
- Original-host checks cover all five sources. Confirmed missing adverts are
  retired from Carnalys with an observation event; reservations are hidden;
  blocked, ambiguous and failed checks remain inconclusive. A loading page or
  HTTP 200 alone never proves availability. Autohero's own sold-state projection
  takes precedence over its retained detail payload.

## Measured performance

Measurements used a disposable Neon copy of the production database, with no
production data writes during testing. These are sequential observations, not
a controlled production load test.

| Check | Result |
| --- | --- |
| Refresh the same 500 vehicles, previous sequential writes | 86.171 s |
| First bulk-write run | 23.406 s |
| Repeat bulk-write run | 14.767 s |
| Numeric outputs between bulk repeats | 500/500 identical |
| Concurrent cold local `/analysis`, eight-connection pool | HTTP 200, 8.928 s |
| Repeat local `/analysis` | HTTP 200, 0.025 s |
| Concurrent vehicle detail | HTTP 200, 1.488 s |
| Concurrent similar-car request | HTTP 200, 4.114 s, six confirmed cars |

The first bulk run changed one numeric output relative to the earlier run,
which straddled the safety-gate changes; it is not evidence of perfect numerical
parity with the old methodology. The repeat under the same final gates was
identical. Database warming and workload variation also affect timings. The
reduction from hundreds of per-row network round trips is architectural;
these local durations are not a production latency guarantee.

## Valuation experiment

Frozen snapshot: 116,476 physical-vehicle representatives, captured
`2026-11-01T18:35:02.642Z`. SHA-256:
`1f639e177ce433a05d986a53fcc05b6faface862421a484b9808b79be5c1029c`.
The eligible population contained 45,947 identified, checked vehicles observed
within 30 days. Training used 26,176 vehicles; tuning, calibration and test
vehicles were excluded from its comparable pool.

| Adapter | Test targets | Coverage | Median absolute asking-price error |
| --- | ---: | ---: | ---: |
| Legacy pricing-core replay | 6,911 | 98.93% | 9.09% |
| Strict median | 6,911 | 5.08% | 12.51% |
| Pooled log-price ridge | 6,911 | 93.45% | 11.54% |
| Strict hybrid | 6,911 | 4.07% | 6.25% |

The hybrid's lower headline error does not establish improvement: it covers a
small, easier subset. On its 281 paired targets, mean absolute log error was
higher than the replay by 0.01477 (vehicle bootstrap 95% interval approximately
0.00190–0.02940). The dealer-held-out stress test reached the same qualitative
conclusion. The replay deliberately preserves its legacy circular fallback,
so it is not an unbiased transaction-value standard either.

The checksummed reports and snapshots are retained in the ignored
`artifacts/valuation/` directory. Reports remain `NOT_APPROVED`.
No challenger estimator is activated and
no new valuation methodology version is introduced.

## Verification evidence and operational limits

The production build and TypeScript check pass. Tests: 300 passed, one skipped;
targeted validation checks accompany later benchmark-only contract assertions.
Isolated integration checks exercised immutable source-fact history, unchanged
ingestion, final-comparable evidence, price invalidation, dirty-marker clearing,
stale-response rejection and idempotent retirement/history updates. Live probes
confirmed active ads/prices on Blocket, Bytbil, Hedin and Autohero and found an
active-in-Carnalys Wayke ad returning a genuine host 404. Browser verification
rendered six similar cars, original-host links and check times; the console
contained no errors after reload.

Nightly non-Blocket checks rotate 500 adverts per source. The independent
90-minute valuation job drains up to 50,000 changed/expired estimates and logs
the pending-change count and oldest visible timestamp. Hidden unverified stock
is deferred until reconfirmed, rather than consuming the visible-stock budget.
This is bounded work; it does
not promise complete daily host coverage or a strict 24-hour refresh SLA.
Catalogue result caches can retain cards briefly; recommendation responses
use no-store and five-minute maximum positive evidence reuse. A seller can
sell/reserve a car between checks. Remote host adverts are not deleted by us.

Source-priority/conflict adjudication, broader missing-feature recovery,
blinded expert review, future-market performance and genuine sale-price
validation remain further work. The asking-price experiment does not resolve
those issues or establish statistically calibrated production confidence.
