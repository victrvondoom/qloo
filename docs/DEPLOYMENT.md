# Deployment

## Status

**No public deployment has been verified from this workspace.** The build sandbox has no hosting credentials and cannot reach Qloo, so deploying and checking the live URL must be done from your account. The steps below take about ten minutes.

## Vercel (recommended)

1. Push the branch, then **Import Project** in Vercel and pick this repository. Framework: Next.js; no build settings needed.
2. **Storage → Create → Upstash for Redis** (Vercel Marketplace) and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Without it, briefs are written to `/tmp` and vanish between serverless instances.
3. **Settings → Environment Variables**:
   - `QLOO_API_KEY` (required)
   - `ANTHROPIC_API_KEY` (optional: enables the LLM-only counter-test, the client note, unfamiliar-word mapping)
   - Do **not** set `QLOO_MODE` on the public deployment.
4. Deploy. `maxDuration` for `/api/run` is 60 s (set in the route).
5. Check:
   - `GET /api/health` returns `"qloo": "live"`, `"store": "kv"`, `"durable": true`, `"issues": []`.
   - Run the Same words test on `/compare`; open a brief; verify the ledger; download the bundle.
   - From a terminal with the key: `npm run probe -- Chicago` writes `reports/qloo-live-probe.json`.

## Any Node host

```bash
npm ci
npm run build
QLOO_API_KEY=... PORT=3000 npm start
```

On a single long-lived instance the file store under `.data/` is durable (set `TASTESPEC_DATA_DIR` to a persistent volume).

## Environment

| Variable | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | yes | Hackathon key; server-only |
| `QLOO_BASE_URL` | no | Default `https://hackathon.api.qloo.com` |
| `ANTHROPIC_API_KEY` | no | Counter-test, note, unfamiliar words |
| `ANTHROPIC_MODEL` | no | Default `claude-opus-5-5` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | strongly recommended on serverless | Upstash / Vercel KV REST |
| `TASTESPEC_RUNS_PER_10_MIN` | no | Per-IP brief limit, default 12 |
| `TASTESPEC_DATA_DIR` | no | File store location on non-serverless hosts |
| `QLOO_MODE` | no | `fixture` = synthetic data (tests, offline UI work). Never on a public demo. |

## Health check

`GET /api/health` reports Qloo mode, configuration issues (never values), model availability, store kind and durability. It makes no external calls.
