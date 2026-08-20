# Car Finder

Car Finder is a Swedish vehicle decision platform. The current milestone uses
real marketplace listings while keeping source ingestion, normalized data,
analysis, and UI concerns separate.

## Project documentation

- [Product and architecture context](docs/CODEX_START.md)
- [Project roadmap](docs/PROJECT_ROADMAP.md)
- [Data ingestion architecture](docs/DATA_INGESTION.md)

## Getting started

Install dependencies, migrate the local database, and refresh recent listings:

```bash
npm install
npm run data:sync
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The UI reads only from the local database. Synchronization runs outside the
request path, so a source outage does not stop the site from serving its last
known catalog.

## Data commands

```bash
npm run data:sync              # alias for the quick incremental refresh
npm run data:sync:incremental  # newest listings first; never removes listings
npm run data:sync:full         # start or automatically resume reconciliation
npm run data:sync:resume       # resume only; error if no interrupted run exists
npm run data:sync:watch        # optional non-overlapping local refresh loop
npm run data:analyze           # finish stored market-analysis backlog
npm run db:studio              # inspect normalized records and run progress
```

A full reconciliation can take a long time, but its partition and next page are
persisted. It is safe to stop and rerun the command. Do not add the full command
to `npm run dev`; use the lightweight watch command in a separate terminal
when automatic local freshness is useful.

Run `npm run db:deploy` once after pulling schema changes. Synchronization
commands deliberately do not run migrations themselves, allowing the optional
watch process to run alongside the development server without requesting an
exclusive SQLite schema lock.

In local development, the results toolbar also includes an **Update listings**
button for an on-demand incremental refresh. It is deliberately unavailable in
production until the project has authentication and an authorized admin role.

Copy `.env.example` to `.env` to adjust the incremental lookback, page cap,
watch interval, API base URL, query scope, or database URL.

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
