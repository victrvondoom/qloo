# Robustness summary

> **SYNTHETIC.** Perturbations of briefs run through the real pipeline on the fixture and benchmark worlds, seeds 1, 2, 3, 4. Nothing here was run against live Qloo. Generated 2026-10-30T09:27:30.214Z.

| Metric | Value |
|---|---|
| Scenarios | 116 |
| Validly executed | 116 |
| Not executed | 0 |
| Invariant violations | 0 |
| Corruption scenarios | 51 |
| Invalid-evidence rejection rate | 100% |
| Mean / p95 execution time | 59 ms / 85 ms (n=116; in-process, no network) |

| Category | Scenarios | Violations |
|---|---|---|
| evidence removal | 8 | 0 |
| evidence corruption | 52 | 0 |
| evidence conflict | 8 | 0 |
| entity ambiguity | 8 | 0 |
| constraint mutation | 8 | 0 |
| geographic shift | 8 | 0 |
| irrelevant text | 8 | 0 |
| preference paraphrase | 8 | 0 |
| tool failure | 8 | 0 |

No invariant was violated.

Invariants: I1 written limits dominate; I2 no Qloo evidence means no Qloo personalisation; I3 corrupted evidence never gets a clean verification; I4 irrelevant changes change nothing; I5 ambiguous entities are flagged or resolved; I6 failed requests are never evidence and leak no secret; I7 revisions are traceable and the earlier brief is untouched.

Reproduce: `npm run robustness`. Same seeds give the same cases. A rate of 100% on a handful of hand-built corruptions shows the checks exist, not that every possible corruption is caught.
