// Studio tools: quantities, day clock, exports, history, taste axes, duet.
import { beforeAll, describe, expect, it } from "vitest";
import { answerQuestion, recordDecision, runBrief } from "@/lib/agent";
import { dayClock, fixtureScheduleCsv, mergeDuet, quantityPlan, similarity, specHistory, specJson, tasteAxes } from "@/lib/studio";
import type { Brief } from "@/lib/types";

const base = { trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"] };
let maya: Brief;
let jordan: Brief;
beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  [maya, jordan] = await Promise.all([
    runBrief({ ...base, clientLabel: "Maya", loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] }, () => {}),
    runBrief({ ...base, clientLabel: "Jordan", loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] }, () => {}),
  ]);
});

describe("quantity plan (lumen method)", () => {
  it("uses the spec's lux target and scales with area", () => {
    const small = quantityPlan(maya, { lengthM: 4, widthM: 3, heightM: 2.7 });
    const big = quantityPlan(maya, { lengthM: 8, widthM: 6, heightM: 2.7 });
    expect(small.targetLux).toBe(Number(maya.spec.find((l) => l.id === "level")!.value.match(/~(\d+)/)![1]));
    expect(small.lumensInstalled).toBe(Math.round((small.targetLux * 12) / (0.5 * 0.8)));
    expect(big.ambient.count).toBeGreaterThan(small.ambient.count);
    expect(big.assumptions.join(" ")).toMatch(/estimate/);
  });
  it("clamps silly dimensions", () => {
    const p = quantityPlan(maya, { lengthM: -3, widthM: 0, heightM: 99 });
    expect(p.areaM2).toBe(1);
  });
});

describe("day clock", () => {
  it("covers 24 hours with the spec's scenes and warms toward night", () => {
    const h = dayClock(maya);
    expect(h).toHaveLength(24);
    expect(h[12].daylight).toBe(true);
    expect(h[3].scene).toBe("Night path");
    expect(h[23].kelvin).toBeLessThanOrEqual(h[12].kelvin);
  });
});

describe("exports", () => {
  it("CSV carries the spec's colour, rendering and control and is labelled", () => {
    const csv = fixtureScheduleCsv(maya);
    expect(csv).toMatch(/SYNTHETIC DEMO DATA/);
    expect(csv).toContain("Ref,Item,Quantity");
    expect(csv.split("\n").filter((l) => /^F\d\d,/.test(l)).length).toBeGreaterThan(3);
    expect(csv).not.toContain(maya.ownerHash ?? "no-owner");
  });
  it("JSON is structured, with no owner or pasted message", () => {
    const j = specJson({ ...maya, ownerHash: "f".repeat(64), input: { ...maya.input, sourceText: "secret" } });
    const t = JSON.stringify(j);
    expect(j.lines).toHaveLength(maya.spec.length);
    expect(t).not.toContain("secret");
    expect(t).not.toContain("f".repeat(64));
  });
});

describe("history", () => {
  it("reads runs, answers and decisions from the ledger in order", async () => {
    let b = maya;
    if (b.question) b = await answerQuestion(b, "A", "client");
    b = await recordDecision(b, b.spec[0].id, "accepted");
    const h = specHistory(b);
    expect(h[0].kind).toBe("run");
    expect(h.some((x) => x.kind === "decision")).toBe(true);
    if (maya.question) expect(h.some((x) => x.kind === "answer" && x.actor === "client")).toBe(true);
    expect(h.map((x) => x.seq)).toEqual([...h.map((x) => x.seq)].sort((p, q) => p - q));
  });
});

describe("taste space and similarity", () => {
  it("puts Maya warmer and more characterful than Jordan", () => {
    const v = (b: Brief) => Object.fromEntries(b.dimensions.map((d) => [d.id, d.score]));
    const m = tasteAxes(v(maya));
    const j = tasteAxes(v(jordan));
    expect(m.warm).toBeGreaterThan(j.warm);
    expect(m.character).toBeGreaterThan(j.character);
    expect(similarity(maya.dimensions, maya.dimensions)).toBe(1);
    expect(similarity(maya.dimensions, jordan.dimensions)).toBeLessThan(1);
  });
});

describe("duet", () => {
  it("merges two clients into one spec with per-line verdicts", () => {
    const d = mergeDuet(maya, jordan);
    expect(d.lines).toHaveLength(maya.spec.length);
    for (const l of d.lines) {
      if (l.a === l.b) expect(l.verdict).toBe("agree");
      if (l.verdict === "leans A") expect(l.together).toBe(l.a);
      if (l.verdict === "leans B") expect(l.together).toBe(l.b);
    }
    expect(d.lines.some((l) => l.verdict !== "agree")).toBe(true);
    // both said "warm": the merged room keeps the warm-light floor
    expect(d.lines.find((l) => l.lineId === "cct")!.together).not.toMatch(/3500K ambient|4000K/);
    const self = mergeDuet(maya, maya);
    expect(self.lines.every((l) => l.verdict === "agree")).toBe(true);
    expect(self.agreement).toBe(1);
  });
});
