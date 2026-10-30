# Benchmark summary

> **SYNTHETIC benchmark (seeded world, not Qloo data, no human labels).** Generated 2026-10-30T06:39:48.828Z · commit `fe8f4af` · seed 11 · 64 scenarios · rulebook-2026.10.28 · LLM: not used.
> These numbers test the pipeline's inference, abstention, constraints and reliability on synthetic data. They are **not** evidence that real clients prefer Tastespec's output: that needs human labels and live Qloo data, which have not been collected (see `docs/EVALUATION_METHODOLOGY.md`).

## Spec agreement with the synthetic oracle

The oracle applies the same rulebook to the synthetic client's latent taste, so this measures how well each system *recovers* taste, not whether the rulebook is good design.

| System | Mean line agreement (95% CI) | All lines match (95% CI) | Warm-floor violations (95% CI) | Written-range violations (95% CI) |
|---|---|---|---|---|
| B0 Literal words only | 0.41 [0.34, 0.48] (n=59) | 0.03 [0.01, 0.12] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |
| B1 LLM only (no Qloo) | not run (needs ANTHROPIC_API_KEY and --with-llm) | — | — | — |
| B2 Qloo evidence only (ignores words) | 0.72 [0.67, 0.76] (n=59) | 0.15 [0.08, 0.27] (n=59) | 0.23 [0.14, 0.37] (n=47) | 1.00 [0.51, 1.00] (n=4) |
| B3 Tastespec full | 0.77 [0.71, 0.81] (n=59) | 0.25 [0.16, 0.38] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |
| B4a Tastespec, no clarification | 0.77 [0.71, 0.82] (n=59) | 0.25 [0.16, 0.38] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |
| B4b Tastespec, no city baseline | 0.73 [0.68, 0.78] (n=59) | 0.10 [0.05, 0.20] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |

## Behaviour

| Metric | Result |
|---|---|
| Latent taste recovery: top atmosphere in true top-2 | 0.98 [0.91, 1.00] (n=59) |
| Mean top-2 overlap with true taste | 0.82 [0.76, 0.88] (n=59) |
| Entity match accuracy (labelled references incl. abstain cases) | 1.00 [0.85, 1.00] (n=22) |
| Correct abstention when nothing resolves | 1.00 [0.44, 1.00] (n=3) |
| False abstention on dense evidence | 0.00 [0.00, 0.09] (n=37) |
| Sparse-city outcomes | weak-0: NEEDS_CLARIFICATION, weak-1: NEEDS_CLARIFICATION, weak-2: NEEDS_CLARIFICATION |
| Irrelevant-input stability (identical spec) | 1.00 [0.61, 1.00] (n=6) |
| Questions asked | 5 of 59 eligible briefs |
| Questions whose answer changed the spec | 0.60 [0.23, 0.88] (n=5) |
| Expected vs realised lines changed per question | 2.66 vs 1.00 |
| Oracle agreement gain per question | -0.03 [-0.11, 0.06] (n=5) |
| Failure scenarios handled correctly | 1.00 [0.51, 1.00] (n=4) |
| Normal scenarios completed without error | 1.00 [0.94, 1.00] (n=60) |
| Evidence completeness (lines with full provenance) | 1.00 [0.99, 1.00] (n=428) |
| Invariant violations | 0 |
| Orchestration latency p50 / p95 (synthetic transport) | 27 / 32 ms |
| Qloo calls per brief p50 / p95 / max | 8 / 8 / 12 |

## Personalisation sensitivity (same words, different taste)

Different output is not automatically better. *Justified* = a differing line where each client's value equals their own oracle.

| System | Pairs | Oracle differs | System differs | Differing lines | Justified rate (95% CI) |
|---|---|---|---|---|---|
| B0 | 9 | 9 | 0 | 0 | — |
| B2 | 9 | 9 | 9 | 44 | 0.64 [0.49, 0.76] (n=44) |
| B3 | 9 | 9 | 9 | 43 | 0.60 [0.46, 0.74] (n=43) |
| B4a | 9 | 9 | 9 | 43 | 0.60 [0.46, 0.74] (n=43) |

## Not measured

- **preferenceAlignmentWithHumans**: NOT MEASURED: no independent human preference labels have been collected. Protocol: docs/EVALUATION_METHODOLOGY.md.
- **liveQloo**: NOT MEASURED: no Qloo key/network in the benchmark environment. Run `npm run probe` and the live checks with a key.
- **B1**: NOT RUN: needs ANTHROPIC_API_KEY and --with-llm.

Reproduce: `npm run benchmark` (add `-- --seed=N` for another world; `-- --with-llm` with `ANTHROPIC_API_KEY` to include B1).
