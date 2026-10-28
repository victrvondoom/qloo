// Data for the landing page: the two demo clients (built on the synthetic
// fixture world, always labelled as such) and the headline benchmark numbers
// read from the committed report. Nothing here calls Qloo.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { runBrief } from "./agent";
import { buildDeepBrief } from "./deep/build";
import { DIMENSION_BY_ID } from "./dimensions";
import { FixtureTransport } from "./qloo/fixture";
import type { Brief, BriefInput, DimensionId } from "./types";

export interface DemoClient {
  name: string;
  words: string[];
  loves: string[];
  title: string;
  meanings: { word: string; means: string; literal: string }[];
  top: { id: DimensionId; short: string; lift: number }[];
  /** The leading atmosphere of each taste-matched place, for the film's scatter. */
  places: (DimensionId | null)[];
  spec: { id: string; category: string; value: string; literalValue: string }[];
  dims: { id: DimensionId; score: number }[];
  references: string[];
}

export interface DemoPair {
  maya: DemoClient;
  jordan: DemoClient;
  room: BriefInput["room"];
  trade: BriefInput["trade"];
  city: string;
  differing: number;
  lines: number;
}

const BASE = { trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"] };
export const DEMO_INPUTS: Record<"maya" | "jordan", BriefInput> = {
  maya: { ...BASE, clientLabel: "Maya", loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel (hotel)", "Norah Jones"] },
  jordan: { ...BASE, clientLabel: "Jordan", loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] },
};

function toClient(b: Brief): DemoClient {
  const deep = buildDeepBrief(b);
  return {
    name: b.input.clientLabel,
    words: b.input.words,
    loves: b.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => r.chosen!.name),
    title: deep.title,
    meanings: b.words.map((w) => ({ word: w.word, means: w.chosen?.meaning ?? "", literal: w.readings.find((r) => r.isDictionaryDefault)?.meaning ?? "" })),
    top: [...b.dimensions]
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map((d) => ({ id: d.id, short: DIMENSION_BY_ID[d.id].short, lift: +d.lift.toFixed(1) })),
    places: [...b.crowdVenues].sort((x, y) => (y.affinity ?? 0) - (x.affinity ?? 0)).slice(0, 24).map((v) => v.dimensions[0] ?? null),
    spec: b.spec.map((l) => ({ id: l.id, category: l.category, value: l.value, literalValue: l.literalValue })),
    dims: b.dimensions.map((d) => ({ id: d.id, score: d.score })),
    references: deep.references.slice(0, 4).map((r) => r.name),
  };
}

let pair: Promise<DemoPair> | undefined;

/** Maya and Jordan: the same words, different loves, run on the synthetic world. Cached per process. */
export function demoPair(): Promise<DemoPair> {
  pair ??= (async () => {
    const [m, j] = await Promise.all([
      runBrief(DEMO_INPUTS.maya, () => {}, { transport: new FixtureTransport(), useLlm: false }),
      runBrief(DEMO_INPUTS.jordan, () => {}, { transport: new FixtureTransport(), useLlm: false }),
    ]);
    const maya = toClient(m);
    const jordan = toClient(j);
    return {
      maya,
      jordan,
      room: BASE.room,
      trade: BASE.trade,
      city: BASE.city,
      differing: maya.spec.filter((l) => jordan.spec.find((x) => x.id === l.id)?.value !== l.value).length,
      lines: maya.spec.length,
    };
  })().catch((err) => {
    pair = undefined;
    throw err;
  });
  return pair;
}

export interface BenchmarkHeadline {
  scenarios: number;
  generatedAt: string;
  systems: { id: string; label: string; mean: number; lo: number; hi: number }[];
  warmFloorViolations: { b2: number; b3: number };
  invariantViolations: number;
}

/** Headline numbers from reports/benchmark-results.json (synthetic world), or undefined if the report isn't shipped. */
export async function benchmarkHeadline(): Promise<BenchmarkHeadline | undefined> {
  try {
    const j = JSON.parse(await readFile(path.join(process.cwd(), "reports", "benchmark-results.json"), "utf8"));
    const by = j.metrics.oracleAgreement.bySystem as Record<string, { mean: number | null; lo: number; hi: number }>;
    const labels: Record<string, string> = { B0: "Literal reading of the words", B2: "Qloo evidence, no safeguards", B4b: "Tastespec without taste tags", B4a: "Tastespec without the question", B3: "Tastespec" };
    return {
      scenarios: j.metrics.oracleAgreement.scenarios,
      generatedAt: j.generatedAt,
      systems: ["B0", "B2", "B4b", "B4a", "B3"].filter((k) => typeof by[k]?.mean === "number").map((k) => ({ id: k, label: labels[k], mean: by[k].mean!, lo: by[k].lo, hi: by[k].hi })),
      warmFloorViolations: { b2: j.metrics.constraintViolationRate.bySystem.B2.p, b3: j.metrics.constraintViolationRate.bySystem.B3.p },
      invariantViolations: (j.metrics.invariantViolations ?? []).length,
    };
  } catch {
    return undefined;
  }
}
