// Controlled fixture measurement of the clarification policy: how many questions a naive "always ask the
// top-ranked contrast" policy would ask versus the optimizer, on the benchmark's synthetic clients.
// Synthetic world; says nothing about real clients. Writes reports/clarification-eval.json.
//
//   npm run clarify-eval

import { mkdirSync, writeFileSync } from "node:fs";
import { runBrief } from "../src/lib/agent";
import { explainClarification } from "../src/lib/clarify";
import { clearQlooCache } from "../src/lib/qloo/client";
import { buildBenchmark } from "../benchmarks/scenarios";

process.env.VITEST = "1";
process.env.QLOO_MODE = "fixture";
async function main() {
  const { world, scenarios } = buildBenchmark();
  let usable = 0, naive = 0, optimized = 0, asksWithoutImpact = 0, linesAtStake = 0;
  for (const sc of scenarios) {
    if (sc.failure) continue;
    world.failure = { kind: "none" };
    clearQlooCache();
    let b;
    try { b = await runBrief(sc.input, () => {}, { transport: world, useLlm: false, budgetMs: 20_000 }); } catch { continue; }
    if (b.status !== "COMPLETE" && b.status !== "NEEDS_CLARIFICATION") continue;
    usable++;
    const r = explainClarification(b);
    if (r.candidates.some((c) => c.expectedChange > 0)) naive++;
    if (r.asked) {
      optimized++;
      linesAtStake += r.asked.affected.length;
      if (r.asked.affected.length < 2) asksWithoutImpact++;
    }
  }
  const report = {
    kind: "Clarification policy on the SYNTHETIC benchmark clients (fixture world)",
    generatedAt: new Date().toISOString(),
    briefsWithUsableEvidence: usable,
    naivePolicyWouldAsk: naive,
    optimizerAsked: optimized,
    questionsAvoided: naive - optimized,
    unnecessaryQuestionReduction: naive ? +(1 - optimized / naive).toFixed(3) : null,
    askedQuestionsAffectingFewerThanTwoLines: asksWithoutImpact,
    meanLinesAffectedPerAskedQuestion: optimized ? +(linesAtStake / optimized).toFixed(2) : null,
    naivePolicyDefinition: "asks whenever any contrast would change at least some expected number of lines (> 0)",
    note: "A decision-impact heuristic, not calibrated information gain. Whether the answers help clients is not measured here.",
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/clarification-eval.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
