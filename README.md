# Tastespec

**Clients say "warm and modern". Tastespec finds out what they mean.**

A Qloo-powered agent for the people who build rooms (electricians, lighting designers, decorators, restaurant fit-out teams). It reads what a client *loves* through Qloo's taste graph, looks at the real places people with that taste choose to spend their evenings in, and turns the client's vague words into a spec a pro can build. Every line is traced to evidence in a hash-chained ledger.

> Built for the Qloo Agentic Hackathon ("Agents, but with taste"). MIT licensed.

---

## The hidden problem

Every taste agent assumes the user's words carry their preferences. In design work they don't. *Warm*, *modern*, *cozy* and *clean* are the words clients use most and the ones that tell a pro least. "Warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one. The pro guesses, builds, and finds out at the walkthrough. A chatbot that only hears the words gives everyone who says them the same answer.

Clients can't describe rooms, but they can easily name the bands, shows, hotels and brands they love. **Qloo knows which places people with that taste choose. Places are rooms, and their tags say what those rooms are like.** That's the bridge from cultural taste to a physical spec.

## The 60-second demo

1. Open **Same words test** and press **Run both briefs**. Maya and Jordan both ask for a "warm, modern" living room.
2. Watch each agent work: resolving their loves in Qloo, pulling taste-matched places in Chicago, comparing them with what's typical there, decoding the words.
3. Result: most spec lines differ between them, while the "if you only listened to the words" column is identical for both. Every difference comes from Qloo data.
4. Open a brief. Answer the one question the agent decided was worth asking (two real places from the client's own taste neighbourhood), and watch the spec lines it predicted would change, change.
5. Press **Verify chain in your browser**, or download the evidence bundle, edit any number, and upload it at **/verify** to watch the chain break.

## What makes it Qloo-powered (and not an LLM wrapper)

| Step | Qloo call | Why it needs Qloo |
|---|---|---|
| Resolve loves | `GET /search` (typed when hinted) | Turns "The Bear (show)" into an entity. Same-name entities of different types are flagged. Weak matches are dropped, not used. |
| Taste neighbourhood | `GET /v2/insights` `filter.type=urn:entity:place` + `signal.interests.entities` + `filter.location.query` | The places people with this taste actually choose, in the client's city. No LLM has this. |
| City baseline | Same query, no taste signal | What's typical there, so the fingerprint measures *this client's* taste, not the city's. |
| Cross-domain tags | `filter.type=urn:tag` + same signals | Mood descriptors from music, film and books that can nudge an atmosphere. |

The model never sets a spec value. Deterministic rulebooks do, so the same evidence always gives the same spec, and each line names what drove it.

**Counter-test, built in:** when a Claude key is set, the agent also gives Claude the same words, the same loves and the same menu of options, with no Qloo data, and reports agreement line by line. **Invariant, tested:** with zero evidence the spec equals the literal reading, so every difference between those two columns is attributable to Qloo.

## How it works

```
loves ──/search──▶ entities ──┐
                              ├─/v2/insights place + signals + city──▶ crowd (top 50)
city ─────────────────────────┤─/v2/insights place + city──────────▶ baseline (top 50)
                              └─/v2/insights urn:tag + signals──────▶ taste tags
crowd, baseline ──lexicon──▶ per-place atmospheres (9)
                 ──Beta(1,1) lift + P(crowd > base)──▶ atmosphere fingerprint
words ──lexicon readings × exp(2·score)──▶ what each word means for this client
fingerprint + decoded words ──rulebook──▶ spec lines (+ literal column, + evidence)
spec ──simulate both answers per contrast──▶ ask one question only if ≥2 lines depend on it
every step ──SHA-256 chain──▶ evidence ledger
```

Agent decisions the user can see in the timeline and the ledger:

- **Entity safety:** which candidate a love means; drop matches under 0.5 similarity rather than poison the signal; flag same-name collisions.
- **Evidence sufficiency:** if fewer than 12 tagged places come back for the city, widen to a location signal, then to no location limit, and warn.
- **Word meaning:** pick the reading of each vague word that the evidence supports. Guard: a client who said a word that can mean warm light never gets light cooler than 3000K. Evidence chooses between a word's meanings; it doesn't overrule the word.
- **Whether to ask:** simulate both answers to every contrast pair, rebuild the spec under each, and ask only about the pair that moves the most lines, using two real places the client might know.

Full detail, formulas and the lexicons are on the in-app **Method** page.

## Run it

```bash
npm install
cp .env.example .env.local        # add QLOO_API_KEY (and optionally ANTHROPIC_API_KEY)
npm run probe -- Chicago          # smoke-test the key against the hackathon API
npm run dev                       # http://localhost:3000
npm test                          # engine tests (synthetic fixture, no network)
```

| Variable | Required | Purpose |
|---|---|---|
| `QLOO_API_KEY` | yes | Qloo hackathon key, sent as `X-Api-Key` from the server only, never logged. |
| `QLOO_BASE_URL` | no | Defaults to `https://hackathon.api.qloo.com` (hackathon keys only work there). |
| `ANTHROPIC_API_KEY` | no | Enables the LLM-only counter-test, the client note and unfamiliar-word mapping. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | no | Upstash Redis / Vercel KV for durable briefs and project tracking. Without them, briefs go to `.data/` (ephemeral on serverless). |
| `QLOO_MODE=fixture` | no | Synthetic data for tests and UI work. The UI shows a "Simulated data" banner. Never use for a public demo. |
| `TASTESPEC_RUNS_PER_10_MIN` | no | Per-IP limit on new briefs (default 12) to protect the Qloo quota. |

### Deploy (Vercel)

1. Import the repo in Vercel (framework: Next.js, no build settings needed).
2. Add `QLOO_API_KEY` (and optionally `ANTHROPIC_API_KEY`).
3. Add an Upstash Redis integration from the Vercel marketplace so `KV_REST_API_URL` / `KV_REST_API_TOKEN` are set; without it, saved briefs don't survive between serverless instances.
4. Deploy, then run the Same words test once to check it end to end.

## Project layout

```
src/lib/agent.ts          the agent: steps, decisions, streaming, re-scoring
src/lib/qloo/client.ts    Qloo client: GET + X-Api-Key, tolerant parsing, retry, ledgering
src/lib/resolve.ts        entity resolution with type hints, similarity floor, pinning
src/lib/fingerprint.ts    venue classification, Beta lift, scoring, client-answer update
src/lib/dimensions.ts     the nine atmospheres and their lexicons
src/lib/words.ts          client-word lexicon and evidence-weighted decoding
src/lib/rulebooks/        lighting and finishes rulebooks
src/lib/spec.ts           spec assembly, literal counterfactual, question planner
src/lib/ledger.ts         SHA-256 hash chain (WebCrypto: same code verifies in the browser)
src/lib/llm.ts            optional Claude calls, all JSON-schema constrained
src/app/                  pages and API routes
tests/engine.test.ts      engine tests incl. the zero-evidence invariant
scripts/probe-qloo.mjs    live key smoke test
```

## Limits, plainly

- Qloo affinities describe aggregate tastes of people who like the same things. They are not facts about the client.
- The fingerprint depends on the tags and keywords Qloo returns for places; thin cities get a warning and a wider search.
- Light levels are typical starting ranges, not a lighting calculation.
- Only the names of public things a client loves and a city are sent to Qloo. No personal data.
