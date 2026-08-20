# Car Finder

Car Finder is a Swedish vehicle decision platform. The current milestone uses
real marketplace listings while keeping source ingestion, normalized data,
analysis, and UI concerns separate.

## Project documentation

- [Product and architecture context](docs/CODEX_START.md)
- [Project roadmap](docs/PROJECT_ROADMAP.md)
- [Data ingestion architecture](docs/DATA_INGESTION.md)

## Getting started

Install dependencies, migrate the local database, and import current listings:

```bash
npm install
npm run data:sync
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The UI reads only from the local database. `npm run data:sync` is the only
command that contacts the configured marketplace adapter, so a source outage
does not remove previously cached listings.

## Data commands

```bash
npm run data:sync    # import/update listings and mark missing ones removed
npm run db:studio    # inspect normalized records
npm run db:generate  # regenerate the typed Prisma client
npm run db:migrate   # create a development migration after schema changes
```

Copy `.env.example` to `.env` to change the importer query, import limit, API
base URL, or database URL.

## Important source notice

The initial `blocket_unofficial` adapter uses a third-party, unofficial API for
development. It is deliberately isolated and must be replaced with a licensed
marketplace, aggregator, or dealer feed before commercial production use. Do
not increase synchronization frequency without reviewing the provider's limits
and the underlying marketplace terms.

## Validation

```bash
npm run lint
npm run build
```
