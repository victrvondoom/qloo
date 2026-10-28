# Security

## Secrets

- `QLOO_API_KEY`, `ANTHROPIC_API_KEY` and `DATABASE_AUTH_TOKEN` are read on the server only. No `NEXT_PUBLIC_` variables exist; no key reaches the browser.
- The Qloo key is sent only as the `X-Api-Key` header. It is never logged, never written to the ledger, never included in bundles or reports (tested in `tests/hardening.test.ts`; the probe refuses to write a report containing it).
- `QLOO_BASE_URL` must be https with no credentials, query or fragment (`src/lib/env.ts`); a non-hackathon host is reported as a configuration issue.
- `/api/health` reports configuration and database kind, never values or file paths.
- `.env*` files are git- and docker-ignored. `.env.example` contains no values.

## Who can do what

| Actor | How they're recognised | Can |
|---|---|---|
| Designer (owner) | random 128-bit secret in an `httpOnly`, `SameSite=Lax`, `Secure` (production) cookie; briefs store only `SHA-256("owner:" + secret)` | list their briefs; decide lines; answer; explore and apply depth; create, rotate and revoke the client link; read the activity feed; write hand-over prose; delete |
| Anyone with the brief id | 96 random bits in the URL (capability link) | read the brief and its evidence bundle, replay it; nothing else (every write and the activity feed return 403) |
| The client | 144-bit share token in `/c/:token`; only its SHA-256 is stored | see the client view; answer the question; react to lines |

- Listing (`/app`, `/projects`, `GET /api/briefs`) only ever returns the current owner's briefs.
- The client view (`src/lib/share.ts`) excludes the brief id, the owner hash, the pasted message, the ledger and the trace, so revoking the token ends the client's access completely (`GET /api/c/:token` → 404). Creating a new link rotates the token and kills the old one.
- The pasted client message (`sourceText`) is returned only to the owner; read-only views, bundles and client views drop it. It is never sent to Qloo.
- Client actions are ledgered with `via: "client"` and appear in the owner's feed; they can't change anything but the answer and their own reactions.
- Retention: owners can delete a brief, its activity and its generated text together; untouched briefs are removed after `TASTESPEC_RETENTION_DAYS` (default 180).

## Input handling

- Request bodies are capped (24 KB for runs, 12 KB for intake, ≤4 KB for writes) and must be JSON.
- `cleanInput` strips control characters, caps lengths (label 40, city 60, words 30, references 80, pasted message 4,000) and counts (5 words, 10 references) and de-duplicates.
- Client text never selects code paths. It goes to Qloo only as search strings and to the model only as JSON-encoded data marked "data, not instructions".
- Model output is schema-constrained **and** re-validated:
  - counter-test values must be menu options; word readings and tag mappings must be known dimension ids (at most two per term, only for terms that were asked about);
  - a draft read from a pasted message keeps only references, words, a city and a name that actually occur in the message (`groundDraft`);
  - hand-over prose is rejected if it contains any number or capitalised name that isn't in the brief's facts, a link, or too many words (`groundingProblems`).
  Invalid output is rejected, never repaired.
- External text (place names, tags, client notes) is rendered by React (escaped). The only `dangerouslySetInnerHTML` is the fixed theme bootstrap script.
- Database access is parameterised everywhere; brief ids and share tokens are format-checked before any query.

## Abuse and cost controls

- Per-IP sliding-window limits: 12 new briefs per 10 minutes (`TASTESPEC_RUNS_PER_10_MIN`), 40 depth explorations, 60 intake reads, 20 prose generations and 120 writes per 10 minutes. These are per server instance, a known limitation; put a platform rate limit in front for real traffic.
- Per-run budgets: 55 s wall clock, 45 Qloo HTTP attempts, ≤3 attempts per request, backoff never past the deadline, 5 MB response cap. A depth exploration is capped at 12 Qloo attempts and 40 s.
- Client disconnect or Cancel aborts in-flight Qloo and model calls (`req.signal`).

## Adversarial tests (all in `tests/`)

| Case | Test |
|---|---|
| Ledger modification, reordering, truncation | `engine.test.ts`, `tamper.test.ts`; e2e uploads a tampered bundle |
| Edited spec after the run | `depth-replay.test.ts` (replay names the changed line) |
| Wrong / nonexistent entity references | resolution tests; evidence report flags nonexistent ledger refs |
| Prompt injection in references and words | `hardening.test.ts` "injected instructions" |
| Invented content in model output | `intake.test.ts` (grounding), `deep.test.ts` (prose grounding), `depth-replay.test.ts` (tag mapper validation) |
| Oversized / control-character input | `hardening.test.ts`; e2e 413 |
| API key leakage | `hardening.test.ts`; probe refuses to write |
| Cross-visitor leakage | `tamper.test.ts`, `db.test.ts` (owner-scoped list/delete/share on both drivers); e2e: another browser gets 403 on every owner route, no list, no pasted message |
| Share link scope and revocation | `depth-replay.test.ts` (client view contents); e2e (client page leaks no id or message; revoked link 404s) |
| Partial upstream responses, outages, rate limits | `hardening.test.ts`; benchmark failure scenarios; depth falls back to local filtering on a rejected parameter |
| Cancellation | `hardening.test.ts` |

## Known limitations

- Rate limits and the Qloo response cache are per instance.
- The brief id is a bearer read link: anyone with the URL can read that brief (not the pasted message, not the activity feed). Share it only with people who may see the evidence.
- Ownership is a browser cookie, not an account: clearing cookies loses edit rights to existing briefs.
