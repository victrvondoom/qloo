// Controlled perturbation tests with fixed seeds. Writes reports/robustness-results.json and
// reports/robustness-summary.md. Exit 1 if any invariant is violated or a scenario did not execute.
//
//   npm run robustness [-- --seeds=1,2,3,4]

import { mkdirSync, writeFileSync } from "node:fs";
import { runRobustness } from "../src/lib/robustness";

process.env.VITEST = "1";
async function main() {
  const arg = process.argv.find((a) => a.startsWith("--seeds="));
  const seeds = arg ? arg.slice(8).split(",").map(Number).filter(Number.isFinite) : [1, 2, 3, 4];
  const { results, summary } = await runRobustness({ seeds });
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/robustness-results.json", JSON.stringify({ kind: "SYNTHETIC robustness run (fixture world, deterministic seeds)", generatedAt: new Date().toISOString(), seeds, summary, results }, null, 2));
  const md = [
    "# Robustness summary",
    "",
    `> **SYNTHETIC.** Perturbations of briefs run through the real pipeline on the fixture and benchmark worlds, seeds ${seeds.join(", ")}. Nothing here was run against live Qloo. Generated ${new Date().toISOString()}.`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Scenarios | ${summary.total} |`,
    `| Validly executed | ${summary.executed} |`,
    `| Not executed | ${summary.notExecuted} |`,
    `| Invariant violations | ${summary.invariantViolations} |`,
    `| Corruption scenarios | ${summary.corruptionScenarios} |`,
    `| Invalid-evidence rejection rate | ${summary.invalidEvidenceRejectionRate === null ? "n/a" : `${Math.round(summary.invalidEvidenceRejectionRate * 100)}%`} |`,
    `| Mean / p95 execution time | ${summary.latencyMs.mean} ms / ${summary.latencyMs.p95} ms (n=${summary.latencyMs.n}; in-process, no network) |`,
    "",
    "| Category | Scenarios | Violations |",
    "|---|---|---|",
    ...Object.entries(summary.byCategory).map(([c, v]) => `| ${c.replace(/_/g, " ")} | ${v.scenarios} | ${v.violations} |`),
    "",
    summary.failingScenarios.length ? `## Failing scenarios\n\n${results.filter((r) => r.violations.length).map((r) => `- **${r.id}** (${r.category}, seed ${r.seed}): ${r.violations.join("; ")}`).join("\n")}\n` : "No invariant was violated.",
    "",
    "Invariants: I1 written limits dominate; I2 no Qloo evidence means no Qloo personalisation; I3 corrupted evidence never gets a clean verification; I4 irrelevant changes change nothing; I5 ambiguous entities are flagged or resolved; I6 failed requests are never evidence and leak no secret; I7 revisions are traceable and the earlier brief is untouched.",
    "",
    "Reproduce: `npm run robustness`. Same seeds give the same cases. A rate of 100% on a handful of hand-built corruptions shows the checks exist, not that every possible corruption is caught.",
    "",
  ].join("\n");
  writeFileSync("reports/robustness-summary.md", md);
  console.log(`${summary.total} scenarios, ${summary.executed} executed, ${summary.invariantViolations} violation(s), rejection ${summary.invalidEvidenceRejectionRate}`);
  for (const r of results.filter((x) => x.violations.length)) console.log(`  ${r.id}: ${r.violations.join("; ")}`);
  process.exit(summary.invariantViolations || summary.notExecuted ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
