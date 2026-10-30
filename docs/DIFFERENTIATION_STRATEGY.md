# Differentiation strategy

Scored 1 (poor) to 5 (strong) by judgement, not measurement. Reuse is how much existing Tastespec code carries the feature; risk is implementation risk.

| Candidate | Originality | Technical depth | Demonstrable | Feasible now | Reuse | Qloo-dependent | Risk (5 = low) | Judge visibility | Decision |
|---|---|---|---|---|---|---|---|---|---|
| Specification compiler + typed verification + export | 4 | 4 | 5 | 5 | 5 (rulebook, ledger, replay, constraints) | 3 | 4 | 5 | **Build first** |
| Change impact (semantic diff, versions, accept/reject) | 5 | 4 | 5 | 4 | 4 (runBrief, replay, refine) | 4 | 3 | 5 | **Build second** |
| Evidence sensitivity (leave-one-reference-out as a stability verdict) | 3 (TasteTest, Simpatico do similar) | 3 | 5 | 5 | 5 (`influence.ts`) | 5 | 5 | 4 | **Build third**, framed as verification |
| One 90-second challenge flow joining the above | 4 | 2 | 5 | 4 | 4 (guided tour) | 3 | 4 | 5 | **Build fourth** |
| Held-out pre-registered evaluation | 3 | 4 | 3 | 2 (needs independent data) | 3 | 4 | 2 | 3 | Document the gap; do not fake it |
| Floor plans, 3D walkthrough extensions, budgets, procurement | 1 (Arcon) | 4 | 4 | 1 | 1 | 2 | 1 | 4 | **Do not build** |
| MCP tool server | 1 | 1 | 2 | 4 | 3 | 3 | 5 | 2 | Skip |

## The one workflow

GENERATE (agent run) → VERIFY (typed per-line diagnostics) → CHALLENGE (change a preference or a requirement) → REVISE (semantic diff, accept or reject, return to the previous version) → STRESS (remove one reference) → EXPORT (printable HTML/PDF, JSON, CSV that state their unknowns).

## Principles

- Hard limits written by the client are never changed by evidence or by a revision of something else; a diff must show them unchanged.
- A verification result is a set of checks that were run and their outcomes. It is never a compliance certificate, and the export says so on its first page.
- Fixtures are labelled synthetic everywhere, including in the exported document.
- A "change" is semantic: wording differences are not changes.

## Claims we will not make

That Tastespec beats Arcon, Tastecraft or any competitor on any number; that synthetic agreement is human preference; that a verified specification is engineered, code-compliant or construction-ready.
