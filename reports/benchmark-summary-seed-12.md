# Benchmark summary

> **SYNTHETIC benchmark (seeded world, not Qloo data, no human labels).** Generated 2026-10-30T06:40:19.601Z · commit `fe8f4af` · seed 12 · 64 scenarios · rulebook-2026.10.28 · LLM: not used.
> These numbers test the pipeline's inference, abstention, constraints and reliability on synthetic data. They are **not** evidence that real clients prefer Tastespec's output: that needs human labels and live Qloo data, which have not been collected (see `docs/EVALUATION_METHODOLOGY.md`).

## Spec agreement with the synthetic oracle

The oracle applies the same rulebook to the synthetic client's latent taste, so this measures how well each system *recovers* taste, not whether the rulebook is good design.

| System | Mean line agreement (95% CI) | All lines match (95% CI) | Warm-floor violations (95% CI) | Written-range violations (95% CI) |
|---|---|---|---|---|
| B0 Literal words only | 0.41 [0.34, 0.48] (n=59) | 0.03 [0.01, 0.12] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |
| B1 LLM only (no Qloo) | not run (needs ANTHROPIC_API_KEY and --with-llm) | — | — | — |
| B2 Qloo evidence only (ignores words) | 0.74 [0.68, 0.79] (n=59) | 0.27 [0.17, 0.40] (n=59) | 0.23 [0.14, 0.37] (n=47) | 1.00 [0.51, 1.00] (n=4) |
| B3 Tastespec full | 0.82 [0.76, 0.87] (n=59) | 0.42 [0.31, 0.55] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |
| B4a Tastespec, no clarification | 0.82 [0.77, 0.88] (n=59) | 0.41 [0.29, 0.53] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |
| B4b Tastespec, no city baseline | 0.81 [0.76, 0.85] (n=59) | 0.34 [0.23, 0.47] (n=59) | 0.00 [0.00, 0.08] (n=47) | 0.00 [0.00, 0.49] (n=4) |

## Behaviour

| Metric | Result |
|---|---|
| Latent taste recovery: top atmosphere in true top-2 | 0.92 [0.82, 0.96] (n=59) |
| Mean top-2 overlap with true taste | 0.84 [0.78, 0.90] (n=59) |
| Entity match accuracy (labelled references incl. abstain cases) | 1.00 [0.85, 1.00] (n=22) |
| Correct abstention when nothing resolves | 1.00 [0.44, 1.00] (n=3) |
| False abstention on dense evidence | 0.00 [0.00, 0.09] (n=37) |
| Sparse-city outcomes | weak-0: NEEDS_CLARIFICATION, weak-1: NEEDS_CLARIFICATION, weak-2: NEEDS_CLARIFICATION |
| Irrelevant-input stability (identical spec) | 1.00 [0.61, 1.00] (n=6) |
| Questions asked | 6 of 59 eligible briefs |
| Questions whose answer changed the spec | 0.83 [0.44, 0.97] (n=6) |
| Expected vs realised lines changed per question | 2.34 vs 1.50 |
| Oracle agreement gain per question | -0.07 [-0.24, 0.07] (n=6) |
| Failure scenarios handled correctly | 1.00 [0.51, 1.00] (n=4) |
| Normal scenarios completed without error | 1.00 [0.94, 1.00] (n=60) |
| Evidence completeness (lines with full provenance) | 1.00 [0.99, 1.00] (n=428) |
| Invariant violations | 0 |
| Orchestration latency p50 / p95 (synthetic transport) | 25 / 41 ms |
| Qloo calls per brief p50 / p95 / max | 8 / 8 / 12 |

## Personalisation sensitivity (same words, different taste)

Different output is not automatically better. *Justified* = a differing line where each client's value equals their own oracle.

| System | Pairs | Oracle differs | System differs | Differing lines | Justified rate (95% CI) |
|---|---|---|---|---|---|
| B0 | 9 | 9 | 0 | 0 | — |
| B2 | 9 | 9 | 9 | 45 | 0.73 [0.59, 0.84] (n=45) |
| B3 | 9 | 9 | 9 | 46 | 0.80 [0.67, 0.89] (n=46) |
| B4a | 9 | 9 | 9 | 45 | 0.82 [0.69, 0.91] (n=45) |

## Not measured

- **preferenceAlignmentWithHumans**: NOT MEASURED: no independent human preference labels have been collected. Protocol: docs/EVALUATION_METHODOLOGY.md.
- **liveQloo**: NOT MEASURED: no Qloo key/network in the benchmark environment. Run `npm run probe` and the live checks with a key.
- **B1**: NOT RUN: needs ANTHROPIC_API_KEY and --with-llm.

Reproduce: `npm run benchmark` (add `-- --seed=N` for another world; `-- --with-llm` with `ANTHROPIC_API_KEY` to include B1).
