# Valuation evidence and validation contract

## Target and release policy

Estimate the typical current advertised asking price for a specified vehicle,
configuration, seller channel and stated condition. This is not a transaction
price, a guaranteed sale price, or an independently verified bargain label.

Production pricing remains the existing estimator while the challengers are
evaluated. No new valuation methodology version or challenger is automatically
promoted. Evidence/schema identifiers are separate from methodology versions.
Safety changes preserve unknown mileage, withhold Deal Scores below the existing
medium evidence category, and refresh changed/expired calculations.
The same-make price-band fallback remains in the legacy replay but no longer
qualifies as an individual estimate or Deal Score. A known petrol/diesel
mismatch cannot pass simply because both engines are classed as combustion.

## Frozen data

`npm run valuation:freeze -- artifacts/valuation/snapshot.json` exports a
repeatable-read, read-only snapshot, deduplicated by physical vehicle. The
manifest fixes capture time, row count, price target and SHA-256 checksum.
Existing files cannot be overwritten. Raw payloads, VINs and registrations are
not exported; seller clusters are hashed. Artifacts are gitignored and created
with owner-only permissions.

An isolated Neon branch can be selected with `CARNALYS_TEST_DATABASE_HOST`;
the existing environment files are not overwritten. Migration tests use a
normal child branch before production. Never use a future snapshot to fill
missing features in the earlier snapshot.

## Comparability contract

- Remove all source listings of the evaluated physical vehicle before selection.
- Candidate selection for challengers cannot read the target asking price.
- Unknown mileage is not zero; missing generation/engine/drivetrain does not
  prove equivalence. Conflicts need separate resolution before valuation.
- Strict challengers require known matching family, generation, body, fuel,
  powertrain, transmission and drivetrain, plus matching output/displacement.
  The one-horsepower allowance covers unit conversion/rounding, not a premium.
- Rare/unknown configurations can legitimately be unvalued. A cross-model,
  same-make price band is market context, not a supported individual valuation.
- The current replay deliberately retains its circular fallback to expose its
  behavior in the benchmark. It is not silently corrected for the comparison.

## Reproducible comparison

`npm run valuation:evaluate -- artifacts/valuation/snapshot.json`

Run again with `--split=dealer` for a seller-cluster stress test. Stable physical
vehicle groups separate training (60%), hyperparameter tuning (15%), interval
calibration (10%), and untouched test targets (15%). These are experimental
data partitions, not valuation percentage corrections. The audit population
requires checked, eligible, identified vehicles observed within 30 days; that
diagnostic window must be tested for sensitivity rather than adopted as truth.

The four adapters are:

1. Current pricing-core replay, including tier widening and segment fallback.
2. Strict comparable median, using an explicitly defined ordinary median.
3. Pooled log-price ridge model with family/configuration effects and modest
   age/mileage features. Regularization is selected only on tuning data.
4. Strict hybrid: normalize genuine comparables using the learned model, then
   aggregate robustly. It abstains outside observed age/mileage support.

The pooled model is an experimental price predictor. It has no production Deal
Score authority. It does not yet include a learned temporal price component;
forward drift is an evaluation risk, not hidden by a market correction.

Each report includes coverage/abstention, SEK error, relative error, signed log
bias, tail log error, equal-target paired comparisons, common coverage, vehicle
bootstrap uncertainty, nominal 90% interval coverage/width, and brand, age,
mileage, fuel, price and missing-generation slices. Small slice counts must be
reported, not interpreted as stable estimates. Seller dependence remains a
limitation of the vehicle bootstrap; use dealer-held-out results too.

Stored served estimates are reported separately because they mix methodology
versions and may contain target-price influence. They are an operational
baseline, not an unbiased held-out model score.

## Forward evaluation and release gates

After collecting a later snapshot:

`npm run valuation:evaluate -- earlier.json --future=later.json`

The future test contains genuinely new physical vehicles; models, tuning and
calibration use only the earlier snapshot. A same-day random split is labelled
cross-sectional and cannot establish future performance. Historical observations
lack complete immutable specification snapshots, so backtests cannot invent
those features. Snapshot history and price-confirmation lags must be monitored.

Before release, predeclare acceptable tail loss, subgroup regressions and
coverage trade-offs; review a blinded stratified expert sample; pass price-
invariance, duplicate, missing-data, unit-error, sparse-cohort, extrapolation and
stability checks; compare paired uncertainty; validate interval calibration on
future data; then shadow the model. The report always starts `NOT_APPROVED`.
No source advert's disappearance is treated as a completed sale.

## Calculation evidence and refresh

Changed ingestions append `ListingFactObservation` rows with the source's
normalized claims, canonical interpretation, normalization version, content
hash and quality outcome. Prior facts are never overwritten by another source.
Descriptions are fingerprinted, not duplicated; registrations/VINs are omitted
from fact JSON. This starts prospective history and cannot recreate past facts.
Canonical source-priority/conflict adjudication still needs its own validated
policy; retaining conflicting claims does not establish which one is true.

Each recalculation stores the actual selected/trimmed comparable rows, weights,
adjusted prices, clipping flags, effective sample size, method, source times,
target input fingerprint and explicitly uncalibrated confidence diagnostics.
Displayed explanation candidates are restricted to the actual used set.
Changed listings carry `analysisRequiredAt`; workers select dirty rows as well
as old methods and estimates older than a day. Clearing a dirty marker is
conditional on its timestamp to preserve a concurrent update. Nightly draining
prioritizes inventory inside the shared catalogue freshness policy; hidden
unverified ads wait for source/host reconfirmation. Work is bounded; visible
backlog size and oldest pending timestamp are operational release
checks. The legacy numeric estimator is not assumed to be calibrated because
its unit tests pass.
