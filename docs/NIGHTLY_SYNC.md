# Nightly market sync (GitHub Actions)

Vercel's free plan kills functions at 60 seconds — enough to pull new listings,
never enough to finish a removal sweep. The batch work runs on GitHub Actions
instead (`.github/workflows/nightly.yml`); Vercel just serves the site.

## What it does, ~03:00–04:00 Europe/Stockholm

1. **Incremental sync**, one step per source (Blocket, Wayke, Bytbil, Hedin,
   Autohero) — newest-first, picks up new listings. A source being down does
   not block the others.
2. **Blocket removal poll** (`npm run data:poll`) — the layered availability
   check: cheap unofficial-API call first (catches hard 404s), then the real
   `blocket.se` ad page for anything still shown active (catches the
   "Varan har sålts eller tagits bort från marknaden" deactivated state the
   API cannot see). Ordered oldest-checked-first, so ~2 weeks of nightly runs
   at the default limit (12 000) cover the whole active Blocket set on
   rotation. Confirmed-gone listings are set `removed` with a `disappeared`
   observation, preserving the final asking price.
3. **Report smoke test** — the daily report query still runs against the live
   schema.

The 06:00 / 07:00 UTC report cron on Vercel then serves / emails the result.

## Setup

1. Repository → Settings → Secrets and variables → Actions → New repository secret:
   - `DATABASE_URL` — pooled Postgres connection string (Neon)
   - `DIRECT_URL` — direct (unpooled) connection string
   - `BLOCKET_UNOFFICIAL_API_URL` — optional, defaults to `https://blocket-api.se`
2. Actions tab → **Nightly market sync** → *Run workflow* to test it once.
3. Watch the run. The poll step prints a full breakdown (checked / active /
   inconclusive / missing, split by purged vs deactivated, sample age).
4. Once it is green and the disappearances show up in the admin report,
   **remove the now-redundant Vercel crons** from `vercel.json`
   (`/api/sync`, `/api/sync-secondary`, `/api/sync-full`, `/api/verify-blocket`)
   so they do not race this job. Keep `/api/reports/daily`.

## Tuning (workflow env or repo variables)

| Var | Default | Meaning |
| --- | --- | --- |
| `BLOCKET_POLL_LIMIT` | 12000 | listings the removal poll checks per run |
| `BLOCKET_POLL_CONCURRENCY` | 15 | parallel checks |
| `BLOCKET_INCREMENTAL_MAX_PAGES` | 10 | newest pages per incremental run |

## Phase 2

Full reconciliation for Wayke/Bytbil/Hedin/Autohero to detect their removals
too (their `:full` runs already go through the same
`markMissingListingsRemovedSafely` path). Add as a separate weekly workflow —
heavier, resumable — once the Blocket poll is proven.
