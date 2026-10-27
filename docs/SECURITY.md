# Security

## Secrets

- `QLOO_API_KEY` and `ANTHROPIC_API_KEY` are read on the server only. No `NEXT_PUBLIC_` variables exist; no key reaches the browser.
- The Qloo key is sent only as the `X-Api-Key` header. It is never logged, never written to the ledger, never included in bundles or reports (tested in `tests/hardening.test.ts`; the probe refuses to write a report containing it).
- `QLOO_BASE_URL` must be https with no credentials, query or fragment (`src/lib/env.ts`); a non-hackathon host is reported as a configuration issue.
- `.env*` files are git-ignored. `.env.example` contains no values.

## Visitor isolation and write protection

- Each browser gets a random 128-bit owner secret in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie. Briefs store only `SHA-256("owner:" + secret)`.
- Listing (`/projects`, `GET /api/briefs`) only returns the current owner's briefs.
- Every write (`answer`, `decision`, `outcome`, `DELETE`) requires the owner cookie to match; otherwise 403.
- A brief id has 96 random bits and works as a read-only share link (capability URL). Responses never include the owner hash.
- Retention: owners can delete a brief and its ledger (`DELETE /api/briefs/:id`, "Delete brief" button).

## Input handling

- Request bodies are capped (16 KB for runs, ≤4 KB for writes) and must be JSON.
- `cleanInput` strips control characters, caps lengths (label 40, city 60, words 30, references 80), caps counts (5 words, 10 references) and de-duplicates.
- Client text never selects code paths. It is sent to Qloo only as search strings and to the model only as JSON-encoded data marked "data, not instructions".
- Model output is constrained by a JSON schema **and** re-validated: every counter-test value must be a menu option, every word reading a known dimension. Invalid output is rejected, not repaired.
- External text (venue names, tags) is rendered by React (escaped). No `dangerouslySetInnerHTML`.

## Abuse and cost controls

- Per-IP sliding-window limits: 12 new briefs per 10 minutes (`TASTESPEC_RUNS_PER_10_MIN`), 120 writes per 10 minutes. These are per serverless instance, a known limitation; put a platform rate limit (e.g. Vercel firewall) in front for real traffic.
- Per-run budgets: 55 s wall clock, 45 Qloo HTTP attempts, ≤3 attempts per request, backoff never past the deadline, 5 MB response cap.
- Client disconnect or Cancel aborts in-flight Qloo and model calls (`req.signal`).

## Adversarial tests (all in `tests/`)

| Case | Test |
|---|---|
| Ledger modification, reordering, truncation | `engine.test.ts` (tamper), `tamper.test.ts` |
| Wrong / nonexistent entity references | resolution tests; evidence report flags nonexistent ledger refs |
| Prompt injection in references and words | `hardening.test.ts` "injected instructions" |
| Oversized / control-character input | `hardening.test.ts` "adversarial input" |
| Invalid model JSON | `llm.ts` validation (values outside the menu throw) |
| API key leakage | `hardening.test.ts` ledger key check; probe refuses to write |
| Cross-project leakage | owner-scoped listing and writes (`store.ts`, `http.ts`), `tamper.test.ts` store isolation |
| Partial upstream responses | `hardening.test.ts` pagination partial |
| Rate-limit exhaustion and outages | `hardening.test.ts` retry/budget/outage; benchmark failure scenarios |
| Cancellation | `hardening.test.ts` |

## Known limitations

- Rate limits and the response cache are per instance.
- Without KV configured, storage on serverless is not durable (reported by `/api/health` and the Projects page).
- Share links are bearer links: anyone with the URL can read that brief.
