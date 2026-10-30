# Specification verification

`src/lib/verify-spec.ts` is a deterministic checker over a compiled specification. It is not a model, it does not grade taste, and it never says a design is compliant. Each check is an invariant that can be tested alone; each finding points at a line and, where one exists, says how to repair it. Press **Verify specification** in a brief's Specification tab, or call `GET /api/briefs/:id/spec`.

## Result

Per finding: `ERROR`, `WARNING`, `NEEDS_REVIEW` or `PASS`, with the line id, a code, a message and a repair. Per dimension: `PASS`, `FAIL`, `NEEDS_REVIEW`, `INSUFFICIENT_EVIDENCE` or `NOT_APPLICABLE`. Document status: `CHECKS_PASSED`, `CHECKS_PASSED_REVIEW_OPEN` or `DRAFT_CHECKS_FAILED`. The statement "not a certificate of compliance, safety or suitability" travels with every result.

| Dimension | What is checked |
|---|---|
| A Constraint correctness | each written limit (colour temperature, CRI, dimming floor, lux) against its line; the warm-word floor; units (K, Ra, %, lx) and plausible ranges; a limit with no line |
| B Evidence integrity | evidence-based lines cite requests; every cited request is carried in the package and, when the brief is available, is a Qloo request in its ledger; the ledger chain and head verify; synthetic data and missing evidence are flagged |
| C Interpretation provenance | each line links to a registered rule of the current rulebook; stale rulebook versions are flagged |
| D Specification consistency | dim-to-warm without a dimming range; a lux target outside the room's typical range; very high CRI at very low colour temperature; none found is reported as a pass |
| E Professional review | what needs information Qloo and the client brief cannot give: the light level needs a lighting calculation, dimming needs fitting compatibility, lines with no evidence, low confidence, unanswered or ambiguous questions |
| F Revision safety | an accepted decision whose line changed; a limit the previous version met and this one breaks. Not applicable without a previous version |
| G Unknown-data disclosure | unknowns listed, not-certified statement present, measured-looking values carry assumptions |

## What it cannot tell you

That the specification is right for the room. It checks consistency with what the client wrote, with the cited evidence and with the rulebook, and it lists what a professional still has to decide. It does not know the room, the fittings, the budget or the local rules.

## Tests

Forged limit violations, wrong units, impossible values, missing fields, evidence not carried or not in the ledger, a tampered ledger, stale rulebooks, an empty unknowns list, inconsistent lines, and the no-evidence case (`INSUFFICIENT_EVIDENCE`, not a pass): `tests/spec-engine.test.ts`.

## Change impact (the revision-safety dimension in use)

`spec-diff.ts` compares two compiled specifications semantically. A line is changed only if its machine value (or, for text lines, its text ignoring case, punctuation and spacing) changed; same value on different evidence, under different constraints, or with only reworded explanation are reported separately. Each changed value is attributed to a written limit, the evidence, or the client's words. Accepted decisions on changed lines become `NEEDS_REVIEW`. `POST /api/briefs/:id/revise` runs the real agent on the modified brief and records a proposed revision; accept, reject, or return to the previous version (`POST /api/revisions/:id`). Experiments A to E (swap a reference, change the colour-temperature requirement, remove all Qloo evidence, contradictory requirements, pin an ambiguous entity) are tests.

## Evidence sensitivity

`sensitivity.ts` turns the leave-one-out influence map (Qloo is asked again without each reference, with the same geography, baseline, tags, answer and written limits) into a verdict per line (robust, hangs on one reference, sensitive, can't test) and per reference, and re-checks the client's limits in every recomputation. The stability index is the share of (usable reference, line) pairs unchanged when that reference is removed: a descriptive count, not a validated confidence score. It costs one Qloo query per reference (cached, ledgered).
