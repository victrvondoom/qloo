# Release checklist

Run `npm run release:check` (add `-- --skip-e2e` for a faster pass). It prints PASS / FAIL / BLOCKED / NOT RUN per check and exits 1 only for FAIL (`--strict` also fails BLOCKED and NOT RUN). A missing live credential is **BLOCKED**, never a pass.

## Automated by `release:check`

typecheck · lint · unit tests · production build · license · submission documents present · deployment configuration present (Dockerfile, compose, `vercel.json`, CI workflow) · no secrets in tracked files · benchmark artifacts consistent (same scenario count in all four seeds, the summary and the README; labelled synthetic; not-measured disclosure present) · local server smoke (health, every page renders, demo mode disclosed, no-Qloo baseline makes 0 Qloo calls, an agent run completes and is labelled fixture, ledger entries link, study export closed without a token) · judge navigation (no dead links from the home page) · browser suite · Qloo live verification (BLOCKED without a key) · public URL (NOT RUN without `TASTESPEC_PUBLIC_URL`) · human study summary states its sample size.

## Manual steps that need you

| Step | Why it can't be automated here |
|---|---|
| Set `QLOO_API_KEY`, run `npm run verify:qloo-live`, commit `reports/qloo-live-verification.json` | No key or network in the build sandbox |
| Deploy (`docs/DEPLOYMENT.md`: Vercel + Turso, or Docker), then run `TASTESPEC_PUBLIC_URL=https://… npm run release:check -- --skip-e2e` | No hosting credentials |
| Do not set `QLOO_MODE` on a public deployment; confirm `/api/health` says `"qloo": "live"` and `"durable": true` | Deployment-specific |
| Make the GitHub repository public | Needs your explicit decision; not changed by any session |
| Paste the Devpost text from `docs/SUBMISSION.md`, add the repository and demo URLs, upload the film | Needs your Devpost login |
| Optionally set `STUDY_ADMIN_TOKEN`, share `/study`, then `npm run study:report` | Needs real participants |
| Run `npm run benchmark -- --with-llm` with an Anthropic key to add B1 | No model key in the sandbox |

## Never claim until it is true

LIVE VERIFIED · a public URL works · real users prefer the output · the LLM-only baseline loses. None is true today.
