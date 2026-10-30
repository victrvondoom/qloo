// What the response cache and request de-duplication save on the evidence sensitivity analysis.
// Fixture transport only: counts are real, but they are counts of requests to a synthetic world, not
// live Qloo latency, quota or money. Writes reports/query-budget.json.
//
//   npm run query-budget

import { mkdirSync, writeFileSync } from "node:fs";
import { runBrief } from "../src/lib/agent";
import { computeInfluence } from "../src/lib/influence";
import { clearQlooCache, QlooClient, type Params, type Transport } from "../src/lib/qloo/client";
import { FixtureTransport } from "../src/lib/qloo/fixture";
import { compileSpec } from "../src/lib/compiler";
import { sensitivityFromBrief } from "../src/lib/sensitivity";
import type { BriefInput } from "../src/lib/types";

process.env.VITEST = "1";
process.env.QLOO_MODE = "fixture";

const MAYA: BriefInput = { clientLabel: "Maya", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"], cctRange: { min: 2700, max: 3000 }, criMin: 95 };

class Counting implements Transport {
  readonly mode = "fixture" as const;
  calls = 0;
  private inner = new FixtureTransport();
  async get(path: string, p: Params) {
    this.calls++;
    return this.inner.get(path, p);
  }
}

async function scenario(cache: boolean) {
  clearQlooCache();
  const t = new Counting();
  const t0 = Date.now();
  // The same brief analysed three times, as happens when a designer reruns, a judge reloads, or two tabs ask at once.
  const brief = await runBrief(MAYA, () => {}, { transport: t });
  const outcomes: string[] = [];
  for (let i = 0; i < 3; i++) {
    const out = await computeInfluence(structuredClone(brief), t, { cache });
    const s = sensitivityFromBrief(out.brief);
    outcomes.push(JSON.stringify([s.stabilityIndex, s.lines.map((l) => [l.lineId, l.stability]), s.hardLimitViolations]));
  }
  // Two identical requests at once.
  const c = new QlooClient(t, undefined, { cache });
  const before = t.calls;
  await Promise.all([c.search("Khruangbin"), c.search("Khruangbin")]);
  return { calls: t.calls, concurrentDuplicateCalls: t.calls - before, ms: Date.now() - t0, outcomes, spec: (await compileSpec(brief)).versionId };
}

async function main() {
  const off = await scenario(false);
  const on = await scenario(true);
  // The influence call path above builds its own client, so also count it directly through its public option.
  const report = {
    kind: "Query-budget measurement on the FIXTURE transport (counts of requests to a synthetic world; not live Qloo latency, quota or cost)",
    generatedAt: new Date().toISOString(),
    scenario: "one brief, then the evidence sensitivity analysis three times, then two identical concurrent searches",
    withoutCache: { transportCalls: off.calls, concurrentDuplicateCalls: off.concurrentDuplicateCalls, ms: off.ms },
    withCache: { transportCalls: on.calls, concurrentDuplicateCalls: on.concurrentDuplicateCalls, ms: on.ms },
    callsSaved: off.calls - on.calls,
    duplicateReduction: off.calls ? +(1 - on.calls / off.calls).toFixed(3) : null,
    resultsIdentical: JSON.stringify(off.outcomes) === JSON.stringify(on.outcomes) && off.spec === on.spec,
    limitsPreserved: on.outcomes.every((o) => JSON.parse(o)[2] === 0),
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/query-budget.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.resultsIdentical && report.limitsPreserved ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
