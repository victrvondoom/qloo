# Submission kit

## Devpost description (edit the status lines once the live probe and deployment are done)

**Tastespec: “warm and modern” means a different room for every client.**

Interior designers and lighting pros get briefs like "warm, modern, cozy". Each word has several professional meanings ("warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one), and pros find out which one the client meant at the walkthrough. A chatbot that only hears the words gives everyone who says them the same room.

Tastespec asks clients what they can answer: what they love. A designer pastes the client's message; Tastespec pulls out the words and the loves (in the browser, or with Claude, keeping only what's actually in the message), resolves the loves in Qloo, pulls the places people with that taste choose in the client's city and compares them with the city's typical places. The atmospheres that are over-represented say what the client's words mean. A versioned rulebook turns that into a buildable lighting or finishes spec, with hard constraints the evidence can't override, and the spec is drawn as a room with its own scenes on a dimmer.

The agent remembers nothing between clients: its whole working state is a graph that narrows from what the client said to the spec, streamed live while it runs, and any spec line can be traced back along it. It abstains on references it can't identify, widens the search when a city is thin, falls back to the literal reading when evidence is insufficient or Qloo is down (and says so), and asks one question only when the answer is uncertain and would change the spec. "Go deeper" repeats the taste question among less popular places for reference rooms nobody else will have shown the client. The hand-over (scenes, a zone-by-scene dimming table, palette, references, a buying list, an installer checklist) is built from the same evidence, and the client gets a revocable link where they can answer and react on their phone while the designer watches the activity feed.

Every Qloo call, decision, model call and client action goes into a hash-chained ledger; replay rebuilds any spec from its stored evidence; every line is classified as evidence-supported, derived, client-stated or unsupported. It runs on any OS with Node 22 (built-in SQLite, no native modules) or on serverless with libSQL/Turso.

We tested it against baselines on a seeded synthetic world (60 scenarios, 4 seeds): literal reading, Qloo evidence alone, Tastespec, and ablations. Tastespec matched the synthetic clients' known taste far better than the literal reading (0.76–0.88 vs 0.39). Evidence alone broke the client's stated constraint in 23–43% of warm briefs; Tastespec in none. We also report what didn't hold up: the clarifying question has no measurable accuracy gain yet.

## 3-minute demo

1. **0:00** Landing film (27 s, drawn from two demo briefs): same words, two rooms. "Warm and modern isn't a spec."
2. **0:25** Workspace: paste Maya's message. The draft fills in as you type. Press **Build**; narrate the graph narrowing column by column.
3. **0:55** The brief: "They mean Amber Parlour." Drag the dimmer from Day to Late (dim-to-warm). Point at the question card: two real places, asked only because the evidence can't call it.
4. **1:20** Spec tab: basis labels and the literal value each line replaced. Pathways: click "Colour temperature" and walk it back to "warm" and the places behind it.
5. **1:35** Measure influence: "4 of 7 lines survive dropping any one reference; Layering changes without Norah Jones." Measured by asking Qloo again with each love left out.
6. **1:50** Go deeper → Curated: same taste, less popular places, both sides capped; use it for the spec.
7. **2:05** Client & activity → create the link, open it on a phone, react "change this", watch it land in the feed. Revoke: the link 404s.
8. **2:30** Evidence: verify the ledger in the browser, replay the spec from stored evidence. Benchmark band on the landing page: "and here's when it helps, and where it doesn't yet."

## Questions judges are likely to ask

- **"Why not give Claude the loves?"** We do (the B1 counter-test: same words, loves and option menu, no Qloo), line by line. An LLM reasons from stereotypes about famous names; it doesn't know which rooms in Chicago that audience chooses, or how that compares with the city, and can't show counts.
- **"Is the room picture real?"** It's the spec drawn: light colour from the colour-temperature line (warming as it dims), sources from the layering line, beam widths from optics, fittings from fixture character, scenes from the dimming line, palette from the leading atmospheres. It is an illustration, not a rendering of the client's room, and says so.
- **"Isn't your benchmark circular?"** Partly, and we say so: the oracle uses our rulebook, so it measures taste recovery through the mapping, not design quality. Human preference is the missing piece; the protocol is in the methodology doc.
- **"What if Qloo has nothing for a city?"** Widen with a warning; if still too little, abstain to the literal reading.
- **"Does the question help?"** Not measurably yet. The benchmark found our first version made results worse; we fixed that and stopped over-asking, but the gain isn't significant.
- **"Can the model make things up?"** It never sets a spec value. A draft read from a message keeps only what occurs in the message; hand-over prose is rejected if any number or name isn't in the brief's facts; tag mappings are validated, cached and labelled.
- **"Who pays?"** Independent designers and lighting pros who lose margin to revision rounds. We haven't measured time saved and don't claim to.

## Release gates

| Gate | Requirement | Status |
|---|---|---|
| A Correctness | Invariants verified, no fabricated evidence, abstention, replayable | **Pass**: 131 unit/property/adversarial tests; 0 invariant violations in the benchmark; replay identical on stored briefs |
| B Qloo | Live integration tested, provenance intact | **Not verified**: needs a key and network; run `npm run probe -- Chicago` |
| C Evaluation | Reproducible baselines, honest limits | **Pass (synthetic only)**: B1 needs a Claude key; no human study |
| D Product | Message → brief → spec → hand-over → client link → outcome, persistent, accessible, any OS | **Pass locally**: browser suite (designer + client flows, mobile, dark mode); deployment not verified from this workspace |
| E Submission | Public repo, license, live demo, setup, description, video | **Partial**: license, docs, film (`public/media`) done; repo visibility and live URL are owner actions |

Before submitting: set `QLOO_API_KEY`, run the probe and commit `reports/qloo-live-probe.json`; deploy (Docker or serverless + Turso, `docs/DEPLOYMENT.md`); run the demo above on the live URL; make the repo public.
