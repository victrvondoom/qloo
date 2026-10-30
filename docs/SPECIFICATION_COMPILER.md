# Specification compiler

`src/lib/compiler.ts` turns a brief the agent produced into a versioned, auditable specification package. It adds no design opinions: every value is one of the brief's rulebook lines. It gives each line a typed value, the limits that bound it, what the client said, the Qloo requests behind it, the rule that produced it, and what is assumed or unknown. Verification (`docs/SPEC_VERIFICATION.md`), the change simulator and the exports work on this package.

```
client brief → constraint parser → Qloo evidence → interpretation (rulebook) → CompiledSpec → verification → HTML / JSON / CSV
                                                                                   ↑ revise (semantic diff, accept / reject / return)
```

## The package (`tastespec.spec/1`)

| Field | Meaning |
|---|---|
| `specId`, `version`, `parentVersionId`, `versionId` | `versionId` is a hash of the semantic content, so equal content has an equal id and wording alone can't change it |
| `lines[]` | one per rulebook line (see below) |
| `limits` | the numbers the client wrote: colour-temperature range, minimum CRI, dimming floor or need, lux target |
| `evidenceRefs[]` | every cited ledger entry: sequence number, kind, summary, hash. The package carries what it cites |
| `ledgerHead` | the brief's evidence ledger head at compile time |
| `dataMode`, `syntheticNotice` | `fixture` data is labelled SYNTHETIC in the package and in every export |
| `assumptions[]`, `unknowns[]`, `openQuestions[]` | what the document does not know: room dimensions, fitting performance, daylight, budget, local codes; unanswered clarifying questions; unidentified or ambiguous references |
| `notCertified` | present in every package |

A line has: stable `id` and `category`; `requirement` (the rulebook's text); `machine` (`cct` K, `cri` Ra, `dimming` %, `illuminance` lx, or `text`); `hardConstraints`; `clientRefs` (their words, the limits they wrote, the references behind an evidence line); `evidenceIds` and `evidenceSummary` (atmosphere, lift, crowd share vs city baseline); `interpretationRule` (`<rulebook version>:<line id>`); `basis` and `confidence` with an `uncertainty` sentence; `assumptions`; `literalValue` (what the client's words alone would give); `review` (proposed / accepted / revised / rejected); `rationale` (explanation only); and `lineVersion`, a content hash of everything that defines the line's meaning.

## What it does not claim

It is a taste-informed starting point for professional review. It is not an engineering design, not evidence of code compliance and not construction-ready, and it says so on the first page of every export. Machine values are parsed from the rulebook's wording; no fitting performance or measurement is invented. Lumens are not converted to lux. CRI is not presented as the whole of colour quality.

## Exports (`spec-export.ts`)

| Format | How |
|---|---|
| Print-ready HTML | `GET /api/briefs/:id/spec?format=html`; open it and use the browser's Print, Save as PDF. Escapes all content, ships with a restrictive Content-Security-Policy |
| Structured JSON (`tastespec.export/1`) | `?format=json&download=1`; spec, verification, and (when present) the revision diff and sensitivity report |
| CSV, one row per line | `?format=csv&download=1`; spreadsheet formulas are neutralised |

A specification whose checks failed exports only as a **DRAFT** (`DRAFT_CHECKS_FAILED`): the HTML title, banner and every CSV row say so, and a hand-edited JSON that claims to pass is caught when reopened (`reopenExport` recomputes each line's hash and re-runs verification).

Owners get their revision history in the report; anyone with the brief link gets the specification without the client's pasted message.

## Tests

`tests/spec-engine.test.ts` (compile, verify, export, reopen, tamper, DRAFT gating), `tests/revisions.test.ts`, and the browser tests "specification tab…" and "two-client specification challenge…".
