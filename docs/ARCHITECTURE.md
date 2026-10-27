# Architecture

## Overview

```mermaid
flowchart TB
  subgraph Browser
    UI[Pages: Home, Proof Lab, Brief, Compare, Projects, Verify, Method]
    V[WebCrypto ledger verifier]
  end
  subgraph Server["Next.js route handlers (Node)"]
    RUN["POST /api/run (NDJSON stream)"]
    W["answer / decision / outcome / DELETE (owner only)"]
    LIT["POST /api/literal (B0, no Qloo)"]
    B["GET /api/briefs/:id, /bundle"]
    H["GET /api/health"]
  end
  subgraph Engine[src/lib]
    AG[agent.ts state machine]
    QC[qloo/client.ts]
    RS[resolve.ts]
    FP[fingerprint.ts]
    WD[words.ts]
    SP[spec.ts + rulebooks]
    EV[evidence.ts]
    LG[ledger.ts]
    LLM[llm.ts optional]
  end
  QLOO[(Qloo hackathon API)]
  FIX[(fixture transport, synthetic)]
  ANTH[(Claude API, optional)]
  KV[(Upstash / Vercel KV, or file store)]
  UI --> RUN & W & LIT & B
  V --> B
  RUN --> AG
  AG --> RS & QC & FP & WD & SP & LLM & LG
  QC -->|live| QLOO
  QC -->|QLOO_MODE=fixture| FIX
  LLM --> ANTH
  RUN & W --> KV
  B --> EV
```

## Agent orchestration

```mermaid
stateDiagram-v2
  [*] --> INTAKE
  INTAKE --> NORMALIZE
  INTAKE --> FAILED: invalid input
  NORMALIZE --> RESOLVE_ENTITIES
  RESOLVE_ENTITIES --> FETCH_QLOO: ≥1 reference used
  RESOLVE_ENTITIES --> ASSESS_EVIDENCE: none usable / search down
  FETCH_QLOO --> ASSESS_EVIDENCE
  ASSESS_EVIDENCE --> INTERPRET
  note right of ASSESS_EVIDENCE
    UPSTREAM_UNAVAILABLE or INSUFFICIENT_EVIDENCE
    ⇒ evidenceUsable = false ⇒ literal spec, no question
  end note
  INTERPRET --> CHECK_CONSTRAINTS
  CHECK_CONSTRAINTS --> GENERATE_SPEC
  GENERATE_SPEC --> SIMULATE_ALTERNATIVES
  SIMULATE_ALTERNATIVES --> CLARIFY_IF_NEEDED: expected change ≥ 1, entropy ≥ 0.5 bits
  SIMULATE_ALTERNATIVES --> COUNTER_TEST
  CLARIFY_IF_NEEDED --> COUNTER_TEST
  COUNTER_TEST --> VALIDATE
  VALIDATE --> FAILED: invariant violated
  VALIDATE --> PERSIST
  PERSIST --> COMPLETE
  PERSIST --> NEEDS_CLARIFICATION: question pending
  NEEDS_CLARIFICATION --> COMPLETE: client answers (no new Qloo calls)
  INTAKE --> CANCELLED: client disconnects (any step)
```

Budgets per run: 55 s wall clock, 45 Qloo HTTP attempts, ≤3 attempts per request, backoff never past the deadline. Every step appends a `TraceStep` (state, tool, decision, rationale, inputs, output, validation, ms, retries, ledger ids). The trace records decisions, not model reasoning.

The LLM-only counter-test starts in parallel at NORMALIZE and never sees Qloo data; it's joined at COUNTER_TEST with a timeout.

## Key modules

| Module | Responsibility |
|---|---|
| `agent.ts` | State machine, budgets, cancellation, terminal outcomes, invariant validation, answer/review/outcome updates |
| `qloo/client.ts` | Typed adapter: pagination, retries, deadlines, cancellation, request ids, response hashing, ledgering, typed errors |
| `resolve.ts` | Entity resolution: type hints, exact/near/abstain, collision flags, pinning, confidence |
| `fingerprint.ts` | Lexicon classification of places; Beta lift; evidence-gated scoring; minimum-change answer update |
| `words.ts` | Client-word readings; evidence-weighted decoding |
| `spec.ts`, `rulebooks/` | Versioned rulebook, constraints, provenance per line, literal baseline, question planning |
| `evidence.ts` | Line classification and citation cross-checks |
| `ledger.ts` | SHA-256 hash chain, verification (optionally against a committed head) |
| `store.ts`, `owner.ts` | Owner-scoped persistence (KV or file) |

## Evaluation pipeline

```mermaid
flowchart LR
  S[benchmarks/scenarios.ts: 60 scenarios, 12 categories] --> W[benchmarks/world.ts: seeded synthetic world]
  W --> R[benchmarks/run.ts]
  R --> B0[B0 literal] & B2[B2 evidence only] & B3[B3 full + simulated answer] & B4a[B4a no question] & B4b[B4b no baseline]
  R -.optional --with-llm.-> B1[B1 LLM only]
  B0 & B1 & B2 & B3 & B4a & B4b --> M[Metrics + CIs]
  O[Oracle: rulebook on latent taste] --> M
  M --> J[reports/benchmark-results.json]
  M --> MD[reports/benchmark-summary.md]
```

See `EVALUATION_METHODOLOGY.md` for what these numbers can and cannot show.
