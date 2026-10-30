# Human evaluation

**Status: workflow built and tested; ZERO HUMAN RESPONSES recorded.** No participant data exists, none has been simulated, and no claim about human preference is made anywhere in this repository. `reports/human-evaluation-summary.md` says "NO HUMAN DATA COLLECTED" until real people respond.

## Why this exists

The benchmark compares each system with an oracle that uses Tastespec's own rulebook. That measures how well taste is recovered through the mapping; it cannot say whether people prefer the output. Only people can.

## Design

- **Cases.** `study/cases.json` holds client briefs (words, loves, any explicit requirements) with candidate specifications produced by the real pipeline: **B0** literal words with the same hard limits, **B2** Qloo evidence alone through the rulebook (ignores the client's words and limits, as in the benchmark), **B3** the full agent. **B1** (LLM only) is added only when a real model key exists; it is absent today. Build or rebuild with `npm run study:cases`; run it with the data mode you want the cases to carry. Today's file is built from the **synthetic fixture world** and every case says so.
- **Blinding.** For each participant and case the server picks a random pair of systems whose specifications actually differ and a random left/right (crypto randomness). The page shows "Option A / Option B" and never names a system. The assignment is stored server-side, so every response is tied to the real systems and the exact case version (a SHA-256 over what the participant saw). Neutral wording only; nothing says "AI" or "smarter".
- **Questions**, answered separately, each as A / B / Equal / Neither: which better reflects what the client described; which would you hand to an interior designer; which is easier to understand; which better respects the explicit requirements. Plus confidence 1–5.
- **Deviation from "your own preferences".** Participants judge a fictional client's description, not their own taste, because a pre-built case can't contain a stranger's preferences. A design that uses participants' own loves needs live Qloo data and an agent run per participant; it is listed as future work.

## Consent, data and withdrawal

- A consent screen precedes any case; consent is recorded as a version string on every response.
- Stored per response: the four answers, confidence, case id and version, data mode, rulebook version, which system was on which side, a random anonymous session hash, a timestamp. **Not stored:** name, email, IP address, user agent, free text.
- Duplicate protection: one response per anonymous session and case (database unique index). A browser that reloads is skipped past cases it already answered.
- Withdrawal: the participant gets a withdraw code (first 12 hex characters of the session hash). The "Delete my responses now" button (cookie) or `DELETE /api/study/responses` with `{"code": "…"}` removes every response and assignment for that session.
- **Durability.** Collection switches off (with a clear message) when the database is not durable, rather than quietly losing responses. On Vercel use `DATABASE_URL` (libSQL). Locally the SQLite file is durable.
- **Export.** `GET /api/study/export?format=csv|json` is disabled unless `STUDY_ADMIN_TOKEN` is set, then requires `Authorization: Bearer <token>`. Rows carry no session id. `/study/results` shows aggregates only.

## Analysis

`npm run study:report` writes `reports/human-evaluation-summary.md` from the database: per system pair, counts for each question, the Equal and Neither rates, the share of decisive responses preferring the first system with a Wilson 95% interval, mean confidence, sample size, case versions and data modes. Below 20 responses it says the result is too few to read as a preference. It never smooths or estimates.

## Limitations

Fictional clients; small, self-selected samples; wording can sway a choice independent of quality; fixture-built cases say nothing about Qloo's real data; B1 is missing until a model key is available; comparing identical specifications is prevented, but near-identical ones still yield many Equal answers.

## Running it

```bash
npm run study:cases      # (re)build cases; QLOO_MODE=fixture is the default demo world
npm run demo             # serve; open /study
npm run study:report     # regenerate the summary from collected responses
```

The Playwright test exercises the form against a throwaway database to check the plumbing (consent gate, blinding, duplicates, withdrawal). Those test rows are deleted with the database and are not data.
