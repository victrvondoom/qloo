# Submission kit

## Devpost text (paste by hand; edit the three status lines at the end once they change)

**Tastespec: "warm and modern" means a different room for every client.**

### 1. Problem
Interior designers and lighting pros get briefs like "warm, modern, cozy". Each word has several professional meanings ("warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one), and designers find out which one the client meant at the walkthrough, after the revision rounds.

### 2. Why existing approaches fail
A tool that only hears the words gives everyone who says them the same room. A language model asked to guess reasons from stereotypes about famous names; it does not know which places people with that taste actually choose in the client's city, or how that compares with what is typical there, and it cannot show counts.

### 3. Tastespec's idea
Ask clients what they can answer: what they love. A designer pastes the client's message; Tastespec extracts the words and the loves (in the browser, or with Claude keeping only what is in the message), and Qloo tells it which places people with that taste choose. Places are rooms. The atmospheres that are over-represented against the city's typical places say what the client's words mean. A versioned rulebook turns that into a buildable lighting or finishes specification. **Things the client writes down outrank the evidence:** a colour-temperature range, a minimum CRI, a dimming floor, a lux target; contradictory requirements stop the build and ask which one is meant.

### 4. How Qloo contributes
Qloo is the evidence: entity resolution (`/search`), the places a taste neighbourhood chooses and the city baseline (`/v2/insights`, `urn:entity:place`), and cross-domain taste tags (`urn:tag`). Without Qloo the specification falls back to the literal reading and says so. The taste anatomy tab sends each love to Qloo on its own to measure how the client's tastes agree, conflict and bridge.

### 5. Agent architecture
A typed state machine (intake, normalise, resolve entities, assess evidence, interpret, check constraints, generate spec, simulate alternatives, validate) with a step budget, timeouts, bounded retries, cancellation and a recorded decision trace. The agent remembers nothing between clients; its working state is a graph that narrows from what the client said to the spec and streams live. It abstains on references it cannot identify, widens a thin city with a disclosed warning, asks one question only when the answer would change the spec, and never lets a model set a spec value.

### 6. Product walkthrough
`/lab` has a three-minute guided run that executes the real pipeline: two clients with identical words, their loves, the Qloo evidence, the decision trace, the two specifications side by side, a real no-Qloo baseline, a challenge with a written requirement, and in-browser verification of the evidence ledger. Beyond that: a drawn and 3D room lit by the spec, a hand-over document, a revocable client link, Duet (two people, one room), anatomy, and a blinded human preference study.

### 7. Engineering evidence
Hash-chained ledger of every Qloo call, decision, model call and client action; replay rebuilds any spec from its stored evidence; every line is classified as evidence-supported, derived, client-stated or unsupported. 200+ unit, property and adversarial tests, a browser suite on desktop and mobile, and a seeded synthetic benchmark (64 scenarios, 4 seeds, baselines and ablations) with the oracle's limits stated. On the synthetic benchmark the full agent agrees with the oracle 0.77-0.88 of the time versus 0.41 for the literal reading, and breaks no warm-light rule where evidence alone breaks it in 23-43% of warm briefs. **This is synthetic and uses our own rulebook as the oracle; it is not human satisfaction and not proof that clients prefer the output.**

### 8. Real-world use
Independent designers and lighting pros who lose margin to revision rounds. We have not measured time saved and do not claim to.

### 9. Limitations
Not verified against live Qloo (no key or network was available; `npm run verify:qloo-live` is ready). Benchmark results are synthetic. No human has judged the output yet: the study is built and has zero responses. The LLM-only baseline has not been run. The rulebook is our own design judgement. Not deployed publicly from the build environment.

### 10. What's next
Run the live verification and the human study; add a participant-own-preferences study mode; more trades; and let the designer give the agent their own rulebook.

**Status lines (edit before submitting):** Live Qloo verification: NOT LIVE VERIFIED. Public demo URL: NOT DEPLOYED. Human responses: ZERO.

## 3-minute demo

1. **0:00** Landing film (27 s, drawn from two demo briefs): same words, two rooms. "Warm and modern isn't a spec."
2. **0:25** Workspace: paste Maya's message. The draft fills in as you type. Press **Build**; narrate the graph narrowing column by column.
3. **0:55** The brief: "They mean Amber Parlour." Drag the dimmer from Day to Late (dim-to-warm). Point at the question card: two real places, asked only because the evidence can't call it.
4. **1:20** Spec tab: basis labels and the literal value each line replaced. Pathways: click "Colour temperature" and walk it back to "warm" and the places behind it.
5. **1:35** Measure influence: "4 of 7 lines survive dropping any one reference; Layering changes without Norah Jones." Measured by asking Qloo again with each love left out.
5b. **1:42** Anatomy: run it; "coherence 0.30, The Bear pulls vintage, Wes Anderson pulls refined"; the bridge rooms both choose; Fixture character survives only 47% of resamples, so it goes into the risks. Flip to 3D on Hand-over and orbit the room.
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
| A Correctness | Invariants verified, no fabricated evidence, abstention, replayable | **Pass** (unit, property, adversarial and recovery tests; replay identical) |
| B Qloo | Live integration tested, provenance intact | **Not live verified.** Contract tested; `npm run verify:qloo-live` ready |
| C Evaluation | Reproducible baselines, honest limits, independent judgement | **Synthetic only.** Human study built, zero responses; B1 not run |
| D Product | Message to brief to spec to hand-over to client link, persistent, accessible, any OS | **Pass locally** (browser suite, desktop and mobile) |
| E Submission | Public repo, licence, live demo, setup, description, video | **Partial:** licence, docs, Devpost text, film done; repo visibility, deployment and the Devpost entry are owner actions (`docs/RELEASE_CHECKLIST.md`) |
