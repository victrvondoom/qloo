// Builds study/cases.json: client briefs with candidate specifications from the
// real pipeline, for the blinded human study (/study). Run it with the same
// QLOO_MODE you want the cases to carry: fixture cases are labelled fixture,
// and responses collected on them say so.
//
//   npm run study:cases

import { mkdirSync, writeFileSync } from "node:fs";
import { runBrief } from "../src/lib/agent";
import { limitChips, limitsOf, parseConstraints } from "../src/lib/constraints";
import { RULEBOOK_VERSION, ROOM_LABEL, runRulebook } from "../src/lib/rulebooks";
import { literalSpec, zeroVector } from "../src/lib/spec";
import { caseVersion, type StudyCase, type StudyLine } from "../src/lib/study";
import { PRESETS } from "../src/components/presets";
import type { BriefInput } from "../src/lib/types";

process.env.VITEST = "1";
const lines = (xs: { category: string; value: string }[]): StudyLine[] => xs.map((l) => ({ category: l.category, value: l.value }));

const base = (k: number): BriefInput => PRESETS[k].input;
const SPECS: { id: string; title: string; input: BriefInput; sentence?: string }[] = [
  { id: "maya-warm-modern", title: "Maya: warm, modern", input: base(0) },
  { id: "jordan-warm-modern", title: "Jordan: warm, modern", input: base(1) },
  { id: "jordan-modern-2700-3000", title: "Jordan: modern, light between 2700K and 3000K", input: { ...base(1), words: ["modern"] }, sentence: "Please keep the light between 2700K and 3000K." },
  { id: "maya-cri-dim", title: "Maya: warm, modern, CRI 95+, dim to 5%", input: base(0), sentence: "Minimum CRI 95, and it must dim to 5%." },
  { id: "jordan-modern-lux", title: "Jordan: modern, about 250 lux", input: { ...base(1), words: ["modern"] }, sentence: "We want about 250 lux." },
];

async function main() {
const cases: StudyCase[] = [];
for (const s of SPECS) {
  const parsed = parseConstraints(s.sentence ?? "");
  const input: BriefInput = { ...s.input, cctRange: parsed.limits.cct, criMin: parsed.limits.criMin, dimTo: parsed.limits.dimTo, dimmable: parsed.limits.dimmable, luxTarget: parsed.limits.luxTarget, sourceText: s.sentence };
  const brief = await runBrief(input, () => {}, { useLlm: false });
  const usable = brief.status === "COMPLETE" || brief.status === "NEEDS_CLARIFICATION";
  if (!usable) {
    console.error(`skipping ${s.id}: status ${brief.status}`);
    continue;
  }
  const v = zeroVector();
  for (const d of brief.dimensions) v[d.id] = d.score;
  const candidates: StudyCase["candidates"] = {
    // Same words and hard limits, no Qloo.
    B0: lines(literalSpec(brief.input.trade, brief.input.room, brief.input.words, limitsOf(brief.input))),
    // Qloo evidence alone through the rulebook: ignores the client's words and limits, by design (see the benchmark).
    B2: lines(runRulebook(brief.input.trade, v, brief.input.room, {})),
    B3: lines(brief.spec),
  };
  const body = {
    id: s.id,
    title: s.title,
    brief: {
      clientLabel: input.clientLabel,
      city: input.city,
      room: ROOM_LABEL[input.room],
      words: input.words,
      loves: input.loves,
      constraints: limitChips(parsed.limits),
    },
    dataMode: brief.dataMode,
    rulebook: RULEBOOK_VERSION,
    candidates,
  };
  cases.push({ ...body, version: await caseVersion(body) });
}
mkdirSync("study", { recursive: true });
writeFileSync("study/cases.json", JSON.stringify(cases, null, 2) + "\n");
console.log(`wrote study/cases.json: ${cases.length} cases, mode ${cases[0]?.dataMode ?? "n/a"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
