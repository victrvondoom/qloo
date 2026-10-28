# Tastespec

**“Warm and modern” means a different room for every client.**

Paste what a client wrote. Tastespec reads what they love through Qloo's taste graph, finds the rooms people with that taste actually choose, and hands an interior or lighting designer a buildable spec, a room drawn from that spec, a hand-over document and a link for the client. Every line is traced to evidence.

> Built for the Qloo Agentic Hackathon ("Agents, but with taste"). MIT licensed.

![The landing film: two clients say the same words and get two different rooms](public/media/tastespec-poster.jpg)

*The 27-second film (`public/media/tastespec-film.webm`) is drawn live from two demo briefs on synthetic data.*

## Try it in two commands (Windows, macOS, Linux)

```bash
npm ci
npm run demo          # → http://localhost:3000, synthetic data, no keys needed
```

Needs Node.js 22.13+ (it uses Node's built-in SQLite, so there is nothing native to compile). Or `docker compose up`. For live Qloo evidence add `QLOO_API_KEY` to `.env.local` (see `.env.example`), then `npm run build && npm run serve`.

## The problem inside the problem

Taste agents assume the user's words carry their preferences. In design work they don't: *warm*, *modern*, *cozy* and *clean* each have several professional meanings ("warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one). The designer guesses and finds out at the walkthrough; a chatbot that only hears the words gives everyone who says them the same room. Clients can't describe rooms, but they can name the bands, shows, hotels and brands they love, and **Qloo knows which places people with that taste choose. Places are rooms.**

## What a designer does with it

1. **Paste the client's message.** The draft (words, loves, city, room, trade) fills in as you type, in your browser. With a Claude key, "Read with Claude" tidies it, and anything not in the message is dropped.
2. **Press Build.** The agent's graph narrows live on screen: what they said → what it could mean → the rooms their taste chooses (vs typical places in their city) → atmospheres → decisions → spec.
3. **Read the brief.** A room drawn from the spec, with the spec's own scenes on a dimmer (dim-to-warm included); one question if the evidence can't call it; every line with its basis, confidence and the literal reading it replaced.
4. **Go deeper.** Mainstream → Curated → Deep cut asks the same taste question among less popular places (both sides of the comparison), for reference rooms nobody else will have shown the client.
5. **Hand it over.** Direction, scenes and a zone-by-scene dimming table, palette, reference places, a buying list by category, an installer checklist, open risks, a client note. Print to PDF.
6. **Send the client their room.** A revocable link: they see the plan in plain words on their phone, answer the question, react to lines; you watch it land in the activity feed.
7. **Prove it.** Pathways traces any line back to the words that produced it; the ledger verifies in any browser; replay rebuilds the spec from stored evidence.

## How it stays honest

- **No memory, one graph.** The agent keeps nothing between clients; everything it knows about this one is the narrowing graph, stored with the brief.
- **Evidence or nothing.** Each atmosphere is a Beta-posterior lift of taste-matched places over the city baseline. No usable evidence → no personalisation: the brief says so and uses the literal reading. Qloo down → `UPSTREAM_UNAVAILABLE`, visibly.
- **Constraints the evidence can't override.** A client who said "warm" never gets light cooler than 3000K.
- **Models can't invent.** Spec values come only from a versioned rulebook. Claude's outputs are schema-checked and grounded: a draft keeps only what's in the message, prose is rejected if any number or name isn't in the brief's facts.
- **Everything recorded.** Every Qloo call, decision, model call and client action goes into a SHA-256 hash-chained ledger; every line is classified as evidence-supported, derived, client-stated or unsupported.
- **Synthetic is labelled.** Demo data says so on every screen, in the film, on the client page and in every brief.

## What the synthetic benchmark shows

Agreement with a synthetic oracle that applies the same rulebook to each scenario's known latent taste (60 scenarios, seeded world, not real clients or Qloo data; `reports/benchmark-summary.md`):

| System | Agreement (95% CI) | Warm-light violations |
|---|---|---|
| B0 literal words only | 0.39 [0.32, 0.46] | 0% |
| B2 Qloo evidence, no safeguards | 0.78 [0.73, 0.83] | 26% |
| **B3 Tastespec** | **0.88 [0.84, 0.91]** | **0%** |
| B4b without the city baseline | 0.73 [0.68, 0.79] | 0% |

Across four seeds B3 is 0.76–0.88 vs B0 0.39. **Not shown:** that the clarifying question improves accuracy (CIs span zero), or anything about real clients. The oracle shares our rulebook, so this measures taste recovery through the mapping, not design quality. Details: `docs/EVALUATION_METHODOLOGY.md`.

## Status, honestly

| | |
|---|---|
| Qloo integration | Built to the documented contract and unit-tested. **Live calls not verified from this workspace** (no key; the proxy blocks Qloo). Run `npm run probe -- Chicago` with a key; it also checks the popularity filter the depth levels use. |
| Tests | 131 unit/property/adversarial tests (both database drivers included) and a 29-check browser suite (designer flow, client link round-trip, isolation, tampering, mobile, dark mode). |
| Human preference study | Not run. Protocol in `docs/EVALUATION_METHODOLOGY.md`. |
| Deployment | Not verified from this workspace. Docker, any Node host, or serverless with libSQL/Turso: `docs/DEPLOYMENT.md`. |

## Commands

| Command | What it runs |
|---|---|
| `npm run demo` | Build once, serve on synthetic data (cross-platform) |
| `npm run dev` / `npm run dev:demo` | Development server (live / synthetic) |
| `npm run serve` | Production server with your `.env` |
| `npm run typecheck` · `npm run lint` · `npm test` | TypeScript · ESLint · Vitest |
| `npm run build && npm run test:e2e` | Browser tests against the build (Playwright + Chromium) |
| `npm run benchmark` | Synthetic benchmark → `reports/` (`-- --seed=N`, `-- --with-llm`) |
| `npm run probe -- City` | Live Qloo probe (needs a key) |
| `npm run film` | Record the landing film → `public/media/` |
| `npm run verify` | Typecheck, lint, tests, build, e2e, benchmark |

## Documentation

`docs/ARCHITECTURE.md` · `docs/QLOO_INTEGRATION.md` · `docs/EVIDENCE_MODEL.md` · `docs/EVALUATION_METHODOLOGY.md` · `docs/SECURITY.md` · `docs/DEPLOYMENT.md` · `docs/ENGINEERING_AUDIT.md` · `docs/SUBMISSION.md`

## Limits

- Qloo affinities describe aggregate tastes of people who like the same things, not facts about the client.
- The fingerprint depends on the tags and keywords Qloo returns for places, which only a live probe can confirm.
- The room drawing illustrates the spec (light colour, sources, scenes); it is not a rendering of the client's room. Light levels are starting ranges, not a lighting calculation.
- Only public names of things a client loves and a city are sent to Qloo; the pasted message never is.
