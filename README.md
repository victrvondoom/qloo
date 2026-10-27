# Tastespec

**Clients say "warm and modern". Tastespec finds out what they mean.**

A Qloo-powered agent for independent interior designers and lighting professionals. It reads what a client *loves* through Qloo's taste graph, measures which kinds of rooms people with that taste choose compared with what's typical in the client's city, and turns the client's vague words into a constraint-safe spec a pro can build. Every line says where it came from.

> Built for the Qloo Agentic Hackathon ("Agents, but with taste"). MIT licensed.

## Status, honestly

| | |
|---|---|
| Qloo integration | Adapter built to the documented contract and unit-tested. **Live calls not yet verified**: the build environment had no key and its proxy blocks Qloo. Run `npm run probe -- Chicago` with a key. |
| Benchmark | Measured on a seeded **synthetic** world (60 scenarios, 4 seeds). Not real clients, not real Qloo data. See `reports/benchmark-summary.md`. |
| Human preference study | Not run. Protocol in `docs/EVALUATION_METHODOLOGY.md`. |
| Tests | 64 unit/property/adversarial tests, 20 end-to-end browser checks (fixture mode). |
| Deployment | Not verified from this workspace. Steps: `docs/DEPLOYMENT.md`. |

## The problem inside the problem

Taste agents assume the user's words carry their preferences. In design work they don't: *warm*, *modern*, *cozy* and *clean* each have several professional meanings ("warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one). The pro guesses and finds out at the walkthrough. Clients can't describe rooms, but they can name the bands, shows, hotels and brands they love, and **Qloo knows which places people with that taste choose. Places are rooms.**

## What it does

1. **Resolves** each reference with `GET /search`. Weak matches are abstained on, never silently used; same-name collisions are flagged; the pro can pin a candidate.
2. **Fetches evidence** with `GET /v2/insights`: places for the client's taste neighbourhood in their city, the city's places with no taste signal (the baseline), and cross-domain taste tags.
3. **Measures** which atmospheres (low glow, clean & minimal, vintage character …) are over-represented, as a Beta-posterior lift with a probability attached.
4. **Decodes the words**: picks the reading of each word that the evidence supports.
5. **Builds the spec** from a versioned rulebook, with hard constraints the evidence can't override (a client who said "warm" never gets light cooler than 3000K).
6. **Asks one question** only when the answer is uncertain and expected to change the spec.
7. **Abstains or degrades** visibly: no usable evidence → literal reading, no personalisation; Qloo down → `UPSTREAM_UNAVAILABLE`.
8. **Records everything** in a SHA-256 hash-chained ledger and a decision trace, and classifies every line as evidence-supported, derived, client-stated or unsupported.

## What the synthetic benchmark shows

Headline seed (`reports/benchmark-summary.md`), agreement with a synthetic oracle that applies the same rulebook to each client's known latent taste:

| System | Agreement (95% CI) | Warm-light violations |
|---|---|---|
| B0 literal words only | 0.39 [0.32, 0.46] | 0% |
| B2 Qloo evidence only | 0.78 [0.73, 0.83] | 26% |
| **B3 Tastespec** | **0.88 [0.84, 0.91]** | **0%** |
| B4b without the city baseline | 0.73 [0.68, 0.79] | 0% |

Across four seeds: B3 0.76–0.88 vs B0 0.39; evidence alone breaks the warm-light constraint in 23–43% of warm briefs, Tastespec in 0%. Entity accuracy 22/22, correct abstention 3/3, failure handling 4/4, evidence completeness 100%, invariant violations 0. **Not shown:** that the clarifying question improves accuracy (gain −0.07 to +0.04, CIs span zero), or anything about real clients. Details: `docs/EVALUATION_METHODOLOGY.md`.

## Try it (judges)

1. **Proof Lab** (`/lab`): run Maya vs Jordan (same words, different loves); press **Without Qloo** to recompute from words alone; change one favourite; run the five challenges (ambiguous, conflicting, no evidence, hard constraint, simulated outage); inspect any brief.
2. Open a brief: basis and confidence on every line, the execution trace, the ledger. Press **Verify chain**, or download the bundle, edit it and upload it at `/verify`.
3. `/method` explains the pipeline and prints the lexicons.

## Run it

```bash
npm ci
cp .env.example .env.local           # QLOO_API_KEY (required), ANTHROPIC_API_KEY (optional)
npm run probe -- Chicago             # live check → reports/qloo-live-probe.json
npm run dev
```

Offline, synthetic: `QLOO_MODE=fixture npm run dev` (every page is labelled FIXTURE).

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Next config) |
| `npm test` | Unit, property, adversarial and tamper tests (Vitest) |
| `npm run build` | Production build |
| `npm run test:e2e` | Browser tests against the build in fixture mode (Playwright + Chromium) |
| `npm run benchmark` | Synthetic benchmark → `reports/` (`-- --seed=N`, `-- --with-llm`) |
| `npm run probe -- City` | Live Qloo probe (needs a key) |
| `npm run verify` | All of the above except the probe |

## Documentation

`docs/ARCHITECTURE.md` · `docs/QLOO_INTEGRATION.md` · `docs/EVIDENCE_MODEL.md` · `docs/EVALUATION_METHODOLOGY.md` · `docs/SECURITY.md` · `docs/DEPLOYMENT.md` · `docs/ENGINEERING_AUDIT.md` · `docs/SUBMISSION.md`

## Limits

- Qloo affinities describe aggregate tastes of people who like the same things, not facts about the client.
- The fingerprint depends on the tags and keywords Qloo returns for places, which only a live probe can confirm.
- Light levels are typical starting ranges, not a lighting calculation.
- Only public names of things a client loves and a city are sent to Qloo.
