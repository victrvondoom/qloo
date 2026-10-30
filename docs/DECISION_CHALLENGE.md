# Decision challenge, review, and the measurements behind them

The question this answers: *"I don't agree with this recommendation. Why did you choose it, what evidence supports it, what are my alternatives, and can you safely change it without breaking my requirements?"*

## Challenge engine (`src/lib/challenge.ts`, `POST /api/briefs/:id/challenge`, Specification tab)

Every operation names a real specification line and is computed from the decision record, not written afterwards.

| Operation | What it does |
|---|---|
| **Why this?** | The rule and rulebook version; what decided the line (a written limit, Qloo evidence with the rulebook's margin to the runner-up and the atmospheres that drove it, the client's answer, their words, or no evidence); the client's statements; the evidence rows and the Qloo request numbers (all real ledger entries); each constraint and whether it held; the literal reading; every rulebook alternative with a verdict and reasons; what still needs information |
| **Why not that?** | Takes a typed alternative (`2700K`, `CRI 97`, `5%`, `250 lux`, or a rulebook option), normalises it, checks the client's written limits and the warm-word rule, then compiles the specification with the alternative and runs the verifier twice to list the findings it would add and resolve. Verdicts: `ALLOWED`, `BLOCKED` (with the limit it breaks), `UNSUPPORTED` (no rule: lumens, materials the rulebook doesn't know, which would be an unsupported assumption), `SAME` |
| **What if?** | `what_if` runs the revision engine: the brief is changed, the real agent reruns, and a semantic diff is proposed (accept, reject or return) |
| **Prove it** | The deterministic verifier's findings for that line, and the document status |
| **Repair it** | Only for a line with errors caused by a written limit: the smallest valid correction (clamp into the range, raise to the minimum, rewrite to reach the floor), with its consequences. If the error isn't explained by a limit, or the fix would cause a new error, nothing is proposed |

Nothing changes until **Apply**: a separate, explicit call that re-evaluates the alternative or repair on the server (a client-supplied value is never trusted), refuses if the version is approved, and records a designer revision in the evidence ledger. The compiled line then shows `override` with the original value, and verification raises `DESIGNER_OVERRIDE` because the cited evidence supported the original.

## Professional review board (`src/lib/review.ts`, `POST /api/briefs/:id/review`)

Per line: `DRAFT`, `NEEDS_REVIEW`, `APPROVED`, `REVISION_REQUESTED`, `REJECTED`. Actions: accept, request clarification (reason required), propose alternative (evaluated by the challenge engine first; invalid ones change nothing and return the failed requirements), reject (reason required), reopen. Impossible transitions and accepting a line with verification errors are refused. Each entry records who acted (the owner), when, the specification version, before and after values, the verification outcome, evidence ids, findings and a ledger entry. **Nothing the agent proposes is approved by default.** Final approval needs every line approved and no verification errors, records that *a person reviewed this exact version* (not a certification), and locks it: further decisions are refused and a change becomes a revision. The review history is exported in the HTML and JSON.

## Clarification (`src/lib/clarify.ts`, `GET /api/briefs/:id/clarify`)

The agent already asks at most one question, only when simulating both answers changes at least one expected line and the evidence can't call it. The panel shows its working: every contrast considered with why it was asked or held back, the lines each answer would change, and Answer or Defer. The metric is a **decision-impact heuristic** (expected changed lines weighted by a prior from the evidence), not calibrated information gain. `npm run clarify-eval` compares it with a naive "ask whenever any contrast would change anything" policy on the synthetic benchmark clients; that baseline is one we defined, so the reduction is a statement about this policy on this fixture, not about real clients (`reports/clarification-eval.json`).

## Query budget (`qloo/client.ts`, `npm run query-budget`)

The Qloo client keeps a bounded (300 entries), time-limited (6 h) response cache keyed by mode and request only, and now merges identical in-flight requests; a cancelled or failed leader never leaves a waiter stuck. Keys and entries carry no user or owner identifier. `npm run query-budget` measures, on the fixture transport, the same sensitivity workload with and without them: 42 transport calls without, 21 with; two identical concurrent searches 2 calls without, 1 with; results identical and written limits preserved. These are request counts against a synthetic world, **not** live Qloo latency, quota or cost. The per-run call budget and deadline were already enforced.

## Robustness lab (`src/lib/robustness.ts`, `npm run robustness`)

Seeded perturbations through the real pipeline: evidence removal, evidence corruption (six kinds, plus corrupted payloads on the real run path), conflicting taste, entity ambiguity, constraint mutation, geographic shift, irrelevant text, paraphrase, tool failure (401, 429, timeout, malformed). Invariants I1 to I7 are in `reports/robustness-summary.md`. The lab was checked to be able to fail: disabling the verifier's limit check, or the rulebook's clamp, produces violations.

## Tests

`tests/challenge.test.ts` (challenges over CCT, CRI, dimming, lux, missing evidence, conflicting instructions, unsupported materials, changed favourites, ambiguous references, corrupted evidence; the review state machine; locking; export), `tests/robustness.test.ts`, `tests/query-budget.test.ts`, `tests/reliability.test.ts` (ten concurrent users, long brief, twelve repeated revisions then export, malformed stored project, duplicate submissions), and the browser tests "challenge a line", "two-client specification challenge", and four responsive widths.
