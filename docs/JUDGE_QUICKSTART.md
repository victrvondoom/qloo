# Judge quickstart

Five minutes. Every step below runs the real pipeline; nothing is pre-recorded.

## What Tastespec solves

Clients describe rooms with words like "warm" and "modern", and each word has several professional meanings. A tool that only hears the words gives everyone who says them the same room. Tastespec asks what the client *loves*, uses Qloo to find the places people with that taste choose (compared with typical places in their city), and turns the difference into a buildable lighting or finishes specification in which every line traces back to evidence.

## Open it

- **Locally (about a minute):** `npm ci && npm run demo`, then open <http://localhost:3000>. It runs on synthetic data and says so on every screen. Needs Node 22.13+.
- **A public URL:** none is claimed. Deployment is documented in `docs/DEPLOYMENT.md`; if a URL appears in the Devpost entry, `npm run release:check` with `TASTESPEC_PUBLIC_URL` set tests it.

## The three-minute walk-through

Open **Proof Lab** (`/lab`) and use the guided run at the top.

1. **Ambiguity.** Maya and Jordan both say "warm, modern". Press *Show what their words alone produce*: identical specifications, because the words are identical.
2. **References.** Each client's voluntarily given loves. These are the only personal inputs.
3. **Evidence.** *Run both agents.* The page shows its mode: **DEMO** (synthetic fixtures, labelled) or **LIVE** (Qloo API). It shows, per client, which atmospheres their taste neighbourhood over-represents versus the city baseline, with counts.
4. **Reasoning.** The agent's recorded decisions: entity resolution, evidence assessment, interpretation, constraint check, spec generation, validation, each with its check result and the ledger entries it cites. These are decision summaries, not hidden model reasoning.
5. **Specs.** Both specifications side by side; differing rows are highlighted and each line says whether it rests on Qloo evidence, the client's words or a hard constraint.
6. **Remove Qloo.** Recompute Maya's spec from her words alone (same rulebook and constraints, **zero Qloo calls**). A difference shows what the evidence changed; it does not prove the change is better. That is what the study is for.
7. **Challenge.** Type a requirement such as `Use 2700K to 3000K lighting.`, `CRI of at least 95`, `must dim to 5%` or `about 250 lux`. Jordan's taste points cool; the written requirement wins and the line is marked as a hard constraint. Contradictory requirements (for example two different CRI minimums) block the run and tell you to ask the client.
8. **Verify.** Check Maya's evidence ledger. It is a SHA-256 hash chain of every Qloo request and decision, verified in your browser.

Then try: **Same words** (`/compare`) for the Duet merge; **New brief** (`/app`) to paste a real client message; a brief's **Anatomy** tab for the cross-domain measurements; **Study** (`/study`) for the blinded preference study.

## How Qloo affects the decision

Qloo supplies the evidence: which places people with the client's taste choose, in the client's city, against the city's typical places. The agent never lets a model set a spec value; a versioned rulebook maps the measured atmospheres to lighting lines. With no usable Qloo evidence the spec falls back to the literal reading of the client's words, at low confidence, and says so.

## What is synthetic, live, tested or missing

| | Status |
|---|---|
| Everything you see in demo mode | **Synthetic.** Places, ids and scores come from a fictional test world; briefs are labelled FIXTURE. |
| Benchmark (`reports/benchmark-summary.md`) | **Synthetic.** 64 scenarios, 4 seeds, scored against an oracle that uses our own rulebook. It measures taste recovery through the mapping, not design quality. |
| Qloo integration | **CONTRACT TESTED** against recorded-shape stand-ins. **NOT LIVE VERIFIED:** no key or network was available. `npm run verify:qloo-live` does it in one command. |
| Human preference | **Workflow built; ZERO HUMAN RESPONSES.** `reports/human-evaluation-summary.md` says NO HUMAN DATA COLLECTED. |
| LLM-only baseline (B1) | **Not run:** needs an Anthropic key. |
| Public deployment | **NOT DEPLOYED.** Configuration and instructions are ready. |

## Limitations

The evidence is only as good as Qloo's coverage of the client's references and city (it abstains or widens, and says which). Synthetic results say nothing about real clients. The rulebook is our own design judgement. The 3D and 2D rooms are illustrations of the spec, not renderings of the client's room. Lumen totals need room and fitting data, so lumens in a message are noted but never turned into a target.
