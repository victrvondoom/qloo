# Submission kit

## Devpost text (paste and adjust after you've run it live)

**Tastespec: "warm and modern" isn't a spec.**

Electricians, lighting designers and decorators get briefs like "warm, modern, cozy". Each of those words has several professional meanings: "warm" can mean 2700K light, oak and linen, a lived-in room, or a sociable one. Pros guess, build, and find out at the walkthrough. A chatbot that only hears the words gives everyone who says them the same answer.

Tastespec asks the client something they *can* answer: what they love. Bands, shows, hotels, brands. Then it uses Qloo to find the places people with that taste choose to spend their evenings in, in the client's own city, and compares those rooms with what's typical there. Over-represented atmospheres (low and intimate, clean and minimal, natural, vintage…) say what the client's words actually mean. A deterministic rulebook turns that into a buildable spec: colour temperature, layering, fixture character, dimming, light level, optics, colour rendering (or palette, materials, metals and textiles for finishes).

What makes it agentic: it decides which Qloo entity each love means and drops weak matches; it widens the search when a city has too little evidence; it decides how to read each word; and it decides whether to ask the client one question by simulating both possible answers and asking only if two or more spec lines depend on it. The question names two real places from the client's own taste neighbourhood.

What makes it Qloo-powered: `/search` for entity resolution, `/v2/insights` on places with taste signals and a location filter, the same query without signals as a city baseline, and `urn:tag` insights for cross-domain mood. Without Qloo, there's no taste neighbourhood and no baseline, so nothing to measure against.

Evidence, not vibes: two clients with identical words get different specs, and the "if taken literally" column is identical for both. With no evidence the spec equals the literal reading (tested invariant), so every difference is attributable to Qloo data. An optional counter-test gives Claude the same words, loves and menu without Qloo and reports agreement line by line. Every Qloo call, decision, model call and client answer goes into a SHA-256 hash-chained ledger that anyone can verify in the browser.

Pros track what happens next: accept or revise each line, record an outcome rating, and see across projects how often evidence changed the spec and how often clients accepted it without revision.

## 3-minute live demo script

1. **0:00** Home. One sentence: "Clients say warm and modern. That's not a spec."
2. **0:15** Same words test → Run both briefs. Narrate the timeline while it runs (resolving loves, taste-matched places in Chicago, city baseline, decoding words).
3. **0:45** Point at the result line ("N of 7 lines differ") and the identical literal column at the bottom.
4. **1:15** Open Maya's brief. Show "warm" decoded with its readings, then the fingerprint with counts on hover.
5. **1:45** Answer the question. Show the highlighted lines that changed.
6. **2:15** Counter-test card: what Claude alone picked, where it differs.
7. **2:35** Verify chain → green. "Every Qloo call that produced this spec is in here."
8. **2:50** Close: "The team that proved 'warm and modern' means two different rooms."

## Questions judges are likely to ask

- **"Why not just give Claude the list of loves?"** We do, as the counter-test, and show where it agrees and disagrees. An LLM reasons from stereotypes about famous names; it doesn't know which rooms in Chicago that audience actually chooses or how that compares with the city. And it can't show counts.
- **"Isn't the lexicon hand-written?"** Yes, deliberately: it's nine atmospheres with readable term lists on the Method page, so every count is auditable. The statistics (Beta lift, posterior probability) are what make it a measurement rather than a keyword match.
- **"What if Qloo has little data for a city?"** The agent widens scope in two steps, records why, and warns that the evidence is thin.
- **"Who pays?"** Pros who lose margin to revision rounds and change orders: lighting designers, electricians doing design-and-install, decorators, fit-out firms. Per-brief or per-seat.
- **"What's measured?"** Per brief: lines changed by evidence vs. literal, LLM-only agreement, line acceptance without revision, outcome rating. Aggregated on Projects.

## Before submitting

- [ ] Deploy with a live `QLOO_API_KEY` and KV storage; run `npm run probe` against the key first.
- [ ] Run the Same words test on the live deployment. If the default presets resolve badly (check the resolution table), adjust the loves in `src/components/presets.ts`.
- [ ] Make sure `QLOO_MODE` is **not** set to `fixture` on the public deployment.
- [ ] Repo public, LICENSE visible in the About panel.
