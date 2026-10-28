# Deployment

Tastespec is one Next.js app with an embedded database. It runs the same way on Windows, macOS and Linux, needs only Node.js 22.13 or newer, and stores a brief in about 5–15 KB (one Brotli-compressed row).

## Status

**No public deployment has been verified from this workspace.** The build sandbox has no hosting credentials and its proxy blocks Qloo, so deploying and checking the live URL must be done from your account. Everything below was run locally (synthetic data) except where marked.

## Local, any OS (two commands)

```bash
npm ci
npm run demo        # builds once, then serves http://localhost:3000 on synthetic data
```

`npm run demo` is a Node script (`scripts/run.mjs`), not shell syntax, so it behaves the same in PowerShell, cmd, zsh or bash. Briefs persist in `./.data/tastespec.db`.

For live evidence, put `QLOO_API_KEY=…` in `.env.local` and run `npm run build && npm run serve` (or `npm run dev` while developing). `npm run probe -- Chicago` checks the key against the live API and writes a sanitised report.

## Docker

```bash
docker compose up                                   # synthetic data, http://localhost:3000
QLOO_MODE=live QLOO_API_KEY=… docker compose up     # live Qloo
```

The image is `node:22-bookworm-slim`, runs as the unprivileged `node` user, keeps the SQLite file on the `/data` volume and has a health check on `/api/health`.

## Serverless (Vercel and similar)

Serverless filesystems are temporary, so point the app at a hosted libSQL database (Turso has a free tier). Tastespec talks to it over HTTPS with the official pure-JavaScript client; nothing native to install.

1. `turso db create tastespec` → `turso db show tastespec --url` → `turso db tokens create tastespec`.
2. In the project's environment variables set `DATABASE_URL` (the `libsql://…` URL), `DATABASE_AUTH_TOKEN`, `QLOO_API_KEY`, and optionally `ANTHROPIC_API_KEY`. Do **not** set `QLOO_MODE` on a public deployment.
3. Deploy. Tables are created on first request (versioned migrations in `src/lib/db/schema.ts`).
4. Check `GET /api/health`: `"qloo": "live"`, `"db": {"kind": "libsql", "durable": true}`, `"issues": []`. Then build a brief, open it from a second browser (read-only), create a client link, react on a phone, and watch the designer's activity feed update.

Without `DATABASE_URL` on a serverless host the app still works, but briefs live in the instance's temp directory and `/api/health` and every brief's trace say storage is not durable.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | for live data | Hackathon key; server-only, never logged or ledgered |
| `QLOO_BASE_URL` | no | Default `https://hackathon.api.qloo.com` |
| `QLOO_MODE` | no | `fixture` = labelled synthetic data. Never on a public demo. |
| `ANTHROPIC_API_KEY` | no | Message reading, counter-test, unfamiliar words and place tags, client note, hand-over prose |
| `ANTHROPIC_MODEL` | no | Default `claude-opus-5-5` |
| `DATABASE_URL` | serverless: yes | `libsql://…` / `https://…` (libSQL over HTTP) or `file:/path/to.db` |
| `DATABASE_AUTH_TOKEN` | with libSQL | Turso database token |
| `TASTESPEC_DB_PATH` | no | SQLite file path (default `./.data/tastespec.db`) |
| `TASTESPEC_RETENTION_DAYS` | no | Delete briefs untouched this long (default 180) |
| `TASTESPEC_RUNS_PER_10_MIN` | no | Per-IP brief limit (default 12) |
| `PORT`, `HOST` | no | For `npm run demo` / `npm run serve` (default 3000, 0.0.0.0) |

## What gets stored

| Table | Contents | Size |
|---|---|---|
| `briefs` | One row per brief: Brotli-compressed JSON (evidence, spec, ledger, trace) plus the dozen columns lists and stats need; the owner and share-link **hashes**, never the secrets | ~5–15 KB |
| `events` | The activity feed (who did what, when; payload ≤ 4 KB) | ~200 B each |
| `generations` | Cached Claude prose for the hand-over, keyed to the facts it was written from | ~1–3 KB |
| `cache` | Model mappings of place terms (30-day TTL), shared across briefs | tiny |

Retention runs at most every six hours: untouched briefs past `TASTESPEC_RETENTION_DAYS` are deleted with their events and generations, expired cache rows go, and SQLite reclaims the space incrementally.

## Health check

`GET /api/health` reports Qloo mode, configuration issues (never values), model availability, database kind, durability and size. It makes no external calls and never returns file paths.

## The film

`npm run build && npm run film` records the landing-page animation to `public/media/tastespec-film.webm` with a poster frame (needs Playwright + Chromium). It uses synthetic data and is labelled as such.
