# Autonomous session record

Branch `claude/sweet-cori-f9x9j0`. Starting commit `932dd08`. No Qloo key and no network to Qloo in this environment, so live verification is **blocked**; nothing below was run against live Qloo.

## What was already there (from earlier sessions)

Most of the requested Proof Engine existed before this session: hardened Qloo adapter (retries, deadline, budget, cancellation, secret-safe ledger), typed agent states with a decision trace, evidence-linked spec lines with a literal baseline, replay, a hash-chained ledger, the benchmark harness (B0, B2, B3, B4 ablations; B1 needs an LLM key), the Proof Lab and Same Words comparison, owner-scoped storage, and e2e tests. This session audited those against the brief and filled the gaps below.

## Baseline (start of session)

typecheck clean · lint clean · 150 unit tests pass · build ok · 35/35 e2e (after the 20-feature commit).

## Gaps found and closed

| Gap | Change | Verified by |
|---|---|---|
| Only the warm-*word* floor existed; a number the client wrote ("2700K–3000K") could be overridden by evidence | `src/lib/constraints.ts`; `BriefInput.cctRange`; rulebook clamps; threaded through spec, questions, replay, influence, duet, literal baseline; intake parses it; Composer shows a "Hard limit" chip; `validateBrief` rejects a violation | `tests/constraints.test.ts` (12), e2e, benchmark |
| No tests for corrupted payloads, injected text in place data, thin local coverage, simultaneous runs | `tests/adversarial.test.ts` (9): 2000 random shapes through the parsers, corrupted responses, all-garbage abstention, injection, widening disclosed, no-coverage abstention, 6 parallel runs, forged evidence | passes; mutation-checked by the tamper hook actually changing results (cache must be cleared, noted in the test) |
| Benchmark had no written-range scenarios | 4 `explicit_range` scenarios (64 total) and a `writtenRangeViolationRate` metric; oracle and B0 given the range, B2 deliberately not | `reports/benchmark-summary*.md` regenerated for 4 seeds |
| Command palette could drop the first keystrokes (focus set after 10 ms) | input uses `autoFocus` | e2e (was failing intermittently) |
| e2e "two rooms" count was racy once the duet panel loaded | asserts 2 client rooms + 1 duet room after the panel renders | 3 consecutive full runs |

## Results now

typecheck clean · lint clean · 171 unit tests · build ok · 36/36 e2e (three consecutive runs).

Benchmark (synthetic, seed 20261028, 59 scorable of 64): B0 0.41, B2 0.78 (26% warm-light violations), B3 0.88 (0%). Four seeds: B3 0.77–0.88. Written-range check has n=4, so its intervals are wide; the 300-case property test is the stronger evidence. Not measured: human preference, live Qloo, B1 (LLM-only; needs `ANTHROPIC_API_KEY` and `--with-llm`).

## Commits this session

1. Explicit constraints, adversarial tests, benchmark scenarios, palette and e2e fixes.
2. Regenerated benchmark reports at that commit, docs and this record.

## Blockers

- Live Qloo verification (`npm run probe`) needs `QLOO_API_KEY` and network access to `hackathon.api.qloo.com`.
- B1 needs an Anthropic key. Not run, not faked.
- No public deployment was made or tested; no live URL is claimed.
- Human preference study not run.

## Next

1. Run `npm run probe` and a live brief once a key is available; capture sanitized diagnostics.
2. Collect human preference labels (protocol in `docs/EVALUATION_METHODOLOGY.md`).
3. Let a client write other hard limits (CRI floor, dimming) the way the colour-temperature range works.
4. Deploy and test the public URL independently.
