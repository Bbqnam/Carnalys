# Reliability intelligence and source value

## Reliability profiles

Reliability guidance is curated against a vehicle cohort, never inferred from
the seller's advert. A profile always requires make, model and a model-year
range. Generation, fuel type, transmission and an engine-description substring
can narrow the match. The most specific compatible profile wins.

A profile without a `ReliabilitySource` is an administrator draft and is not
returned to vehicle pages. Published profiles can contain known issues with a
severity, symptoms, inspection advice and an optional typical repair-cost
range. The buyer-facing panel describes cohort risk only; it never claims to
have inspected the individual car.

Administrators curate profiles at `/admin/reliability`.

## Source contribution

The read-only `/admin/source-value` report measures active physical vehicles,
not just source adverts. Per provider it reports:

- active adverts and distinct physical vehicles;
- vehicles currently found only in that source;
- overlap with Blocket;
- average first-seen lead or lag against Blocket for shared vehicles;
- registration, description, image and equipment coverage;
- active vehicles not observed during the last 48 hours.

The pairwise matrix reports shared physical vehicles and divides by the smaller
source's inventory. This answers whether a proposed source adds inventory or
mostly repeats another feed.

First-seen lead time is directional until every compared source has been
running continuously for the same period. Registration-number coverage and
cross-source identity quality also bound every overlap metric.

The report is set-based and cached for 15 minutes because image and equipment
coverage span the full active catalogue.

## Market discount ordering

`ListingAnalysisRecord.marketDiscountBps` stores the signed asking-price gap to
estimated market value in basis points. Positive values are below market value;
negative values are above it. Unrated or quarantined listings store `null` and
sort last.

The value is persisted rather than calculated after pagination so “Largest %
below market value” orders the complete filtered catalogue consistently.
