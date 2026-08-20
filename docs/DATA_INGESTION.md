# Vehicle data ingestion

## Current source

The development adapter uses `blocket-api.se`, an unofficial third-party API
that exposes current Blocket vehicle search and detail records without
credentials. It was selected only because it makes the real-data milestone
testable without a paid account.

This is not the recommended commercial source. Before production, replace it
with one of:

1. A licensed Biluppgifter classifieds feed.
2. An approved marketplace partnership.
3. Rights-cleared XML/CSV feeds supplied directly by dealers or their DMS.
4. Tradera's approved developer API if its inventory fits the product.

## Pipeline

```text
Unofficial Blocket API
  -> BlocketUnofficialClient (HTTP and timeouts)
  -> parser (runtime shape validation)
  -> normalizer (Swedish source values to domain enums)
  -> synchronization service (run lifecycle and failure isolation)
  -> listing write repository (deduplication and transactional upsert)
  -> SQLite cache via Prisma
  -> vehicle listing repository (domain reconstruction and placeholder analysis)
  -> homepage server component
```

The browser never contacts a marketplace. The importer can fail while the
application continues serving the last successful database snapshot.

## Identity and deduplication

- A source listing is unique by `(provider, externalId)` and is updated in
  place on later synchronizations.
- Vehicles are matched by VIN first and registration number second when those
  identifiers are available.
- A deterministic provider/external-ID fallback is used only when neither
  vehicle identifier is present.
- Listings missing from a successful synchronization of the same source scope
  are marked `removed`; they are not deleted.

This allows another marketplace adapter to attach its listing to an existing
vehicle while retaining separate price, seller, URL, status, and source
timestamps.

## Database model

- `VehicleRecord`: normalized vehicle identity and specifications.
- `ListingRecord`: marketplace-specific price, seller, location, lifecycle,
  source timestamps, and raw audit payload.
- `ListingImageRecord`: ordered remote media with dimensions and thumbnails.
- `ListingEquipmentRecord`: normalized equipment labels.
- `ImportRun`: synchronization status and operational counters.

SQLite is used for a zero-service local milestone. Database access is isolated
behind repositories; production should move the same relational model to
PostgreSQL before scheduled or multi-instance synchronization is introduced.

## Synchronization behavior

Run `npm run data:sync`. Detail requests are deliberately rate-limited and
processed outside the request path. Search records are still imported when an
individual detail request fails. A completely empty or failed batch never
marks cached listings as removed.

Useful environment variables are documented in `.env.example`.

## Analysis boundary

Deal Score, Buy Confidence, market value, and ownership cost remain explicit
low-confidence placeholders. They are calculated after database records are
mapped into the internal domain model, never inside the marketplace adapter.
This preserves the source/analysis separation and makes the later valuation
engine independent of ingestion.
