# Benchmark summary

> **SYNTHETIC benchmark (seeded world, not Qloo data, no human labels).** Generated 2026-10-28T15:09:47.159Z · commit `3facf09` · seed 13 · 60 scenarios · rulebook-2026.10.28 · LLM: not used.
> These numbers test the pipeline's inference, abstention, constraints and reliability on synthetic data. They are **not** evidence that real clients prefer Tastespec's output: that needs human labels and live Qloo data, which have not been collected (see `docs/EVALUATION_METHODOLOGY.md`).

## Spec agreement with the synthetic oracle

The oracle applies the same rulebook to the synthetic client's latent taste, so this measures how well each system *recovers* taste, not whether the rulebook is good design.

| System | Mean line agreement (95% CI) | All lines match (95% CI) | Warm-floor violations (95% CI) |
|---|---|---|---|
| B0 Literal words only | 0.39 [0.32, 0.46] (n=55) | 0.04 [0.01, 0.12] (n=55) | 0.00 [0.00, 0.08] (n=47) |
| B1 LLM only (no Qloo) | not run (needs ANTHROPIC_API_KEY and --with-llm) | — | — |
| B2 Qloo evidence only (ignores words) | 0.76 [0.72, 0.80] (n=55) | 0.18 [0.10, 0.30] (n=55) | 0.43 [0.30, 0.57] (n=47) |
| B3 Tastespec full | 0.84 [0.79, 0.89] (n=55) | 0.44 [0.31, 0.57] (n=55) | 0.00 [0.00, 0.08] (n=47) |
| B4a Tastespec, no clarification | 0.84 [0.79, 0.89] (n=55) | 0.44 [0.31, 0.57] (n=55) | 0.00 [0.00, 0.08] (n=47) |
| B4b Tastespec, no city baseline | 0.78 [0.74, 0.83] (n=55) | 0.20 [0.12, 0.32] (n=55) | 0.00 [0.00, 0.08] (n=47) |

## Behaviour

| Metric | Result |
|---|---|
| Latent taste recovery: top atmosphere in true top-2 | 0.98 [0.90, 1.00] (n=55) |
| Mean top-2 overlap with true taste | 0.85 [0.79, 0.92] (n=55) |
| Entity match accuracy (labelled references incl. abstain cases) | 1.00 [0.85, 1.00] (n=22) |
| Correct abstention when nothing resolves | 1.00 [0.44, 1.00] (n=3) |
| False abstention on dense evidence | 0.00 [0.00, 0.09] (n=37) |
| Sparse-city outcomes | weak-0: COMPLETE, weak-1: COMPLETE, weak-2: COMPLETE |
| Irrelevant-input stability (identical spec) | 1.00 [0.61, 1.00] (n=6) |
| Questions asked | 3 of 55 eligible briefs |
| Questions whose answer changed the spec | 0.00 [0.00, 0.56] (n=3) |
| Expected vs realised lines changed per question | 1.52 vs 0.00 |
| Oracle agreement gain per question | 0.00 [0.00, 0.00] (n=3) |
| Failure scenarios handled correctly | 1.00 [0.51, 1.00] (n=4) |
| Normal scenarios completed without error | 1.00 [0.94, 1.00] (n=56) |
| Evidence completeness (lines with full provenance) | 1.00 [0.99, 1.00] (n=400) |
| Invariant violations | 0 |
| Orchestration latency p50 / p95 (synthetic transport) | 28 / 39 ms |
| Qloo calls per brief p50 / p95 / max | 8 / 9 / 12 |

## Personalisation sensitivity (same words, different taste)

Different output is not automatically better. *Justified* = a differing line where each client's value equals their own oracle.

| System | Pairs | Oracle differs | System differs | Differing lines | Justified rate (95% CI) |
|---|---|---|---|---|---|
| B0 | 9 | 9 | 0 | 0 | — |
| B2 | 9 | 9 | 9 | 41 | 0.66 [0.51, 0.78] (n=41) |
| B3 | 9 | 9 | 9 | 38 | 0.87 [0.73, 0.94] (n=38) |
| B4a | 9 | 9 | 9 | 38 | 0.87 [0.73, 0.94] (n=38) |

## Not measured

- **preferenceAlignmentWithHumans**: NOT MEASURED: no independent human preference labels have been collected. Protocol: docs/EVALUATION_METHODOLOGY.md.
- **liveQloo**: NOT MEASURED: no Qloo key/network in the benchmark environment. Run `npm run probe` and the live checks with a key.
- **B1**: NOT RUN: needs ANTHROPIC_API_KEY and --with-llm.

Reproduce: `npm run benchmark` (add `-- --seed=N` for another world; `-- --with-llm` with `ANTHROPIC_API_KEY` to include B1).
