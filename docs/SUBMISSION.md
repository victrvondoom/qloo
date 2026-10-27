# Submission kit

## Devpost description (edit the status lines once the live probe and deployment are done)

**Tastespec: "warm and modern" isn't a spec.**

Interior designers and lighting pros get briefs like "warm, modern, cozy". Each word has several professional meanings ("warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one), and pros find out which one the client meant at the walkthrough. A chatbot that only hears the words gives everyone who says them the same room.

Tastespec asks clients what they can answer: what they love. Bands, shows, hotels, brands. It resolves them in Qloo, pulls the places people with that taste choose in the client's city, and compares them with the city's typical places. The atmospheres that are over-represented (low glow, clean and minimal, vintage character…) say what the client's words mean. A versioned rulebook turns that into a buildable lighting or finishes spec, with hard constraints the evidence can't override.

It's an agent with real decisions, all recorded: it abstains on references it can't identify, widens the search when a city is thin, falls back to the literal reading when evidence is insufficient or Qloo is down (and says so), and asks one question only when the answer is uncertain and would change the spec. Every Qloo call, decision and answer goes into a hash-chained ledger, and every spec line is classified as evidence-supported, derived, client-stated or unsupported.

We tested it against baselines on a seeded synthetic world (60 scenarios, 4 seeds): literal reading, Qloo evidence alone, Tastespec, and ablations. Tastespec matched the synthetic clients' known taste far better than the literal reading (0.76–0.88 vs 0.39). Evidence alone broke the client's stated constraint in 23–43% of warm briefs; Tastespec in none. We also report what didn't hold up: the clarifying question has no measurable accuracy gain yet.

Try the Proof Lab: run two clients with identical words, then press "Without Qloo" and watch the difference vanish; change one favourite; or try to break the agent with ambiguous, conflicting, empty or failing inputs.

## 3-minute demo

1. **0:00** Proof Lab. "Clients say warm and modern. That's not a spec."
2. **0:15** Run Maya vs Jordan. Narrate the timeline.
3. **0:45** "6 of 7 lines differ." Press **Without Qloo**: "0 of 7". "Every difference was Qloo's."
4. **1:15** Point at the basis labels: Qloo evidence vs hard constraint (Jordan's 3000K floor).
5. **1:40** Challenges: simulated outage → degrade; unknown refs → abstain.
6. **2:15** Open a brief: trace, ledger, verify. "Here's every request that produced this line."
7. **2:40** Benchmark table: "And here's when it helps, and where it doesn't yet."

## Questions judges are likely to ask

- **"Why not give Claude the loves?"** We do (the B1 counter-test, same menu, no Qloo), line by line. An LLM reasons from stereotypes about famous names; it doesn't know which rooms in Chicago that audience chooses, or how that compares with the city, and can't show counts.
- **"Isn't your benchmark circular?"** Partly, and we say so: the oracle uses our rulebook, so it measures taste recovery through the mapping, not design quality. Human preference is the missing piece; the protocol is in the methodology doc.
- **"What if Qloo has nothing for a city?"** Widen with a warning; if still too little, abstain to the literal reading.
- **"Does the question help?"** Not measurably yet. The benchmark found our first version made results worse; we fixed that and stopped over-asking, but the gain isn't significant.
- **"Who pays?"** Independent designers and lighting pros who lose margin to revision rounds. We haven't measured time saved and don't claim to.

## Release gates

| Gate | Requirement | Status |
|---|---|---|
| A Correctness | Invariants verified, no fabricated evidence, abstention | **Pass**: 64 unit/property/adversarial tests, 0 invariant violations in 240 benchmark runs |
| B Qloo | Live integration tested, provenance intact | **Not verified**: needs a key and network; run `npm run probe` |
| C Evaluation | Reproducible baselines, honest limits | **Pass (synthetic only)**: B1 needs a Claude key; no human study |
| D Product | Brief → spec → review → export, persistent, accessible, deployed | **Partial**: workflow complete, 20/20 e2e; deployment and KV not verified |
| E Submission | Public repo, license, live demo, setup, description | **Partial**: license + docs done; repo visibility and live URL are owner actions |

Before submitting: set `QLOO_API_KEY`, run the probe and commit `reports/qloo-live-probe.json`; deploy with KV (`docs/DEPLOYMENT.md`); run the Proof Lab on the live URL; make the repo public.
