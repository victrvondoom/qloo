# Qloo live verification

## Status: NOT LIVE VERIFIED

No Qloo API key was available to any session that built this project, and the build sandbox's proxy blocks `hackathon.api.qloo.com`. **No real Qloo request has succeeded.** What exists instead:

| Level | Meaning | State |
|---|---|---|
| **LIVE VERIFIED** | Every check passed against the real hackathon host | **No** |
| **CONTRACT TESTED** | Adapter behaviour proven against stand-ins that follow the documented contract | Yes: auth, 429 with `Retry-After`, 5xx, malformed bodies, timeouts, cancellation, paging, parameter encoding (`tests/hardening.test.ts`, `tests/adversarial.test.ts`, `tests/recovery.test.ts`, `tests/live-verify.test.ts`) |
| **FIXTURE VERIFIED** | The product works end to end on the labelled synthetic world | Yes: unit, e2e and the benchmark |
| **BLOCKED** | Cannot run here | Live verification (no credential, no network) |

## What the integration uses

From the documented hackathon API (`https://hackathon.api.qloo.com`, header `X-Api-Key`): `GET /search` to resolve names, `GET /v2/insights` with `filter.type` (`urn:entity:place` for the places a taste neighbourhood chooses and the city baseline, `urn:tag` for cross-domain taste tags), `signal.interests.entities`, `filter.location.query` / `signal.location.query`, and `filter.popularity.max`. It does not call deprecated recommendation endpoints. `QLOO_BASE_URL` other than the hackathon host marks the run not-live.

## Verify it yourself, one command

```bash
QLOO_API_KEY=… npm run verify:qloo-live
```

Exit code **0** LIVE VERIFIED · **1** FAILED · **2** BLOCKED (no key, or Qloo unreachable; nothing is requested or written).

It runs, in order, and reports each as PASS/FAIL: (1) a minimal `/search` request: auth accepted, response parses to entities; (2) both demo clients' references resolve to usable signals; (3) a full brief for each client: terminal status, data mode equals transport mode, spec validation, ledger hash chain, every evidence line cites real Qloo requests in the ledger, replay reproduces the spec; (4) same words, different loves: the specs differ and every difference is backed by evidence or a stated constraint; (5) written limits (colour-temperature range, CRI, dimming) hold against real evidence; (6) no credential appears in the diagnostics. It writes `reports/qloo-live-verification.json` (counts, statuses, latencies, no keys or raw bodies) **only** when it actually ran, and it states `LIVE VERIFIED` only if every check passed against the hackathon host with a live transport. A run against any other host or the fixture world is reported `CONTRACT TESTED`.

`npm run probe -- Chicago` is the broader exploratory probe (field inventories, vocabulary hit rates, popularity filter behaviour) and writes `reports/qloo-live-probe.json`.

## Independent contract check against Qloo's public repository

Checked 2026-10-30: `github.com/qloo/docs-public` lists `openapi-schema.json` as "the complete OpenAPI 3.1 specification for the Qloo API v2". The file fetched from that path was the OpenAPI 3.1 meta-schema (the schema that validates OpenAPI documents), with no paths, parameters or responses, so **no schema-driven contract test could be built from it** and no discrepancy with the adapter was found or ruled out. The adapter's contract tests continue to follow the hackathon developer guide as read in an earlier session. Status unchanged: CONTRACT TESTED, NOT LIVE VERIFIED. If a real API document is published there, the next step is to generate request and response checks from it.

## What a live run would not prove

That Qloo's data is good for design (only that the pipeline handles it), that results beat an LLM (B1 needs a model key), or that clients prefer the output (that is the human study).

## Credential handling

The key is read server-side from `QLOO_API_KEY`, sent only in the `X-Api-Key` header, never logged, never written to the ledger or any report, and redacted from upstream error text (`redactSecrets`, tested with a server that echoes the key back).
