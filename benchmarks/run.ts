// Benchmark runner.  npm run benchmark  [-- --seed N]
//
// Systems
//   B0  literal       spec from the client's words + hard constraints only
//   B1  llm_only      Claude with words + loves + the option menu, no Qloo (only if ANTHROPIC_API_KEY is set)
//   B2  qloo_only     evidence fingerprint → rulebook, ignoring the client's words and word-based constraints
//   B3  full          Tastespec: evidence + word decoding + constraints + clarification (simulated client answers)
//   B4a no_question   B3 before the clarifying question is answered (same evidence: an exact ablation)
//   B4b no_baseline   B3 with the city baseline removed (crowd shares compared with an uninformative 50%)
//
// All synthetic. The "oracle" spec applies the same rulebook to the synthetic
// client's latent taste, so agreement measures how well each system recovers
// taste through that mapping, NOT whether the mapping is good design. See
// docs/EVALUATION_METHODOLOGY.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { buildBenchmark, type Scenario } from "./scenarios";
import type { SyntheticWorld } from "./world";
import { rng } from "./world";
import { runBrief, answerQuestion, cleanInput, validateBrief } from "../src/lib/agent";
import { computeDimensions } from "../src/lib/fingerprint";
import { runRulebook, RULEBOOK_VERSION, type Vector } from "../src/lib/rulebooks";
import { buildSpec, literalSpec, warmFloor, zeroVector, specMenu } from "../src/lib/spec";
import { decodeWord, lexiconFor } from "../src/lib/words";
import { clearQlooCache } from "../src/lib/qloo/client";
import { llmAvailable, llmBaselineSpec, llmModel } from "../src/lib/llm";
import { ROOM_LABEL, TRADE_LABEL } from "../src/lib/rulebooks";
import { DIMENSIONS } from "../src/lib/dimensions";
import type { Brief, DimensionId } from "../src/lib/types";

process.env.VITEST = process.env.VITEST ?? "1"; // silence structured logs
const SEED = Number(process.argv.find((a) => a.startsWith("--seed="))?.split("=")[1] ?? 20261028);

type SpecMap = Record<string, string>;
const toMap = (lines: { id: string; value: string }[]): SpecMap => Object.fromEntries(lines.map((l) => [l.id, l.value]));

// ---------------------------------------------------------------- stats

function wilson(k: number, n: number) {
  if (n === 0) return { p: null as number | null, lo: null as number | null, hi: null as number | null, n };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p: +p.toFixed(4), lo: +Math.max(0, c - h).toFixed(4), hi: +Math.min(1, c + h).toFixed(4), n };
}

function bootstrapMean(xs: number[], seed = 7) {
  if (!xs.length) return { mean: null as number | null, lo: null as number | null, hi: null as number | null, n: 0 };
  const r = rng(seed);
  const means: number[] = [];
  for (let b = 0; b < 2000; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean: +mean.toFixed(4), lo: +means[Math.floor(0.025 * means.length)].toFixed(4), hi: +means[Math.floor(0.975 * means.length)].toFixed(4), n: xs.length };
}

function pct(xs: number[], q: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

// ---------------------------------------------------------------- oracle

function oracleSpec(world: SyntheticWorld, sc: Scenario): SpecMap | undefined {
  if (!sc.intended.length) return undefined;
  const input = cleanInput(sc.input);
  const truth = world.truth(sc.intended);
  const v: Vector = zeroVector();
  for (const d of DIMENSIONS) v[d.id] = truth[d.id];
  for (const w of input.words) {
    const lex = lexiconFor(w);
    if (!lex) continue;
    const best = [...lex].sort((a, b) => truth[b.dimension] - truth[a.dimension])[0];
    const chosen = truth[best.dimension] > 0.05 ? best : lex.find((r) => r.isDictionaryDefault) ?? lex[0];
    v[chosen.dimension] += 0.6;
  }
  return toMap(runRulebook(input.trade, v, input.room, { warmFloor: warmFloor(input.words) }));
}

function topDims(scores: Record<DimensionId, number>, k = 2): DimensionId[] {
  return (Object.entries(scores) as [DimensionId, number][]).sort((a, b) => b[1] - a[1]).slice(0, k).map(([d]) => d);
}

function agreement(a: SpecMap, b: SpecMap) {
  const ids = Object.keys(b);
  return ids.filter((id) => a[id] === b[id]).length / ids.length;
}

function violatesWarmFloor(input: Scenario["input"], spec: SpecMap) {
  const c = cleanInput(input);
  return c.trade === "lighting" && warmFloor(c.words) && /3500K ambient|4000K/.test(spec.cct ?? "");
}

// ---------------------------------------------------------------- run

interface Row {
  id: string;
  category: string;
  status?: string;
  error?: string;
  expectedStatusOk?: boolean;
  ms?: number;
  qlooAttempts?: number;
  qlooRetries?: number;
  specs: Partial<Record<"B0" | "B1" | "B2" | "B3" | "B4a" | "B4b", SpecMap>>;
  oracle?: SpecMap;
  latentTop2?: DimensionId[];
  systemTop2?: DimensionId[];
  question?: { asked: boolean; contrast?: string[]; answer?: string; expectedChange?: number; realizedChange?: number; agreementBefore?: number; agreementAfter?: number };
  entity?: { correct: number; total: number; details: { input: string; label: string | null; got: string | null }[] };
  evidence?: { lines: number; complete: number; byBasis: Record<string, number> };
  validation?: string[];
}

async function main() {
  const t0 = Date.now();
  const { world, scenarios, seed } = buildBenchmark(SEED);
  const useLlm = llmAvailable() && process.argv.includes("--with-llm");
  const rows: Row[] = [];

  for (const sc of scenarios) {
    clearQlooCache();
    world.failure = sc.failure ? { ...sc.failure } : { kind: "none" };
    const input = cleanInput(sc.input);
    const row: Row = { id: sc.id, category: sc.category, specs: { B0: toMap(literalSpec(input.trade, input.room, input.words)) } };
    row.oracle = oracleSpec(world, sc);
    if (sc.intended.length) row.latentTop2 = topDims(world.truth(sc.intended));

    const started = Date.now();
    let brief: Brief | undefined;
    try {
      brief = await runBrief(sc.input, () => {}, { transport: world, useLlm: false, budgetMs: 30_000 });
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
    }
    row.ms = Date.now() - started;
    if (brief) {
      row.status = brief.status;
      row.qlooAttempts = brief.stats.qlooAttempts;
      row.qlooRetries = brief.stats.qlooRetries;
      row.validation = validateBrief(brief);
      row.specs.B4a = toMap(brief.spec);
      const evUsable = brief.status === "COMPLETE" || brief.status === "NEEDS_CLARIFICATION";
      if (evUsable) {
        const scores = Object.fromEntries(brief.dimensions.map((d) => [d.id, d.score])) as Record<DimensionId, number>;
        row.systemTop2 = topDims(scores);
        // B2: evidence only, client words ignored entirely.
        const v = zeroVector();
        for (const d of brief.dimensions) v[d.id] = d.score;
        row.specs.B2 = toMap(runRulebook(input.trade, v, input.room, {}));
        // B4b: no city baseline.
        const tags = [...new Map(brief.dimensions.flatMap((d) => d.tasteTags).map((t) => [t.name, t])).values()];
        const dimsNoBase = computeDimensions(brief.crowdVenues, [], tags);
        const wordsNoBase = input.words.map((w) => decodeWord(w, dimsNoBase));
        row.specs.B4b = toMap(buildSpec(input.trade, input.room, dimsNoBase, wordsNoBase, input.words, undefined, { evidenceUsable: true, evidenceLedger: [0], signalEntityIds: [] }));
      } else {
        row.specs.B2 = row.specs.B0; // no evidence: evidence-only system has nothing to say
        row.specs.B4b = row.specs.B4a;
      }
      // B3: answer the question as the synthetic client would (by latent truth).
      let final = brief;
      if (brief.question) {
        const q = brief.question;
        const truth = sc.intended.length ? world.truth(sc.intended) : undefined;
        const ans: "A" | "B" | "neither" = !truth ? "neither" : Math.abs(truth[q.optionA.carries] - truth[q.optionB.carries]) < 0.05 ? "neither" : truth[q.optionA.carries] > truth[q.optionB.carries] ? "A" : "B";
        final = await answerQuestion(brief, ans);
        const realized = final.spec.filter((l) => brief!.spec.find((p) => p.id === l.id)?.value !== l.value).length;
        row.question = {
          asked: true,
          contrast: [q.dimension, q.versus],
          answer: ans,
          expectedChange: +q.expectedChange.toFixed(3),
          realizedChange: realized,
          ...(row.oracle ? { agreementBefore: agreement(toMap(brief.spec), row.oracle), agreementAfter: agreement(toMap(final.spec), row.oracle) } : {}),
        };
      } else row.question = { asked: false };
      row.specs.B3 = toMap(final.spec);
      const byBasis: Record<string, number> = {};
      let complete = 0;
      for (const l of final.spec) {
        byBasis[l.basis] = (byBasis[l.basis] ?? 0) + 1;
        const ok = l.basis !== "qloo_evidence" || (l.evidence.length > 0 && l.evidenceLedger.length > 0 && l.signalEntityIds.length > 0);
        if (l.basis && ok) complete++;
      }
      row.evidence = { lines: final.spec.length, complete, byBasis };
      if (sc.entityLabels) {
        const details = Object.entries(sc.entityLabels).map(([inp, label]) => {
          const r = final.resolutions.find((x) => x.input === cleanInput({ loves: [inp, "pad"] }).loves[0]);
          return { input: inp, label, got: r?.usedAsSignal ? r.chosen!.entity_id : null };
        });
        row.entity = { correct: details.filter((d) => d.label === d.got).length, total: details.length, details };
      }
      if (useLlm) {
        try {
          const menu = specMenu(input.trade, input.room, input.words);
          const lines = await llmBaselineSpec({ trade: TRADE_LABEL[input.trade], room: ROOM_LABEL[input.room], words: input.words, loves: input.loves, menu });
          row.specs.B1 = toMap(lines);
        } catch (err) {
          row.specs.B1 = undefined;
          row.error = `${row.error ?? ""} B1: ${String(err).slice(0, 120)}`.trim();
        }
      }
    }
    row.expectedStatusOk = sc.expectStatus ? Boolean(row.status && sc.expectStatus.includes(row.status as never)) : undefined;
    rows.push(row);
  }

  // ---------------------------------------------------------- metrics
  const systems = ["B0", "B1", "B2", "B3", "B4a", "B4b"] as const;
  const scorable = rows.filter((r) => r.oracle && (r.status === "COMPLETE" || r.status === "NEEDS_CLARIFICATION"));
  const oracleAgreement = Object.fromEntries(
    systems.map((s) => {
      const xs = scorable.filter((r) => r.specs[s]).map((r) => agreement(r.specs[s]!, r.oracle!));
      return [s, xs.length ? bootstrapMean(xs) : { mean: null, note: s === "B1" ? "not run (needs ANTHROPIC_API_KEY and --with-llm)" : "no data", n: 0 }];
    }),
  );
  const exactOracle = Object.fromEntries(systems.map((s) => {
    const rs = scorable.filter((r) => r.specs[s]);
    return [s, wilson(rs.filter((r) => agreement(r.specs[s]!, r.oracle!) === 1).length, rs.length)];
  }));

  const recov = scorable.filter((r) => r.systemTop2 && r.latentTop2);
  const latentRecoveryTop1 = wilson(recov.filter((r) => r.latentTop2!.includes(r.systemTop2![0])).length, recov.length);
  const latentOverlap = bootstrapMean(recov.map((r) => r.systemTop2!.filter((d) => r.latentTop2!.includes(d)).length / 2));

  const warmScen = rows.filter((r) => violatesWarmFloor(scenarios.find((s) => s.id === r.id)!.input, { cct: "" }) === false && warmFloor(cleanInput(scenarios.find((s) => s.id === r.id)!.input).words) && cleanInput(scenarios.find((s) => s.id === r.id)!.input).trade === "lighting");
  const constraintViolations = Object.fromEntries(systems.map((s) => {
    const rs = warmScen.filter((r) => r.specs[s]);
    return [s, wilson(rs.filter((r) => violatesWarmFloor(scenarios.find((x) => x.id === r.id)!.input, r.specs[s]!)).length, rs.length)];
  }));

  const abstainExpected = rows.filter((r) => ["missing_coverage"].includes(r.category));
  const abstainCorrect = wilson(abstainExpected.filter((r) => r.status === "INSUFFICIENT_EVIDENCE").length, abstainExpected.length);
  const dense = rows.filter((r) => ["same_words_diff_taste", "same_taste_diff_words", "irrelevant_change", "conflicting_taste", "explicit_constraint"].includes(r.category));
  const falseAbstain = wilson(dense.filter((r) => r.status === "INSUFFICIENT_EVIDENCE" || r.status === "UPSTREAM_UNAVAILABLE").length, dense.length);
  const weak = rows.filter((r) => r.category === "weak_evidence");

  const ent = rows.filter((r) => r.entity);
  const entityAccuracy = wilson(ent.reduce((a, r) => a + r.entity!.correct, 0), ent.reduce((a, r) => a + r.entity!.total, 0));

  // Sensitivity: pairs with different latent taste. "Justified" = every line that differs matches each side's own oracle.
  const pairs = (kind: string) => scenarios.filter((s) => s.pair?.kind === kind).map((s) => [rows.find((r) => r.id === s.pair!.with)!, rows.find((r) => r.id === s.id)!] as const).filter(([a, b]) => a && b);
  const tastePairs = pairs("different_taste").filter(([a, b]) => a.oracle && b.oracle && a.specs.B3 && b.specs.B3);
  const sensitivity = Object.fromEntries((["B0", "B2", "B3", "B4a"] as const).map((s) => {
    const ps = tastePairs.filter(([a, b]) => a.specs[s] && b.specs[s]);
    const differ = ps.filter(([a, b]) => Object.keys(a.specs[s]!).some((id) => a.specs[s]![id] !== b.specs[s]![id]));
    const oracleDiffer = ps.filter(([a, b]) => Object.keys(a.oracle!).some((id) => a.oracle![id] !== b.oracle![id]));
    let justifiedLines = 0;
    let differingLines = 0;
    for (const [a, b] of ps) for (const id of Object.keys(a.specs[s]!)) if (a.specs[s]![id] !== b.specs[s]![id]) {
      differingLines++;
      if (a.specs[s]![id] === a.oracle![id] && b.specs[s]![id] === b.oracle![id]) justifiedLines++;
    }
    return [s, { pairs: ps.length, pairsWhereOracleDiffers: oracleDiffer.length, pairsWhereSystemDiffers: differ.length, differingLines, justifiedDifferenceRate: wilson(justifiedLines, differingLines) }];
  }));

  const stab = pairs("irrelevant").filter(([a, b]) => a.specs.B3 && b.specs.B3);
  const stability = wilson(stab.filter(([a, b]) => JSON.stringify(a.specs.B4a) === JSON.stringify(b.specs.B4a)).length, stab.length);

  const asked = rows.filter((r) => r.question?.asked);
  const questionsUsefulRate = wilson(asked.filter((r) => (r.question!.realizedChange ?? 0) > 0).length, asked.length);
  const withOracleQ = asked.filter((r) => r.question!.agreementBefore !== undefined);
  const clarification = {
    briefsEligible: rows.filter((r) => r.status === "COMPLETE" || r.status === "NEEDS_CLARIFICATION").length,
    questionsAsked: asked.length,
    questionsThatChangedTheSpec: questionsUsefulRate,
    meanExpectedChange: bootstrapMean(asked.map((r) => r.question!.expectedChange ?? 0)),
    meanRealizedChange: bootstrapMean(asked.map((r) => r.question!.realizedChange ?? 0)),
    oracleAgreementGainPerQuestion: bootstrapMean(withOracleQ.map((r) => r.question!.agreementAfter! - r.question!.agreementBefore!)),
    note: "The synthetic client answers by its latent truth, which is the best case for asking. Real clients are noisier.",
  };

  const fails = rows.filter((r) => r.category === "upstream_failure");
  const reliability = {
    failureScenarios: fails.map((r) => ({ id: r.id, status: r.status ?? "THREW", expected: scenarios.find((s) => s.id === r.id)!.expectStatus, ok: r.expectedStatusOk, retries: r.qlooRetries })),
    handledCorrectly: wilson(fails.filter((r) => r.expectedStatusOk).length, fails.length),
    normalCompletion: wilson(rows.filter((r) => r.category !== "upstream_failure" && !r.error).length, rows.filter((r) => r.category !== "upstream_failure").length),
  };

  const evRows = rows.filter((r) => r.evidence);
  const evidenceCompleteness = wilson(evRows.reduce((a, r) => a + r.evidence!.complete, 0), evRows.reduce((a, r) => a + r.evidence!.lines, 0));
  const invariantViolations = rows.flatMap((r) => (r.validation ?? []).map((v) => `${r.id}: ${v}`));

  const ms = rows.filter((r) => r.category !== "upstream_failure" && r.ms !== undefined).map((r) => r.ms!);
  const calls = rows.filter((r) => r.qlooAttempts !== undefined).map((r) => r.qlooAttempts!);

  let gitSha = "unknown";
  try {
    gitSha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}

  const results = {
    kind: "SYNTHETIC benchmark (seeded world, not Qloo data, no human labels)",
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, gitSha, seed, rulebookVersion: RULEBOOK_VERSION, scenarios: scenarios.length, llm: useLlm ? llmModel() : "not used", durationMs: Date.now() - t0 },
    notMeasured: {
      preferenceAlignmentWithHumans: "NOT MEASURED: no independent human preference labels have been collected. Protocol: docs/EVALUATION_METHODOLOGY.md.",
      liveQloo: "NOT MEASURED: no Qloo key/network in the benchmark environment. Run `npm run probe` and the live checks with a key.",
      B1: useLlm ? undefined : "NOT RUN: needs ANTHROPIC_API_KEY and --with-llm.",
    },
    metrics: {
      oracleAgreement: { description: "Mean fraction of spec lines equal to the synthetic oracle (same rulebook applied to the latent taste). 95% bootstrap CI.", scenarios: scorable.length, bySystem: oracleAgreement },
      exactOracleMatch: { description: "Share of briefs where every line equals the oracle. Wilson 95% CI.", bySystem: exactOracle },
      latentTasteRecovery: { description: "Does the fingerprint's top atmosphere appear in the client's true top-2? (B3 evidence)", top1InTrueTop2: latentRecoveryTop1, meanTop2Overlap: latentOverlap },
      constraintViolationRate: { description: "Warm-word lighting briefs whose colour temperature goes cooler than 3000K ambient.", bySystem: constraintViolations },
      abstention: { correctAbstainOnMissingCoverage: abstainCorrect, falseAbstainOnDenseEvidence: falseAbstain, sparseCityStatuses: weak.map((r) => ({ id: r.id, status: r.status })) },
      entityMatchAccuracy: { ...entityAccuracy, details: ent.flatMap((r) => r.entity!.details.map((d) => ({ scenario: r.id, ...d, correct: d.label === d.got }))) },
      personalizationSensitivity: { description: "Same words, different latent taste. justifiedDifferenceRate = differing lines where each side equals its own oracle.", bySystem: sensitivity },
      irrelevantInputStability: { description: "Reordered loves, renamed client, case/spacing changes: identical spec (before clarification).", ...stability },
      clarification,
      latencyMs: { description: "End-to-end runBrief on the in-process synthetic transport: orchestration cost only, not network latency.", p50: pct(ms, 0.5), p95: pct(ms, 0.95), n: ms.length },
      qlooCallsPerBrief: { p50: pct(calls, 0.5), p95: pct(calls, 0.95), max: calls.length ? Math.max(...calls) : null },
      reliability,
      evidenceCompleteness: { description: "Spec lines with a basis, and (for Qloo-evidence lines) cited dimensions, ledger requests and signal entities.", ...evidenceCompleteness },
      invariantViolations,
    },
    rows,
  };

  const outDir = path.join(process.cwd(), "reports");
  mkdirSync(outDir, { recursive: true });
  // The default seed is the headline report; other seeds go to their own files (robustness checks).
  const suffix = SEED === 20261028 ? "" : `-seed-${SEED}`;
  writeFileSync(path.join(outDir, `benchmark-results${suffix}.json`), JSON.stringify(results, null, 2));
  writeFileSync(path.join(outDir, `benchmark-summary${suffix}.md`), summary(results));
  console.log(summary(results));
}

function f(x: number | null | undefined, digits = 2) {
  return x === null || x === undefined ? "—" : x.toFixed(digits);
}
function ci(o: { p?: number | null; mean?: number | null; lo: number | null; hi: number | null; n: number }) {
  const v = o.p ?? o.mean ?? null;
  return v === null ? "—" : `${f(v)} [${f(o.lo)}, ${f(o.hi)}] (n=${o.n})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summary(r: any): string {
  const m = r.metrics;
  const sys = ["B0", "B1", "B2", "B3", "B4a", "B4b"];
  const names: Record<string, string> = { B0: "Literal words only", B1: "LLM only (no Qloo)", B2: "Qloo evidence only (ignores words)", B3: "Tastespec full", B4a: "Tastespec, no clarification", B4b: "Tastespec, no city baseline" };
  const lines = [
    "# Benchmark summary",
    "",
    `> **${r.kind}.** Generated ${r.generatedAt} · commit \`${r.environment.gitSha}\` · seed ${r.environment.seed} · ${r.environment.scenarios} scenarios · ${r.environment.rulebookVersion} · LLM: ${r.environment.llm}.`,
    "> These numbers test the pipeline's inference, abstention, constraints and reliability on synthetic data. They are **not** evidence that real clients prefer Tastespec's output: that needs human labels and live Qloo data, which have not been collected (see `docs/EVALUATION_METHODOLOGY.md`).",
    "",
    "## Spec agreement with the synthetic oracle",
    "",
    "The oracle applies the same rulebook to the synthetic client's latent taste, so this measures how well each system *recovers* taste, not whether the rulebook is good design.",
    "",
    "| System | Mean line agreement (95% CI) | All lines match (95% CI) | Warm-floor violations (95% CI) |",
    "|---|---|---|---|",
    ...sys.map((s) => `| ${s} ${names[s]} | ${m.oracleAgreement.bySystem[s]?.mean === null || m.oracleAgreement.bySystem[s]?.mean === undefined ? m.oracleAgreement.bySystem[s]?.note ?? "—" : ci(m.oracleAgreement.bySystem[s])} | ${ci(m.exactOracleMatch.bySystem[s])} | ${ci(m.constraintViolationRate.bySystem[s])} |`),
    "",
    "## Behaviour",
    "",
    "| Metric | Result |",
    "|---|---|",
    `| Latent taste recovery: top atmosphere in true top-2 | ${ci(m.latentTasteRecovery.top1InTrueTop2)} |`,
    `| Mean top-2 overlap with true taste | ${ci(m.latentTasteRecovery.meanTop2Overlap)} |`,
    `| Entity match accuracy (labelled references incl. abstain cases) | ${ci(m.entityMatchAccuracy)} |`,
    `| Correct abstention when nothing resolves | ${ci(m.abstention.correctAbstainOnMissingCoverage)} |`,
    `| False abstention on dense evidence | ${ci(m.abstention.falseAbstainOnDenseEvidence)} |`,
    `| Sparse-city outcomes | ${m.abstention.sparseCityStatuses.map((x: { id: string; status: string }) => `${x.id}: ${x.status}`).join(", ")} |`,
    `| Irrelevant-input stability (identical spec) | ${ci(m.irrelevantInputStability)} |`,
    `| Questions asked | ${m.clarification.questionsAsked} of ${m.clarification.briefsEligible} eligible briefs |`,
    `| Questions whose answer changed the spec | ${ci(m.clarification.questionsThatChangedTheSpec)} |`,
    `| Expected vs realised lines changed per question | ${f(m.clarification.meanExpectedChange.mean)} vs ${f(m.clarification.meanRealizedChange.mean)} |`,
    `| Oracle agreement gain per question | ${ci(m.clarification.oracleAgreementGainPerQuestion)} |`,
    `| Failure scenarios handled correctly | ${ci(m.reliability.handledCorrectly)} |`,
    `| Normal scenarios completed without error | ${ci(m.reliability.normalCompletion)} |`,
    `| Evidence completeness (lines with full provenance) | ${ci(m.evidenceCompleteness)} |`,
    `| Invariant violations | ${m.invariantViolations.length} |`,
    `| Orchestration latency p50 / p95 (synthetic transport) | ${m.latencyMs.p50} / ${m.latencyMs.p95} ms |`,
    `| Qloo calls per brief p50 / p95 / max | ${m.qlooCallsPerBrief.p50} / ${m.qlooCallsPerBrief.p95} / ${m.qlooCallsPerBrief.max} |`,
    "",
    "## Personalisation sensitivity (same words, different taste)",
    "",
    "Different output is not automatically better. *Justified* = a differing line where each client's value equals their own oracle.",
    "",
    "| System | Pairs | Oracle differs | System differs | Differing lines | Justified rate (95% CI) |",
    "|---|---|---|---|---|---|",
    ...["B0", "B2", "B3", "B4a"].map((s) => {
      const x = m.personalizationSensitivity.bySystem[s];
      return `| ${s} | ${x.pairs} | ${x.pairsWhereOracleDiffers} | ${x.pairsWhereSystemDiffers} | ${x.differingLines} | ${ci(x.justifiedDifferenceRate)} |`;
    }),
    "",
    "## Not measured",
    "",
    ...Object.entries(r.notMeasured).filter(([, v]) => v).map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "Reproduce: `npm run benchmark` (add `-- --seed=N` for another world; `-- --with-llm` with `ANTHROPIC_API_KEY` to include B1).",
    "",
  ];
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
