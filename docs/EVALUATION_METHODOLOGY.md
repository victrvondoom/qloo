# Evaluation methodology

## The claim under test

> Tastespec converts ambiguous design language and voluntarily declared cultural preferences into inspectable, constraint-safe professional specifications, and controlled testing shows when Qloo evidence improves the result over alternatives.

Three different kinds of evidence are needed. Only the first is complete today.

| Evidence | Establishes | Status |
|---|---|---|
| Synthetic benchmark (this document) | The pipeline recovers known taste from noisy place data, abstains and degrades correctly, never breaks constraints, keeps provenance complete | **Measured** (`reports/benchmark-*.md`) |
| Live Qloo probe | Real Qloo responses carry the fields the pipeline needs, and two real taste profiles produce distinguishable evidence | **Not run**: no key or network in the build environment. `npm run probe -- Chicago` |
| Human preference study | Real clients or designers prefer Tastespec's specs | **Not run.** Protocol below. |

Different output is not better output. Every comparison below scores against an independent target, never against divergence from the baseline.

## Systems

| Id | System | Notes |
|---|---|---|
| B0 | Literal: words + hard constraints, same rulebook | No Qloo, no model |
| B1 | LLM only: Claude picks from the same option menu given words + loves | Needs `ANTHROPIC_API_KEY` and `--with-llm`; **not run here** |
| B2 | Qloo evidence only: fingerprint → rulebook, client words and word constraints ignored | Isolates what evidence alone does |
| B3 | Tastespec full, with the synthetic client answering the question | |
| B4a | B3 before the question is answered | Exact ablation of clarification (same evidence) |
| B4b | B3 with the city baseline removed | Ablation of the lift normalisation |

All systems share inputs, rulebook version and constraints. The world, scenarios and noise are seeded.

## The synthetic world (`benchmarks/world.ts`)

- Three cities: dense (320 places), medium (110), sparse (14).
- Each place has 0–2 latent atmospheres. Its text uses the app's lexicon only 70% of the time (otherwise off-lexicon synonyms), carries a misleading term from another atmosphere 10% of the time, and has no tags 15% of the time.
- 22 named references with latent preferences (2 atmospheres each), including a same-name collision across entity types.
- Affinity = latent match + popularity + noise, so taste-matched sets are imperfect.
- Failure injection: insights down, search down, one 429, flaky every-third-call 503.

## Scenarios (`benchmarks/scenarios.ts`): 60 across 12 categories

Same words/different taste (18, as 9 pairs), same taste/different words (5), irrelevant changes (6), geography shift (3), weak evidence (3), ambiguous entities (5, labelled), missing coverage (3), conflicting taste (4), explicit constraint (4), unfamiliar words (2), adversarial input (3), upstream failure (4).

## The oracle, and its circularity

For scenarios with known intended references, the oracle spec applies **the same rulebook** to the client's latent taste (and to the word reading that taste favours). Agreement with it therefore measures how well a system **recovers taste through the mapping**. It cannot say whether the mapping is good design; only humans can (see the protocol below). The latent preferences are defined in the world generator, independently of the lexicon and of the system's inference.

## Metrics

| Metric | Definition |
|---|---|
| Oracle agreement | Mean share of spec lines equal to the oracle (95% bootstrap CI over scenarios) |
| Exact match | Share of briefs where every line equals the oracle (Wilson 95% CI) |
| Constraint violations | Warm-word lighting briefs with colour temperature cooler than 3000K ambient |
| Latent recovery | Fingerprint's top atmosphere is in the client's true top two |
| Entity accuracy | Labelled references resolved to the intended entity, or abstained when that is correct |
| Abstention | Correct `INSUFFICIENT_EVIDENCE` when nothing resolves; false abstention on dense evidence |
| Sensitivity, justified rate | Same words, different taste: of the lines that differ, the share where each client's value equals their own oracle |
| Stability | Irrelevant changes (order, case, label) leave the spec identical |
| Clarification | Questions asked, share that changed the spec, expected vs realised change, oracle gain per question |
| Reliability | Failure scenarios ending in the expected status; normal scenarios completing |
| Evidence completeness | Lines with a basis and, for evidence lines, cited atmospheres, Qloo requests and signals |
| Latency, calls | In-process orchestration time (not network); Qloo attempts per brief |

## Results (headline seed 20261028, 59 scorable of 64 scenarios)

From `reports/benchmark-summary.md`:

| System | Oracle agreement (95% CI) | Warm-floor violations | Written-range violations (n=4) |
|---|---|---|---|
| B0 literal | 0.41 [0.34, 0.48] | 0% | 0% |
| B2 evidence only | 0.78 [0.73, 0.82] | 26% | 100% [51, 100] |
| **B3 full** | **0.88 [0.85, 0.91]** | **0%** | **0% [0, 49]** |
| B4a no question | 0.87 [0.84, 0.91] | 0% | 0% |
| B4b no baseline | 0.74 [0.69, 0.80] | 0% | 0% |

The written-range column covers the four `explicit_range` scenarios (the client wrote "2700K–3000K"; taste is bright and clean; no warm word). With n=4 the intervals are wide, so read it as a regression check that the constraint holds (B0 and B3 are given the range, B2 by design is not), not as a rate. The stronger evidence is `tests/constraints.test.ts`, which checks 300 random cases.

Robustness across three more seeds (11, 12, 13; `reports/benchmark-summary-seed-*.md`):

| Seed | B0 | B2 | B3 | B2 violations | B3 violations | Justified differences B2 → B3 |
|---|---|---|---|---|---|---|
| 20261028 | 0.41 | 0.78 | 0.88 | 26% | 0% | 0.72 → 0.84 |
| 11 | 0.41 | 0.72 | 0.77 | 23% | 0% | 0.64 → 0.60 |
| 12 | 0.41 | 0.74 | 0.82 | 23% | 0% | 0.73 → 0.80 |
| 13 | 0.41 | 0.76 | 0.85 | 43% | 0% | 0.66 → 0.87 |

## What the results support

1. **Qloo evidence is necessary** (on synthetic data): every evidence-using system roughly doubles oracle agreement over the literal reading (0.41 → 0.72–0.88). B0 cannot personalise at all: it gives identical specs to clients with different taste in 9/9 pairs.
2. **Evidence alone is unsafe**: ignoring the client's words (B2) breaks the warm-light constraint in 23–43% of warm briefs. Tastespec's fusion keeps it at 0% while matching or beating B2 on agreement in every seed (by 0.04–0.10; on seed 11 the CIs overlap).
3. **The city baseline matters**: removing it (B4b) costs about 0.15 agreement. Raw "what this crowd likes" is confounded with "what everyone likes here".
4. **Abstention, reliability and provenance hold**: 100% correct abstention on missing coverage, 0 false abstentions on dense evidence, every injected failure handled, 100% evidence completeness, 0 invariant violations, entity accuracy 22/22 on labelled references.

## What the results do not support

- **The clarifying question is not shown to help.** Oracle gain per question ranges from −0.07 to +0.04 across seeds, with CIs spanning zero. The benchmark did find and fix two defects: an over-strong answer update that made results worse (−0.04), and over-asking (22 → 9 questions). The planner still over-predicts how many lines an answer will change (1.77 expected vs 0.56 realised). Treat the question as a human-in-the-loop affordance, not a measured accuracy gain.
- **Sparse cities don't abstain.** All three sparse-city scenarios widened the search and completed, with a visible warning that evidence comes from beyond the city. That is the designed behaviour, but whether wider evidence is right for a small town is unmeasured.
- Nothing here measures real Qloo data, real clients, or design quality.

## Human preference protocol (not yet run)

1. Recruit 8–12 participants (designers, or clients briefing a real project) with consent. Each gives their words and 4–6 loves.
2. Generate B0, B1 and B3 specs for each. Present pairs blind and in random order, with system labels removed and values only.
3. Ask: "Which spec better matches the room you had in mind?" (forced choice + 1–5 confidence), and "Which would need fewer changes before you'd sign off?"
4. Report the win rate of B3 vs each baseline with a Wilson CI, and a sign test. With n ≈ 10 the study can detect only large effects; say so.
5. Never derive labels from the rulebook or from Qloo.

## Reproduce

```bash
npm run benchmark                    # headline seed → reports/benchmark-results.json, benchmark-summary.md
npx tsx --tsconfig tsconfig.json benchmarks/run.ts --seed=11          # robustness seeds → *-seed-11.*
ANTHROPIC_API_KEY=... npm run benchmark -- --with-llm                 # adds B1
```
