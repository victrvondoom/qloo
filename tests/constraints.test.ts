// Explicit client constraints: a colour-temperature range the client wrote down
// bounds the spec, whatever the evidence or the warm-word rule says.
import { beforeAll, describe, expect, it } from "vitest";
import { rng } from "../benchmarks/world";
import { answerQuestion, cleanInput, computeLiteral, runBrief, validateBrief } from "@/lib/agent";
import { applyCctRange, applyCriLimit, applyDimLimit, cleanCctRange, cleanLimits, parseCctRange, parseConstraints } from "@/lib/constraints";
import { computeDimensions } from "@/lib/fingerprint";
import { parseIntakeHeuristic } from "@/lib/intake";
import { replayBrief } from "@/lib/replay";
import { buildSpec, literalSpec } from "@/lib/spec";
import { decodeWord, WORD_LEXICON } from "@/lib/words";
import type { Brief, DimensionScore } from "@/lib/types";

const WORDS = Object.keys(WORD_LEXICON);
const kelvins = (v: string) => (v.match(/\d{4}/g) ?? []).map(Number);

describe("parseCctRange", () => {
  it("reads ranges, caps and floors written in a message", () => {
    expect(parseCctRange("Use warm white lighting between 2700K and 3000K.")).toEqual({ min: 2700, max: 3000 });
    expect(parseCctRange("2700–3000K please")).toEqual({ min: 2700, max: 3000 });
    expect(parseCctRange("3000 to 2700K")).toEqual({ min: 2700, max: 3000 });
    expect(parseCctRange("no cooler than 3000K")).toEqual({ min: 1800, max: 3000 });
    expect(parseCctRange("at least 2700K, no higher than 3000K")).toEqual({ min: 2700, max: 3000 });
  });
  it("ignores things that are not a colour-temperature constraint", () => {
    expect(parseCctRange("warm and modern")).toBeUndefined();
    expect(parseCctRange("a 2024 renovation, budget 3000 dollars")).toBeUndefined();
    expect(parseCctRange("between 100K and 200K")).toBeUndefined();
    expect(parseCctRange("under 9000K")).toBeUndefined();
  });
  it("rejects bad ranges from outside", () => {
    expect(cleanCctRange({ min: 3000, max: 2700 })).toBeUndefined();
    expect(cleanCctRange({ min: "2700", max: 3000 })).toBeUndefined();
    expect(cleanCctRange({ min: 2700.5, max: 3000 })).toBeUndefined();
    expect(cleanCctRange(null)).toBeUndefined();
    expect(cleanCctRange({ min: 2700, max: 3000 })).toEqual({ min: 2700, max: 3000 });
  });
  it("comes through the intake parser and the input cleaner", () => {
    const d = parseIntakeHeuristic("Hi, we're in Austin, want the living room warm. We love Khruangbin and The Bear. Please keep the light between 2700K and 3000K.");
    expect(d.cctRange).toEqual({ min: 2700, max: 3000 });
    expect(cleanInput({ ...d, cctRange: { min: 3000, max: 100 } }).cctRange).toBeUndefined();
    expect(cleanInput({ ...d }).cctRange).toEqual({ min: 2700, max: 3000 });
  });
});

describe("applyCctRange", () => {
  const r = { min: 2700, max: 3000 };
  it("clamps every shape the rulebook can emit into the range", () => {
    for (const v of ["2200–2700K with dim-to-warm (glows amber as it dims)", "2700K throughout", "3000K throughout", "3000K ambient, 3500K on task surfaces", "3500K ambient, 4000K on task surfaces"]) {
      const out = applyCctRange(v, r);
      expect(kelvins(out.value).every((k) => k >= 2700 && k <= 3000)).toBe(true);
    }
    expect(applyCctRange("3500K ambient, 4000K on task surfaces", r).value).toBe("3000K throughout");
    expect(applyCctRange("2200–2700K with dim-to-warm (glows amber as it dims)", r).value).toBe("2700K throughout");
  });
  it("says so when it changed nothing, and when it did", () => {
    expect(applyCctRange("2700K throughout", r).note).toMatch(/honoured/);
    expect(applyCctRange("3500K ambient, 4000K on task surfaces", r).note).toMatch(/applied/);
  });
});

describe("constraint dominance (property)", () => {
  it("whatever the evidence, words or room, the written range holds", () => {
    const rnd = rng(7);
    const range = { min: 2700, max: 3000 };
    const rooms = ["living_room", "kitchen", "home_office", "bedroom", "bar"] as const;
    for (let i = 0; i < 300; i++) {
      const dims: DimensionScore[] = computeDimensions([], [], []).map((d) => ({ ...d, score: Math.round((rnd() * 2 - 1) * 100) / 100, pGreater: rnd() }));
      const words = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => WORDS[Math.floor(rnd() * WORDS.length)]);
      const room = rooms[Math.floor(rnd() * rooms.length)];
      for (const usable of [true, false]) {
        const spec = buildSpec("lighting", room, dims, words.map((w) => decodeWord(w, dims)), words, undefined, { evidenceUsable: usable, evidenceLedger: usable ? [1] : [], signalEntityIds: [], limits: { cct: range } });
        const cct = spec.find((l) => l.id === "cct")!;
        expect(kelvins(cct.value).every((k) => k >= range.min && k <= range.max)).toBe(true);
        expect(kelvins(cct.literalValue).every((k) => k >= range.min && k <= range.max)).toBe(true);
      }
    }
  });
  it("the literal baseline obeys the same range, so comparisons stay fair", () => {
    const lit = literalSpec("lighting", "kitchen", ["industrial", "clean"], { cct: { min: 2700, max: 3000 } }).find((l) => l.id === "cct")!;
    expect(kelvins(lit.value).every((k) => k <= 3000)).toBe(true);
    const free = literalSpec("lighting", "kitchen", ["industrial", "clean"]).find((l) => l.id === "cct")!;
    expect(kelvins(free.value).some((k) => k > 3000)).toBe(true);
  });
});

describe("end to end on the synthetic world", () => {
  let jordan: Brief;
  let jordanFree: Brief;
  const base = { clientLabel: "Jordan", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["modern"], loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };
  beforeAll(async () => {
    process.env.QLOO_MODE = "fixture";
    delete process.env.ANTHROPIC_API_KEY;
    [jordan, jordanFree] = await Promise.all([runBrief({ ...base, cctRange: { min: 2700, max: 3000 } }, () => {}), runBrief(base, () => {})]);
  });
  it("evidence points cool for Jordan; the client's range still wins and is labelled", () => {
    const free = jordanFree.spec.find((l) => l.id === "cct")!;
    expect(kelvins(free.value).some((k) => k > 3000)).toBe(true);
    const bound = jordan.spec.find((l) => l.id === "cct")!;
    expect(kelvins(bound.value).every((k) => k >= 2700 && k <= 3000)).toBe(true);
    expect(bound.basis).toBe("constraint");
    expect(bound.constraints.some((c) => /client range .*applied/.test(c))).toBe(true);
  });
  it("other lines still follow the evidence, and the stored brief replays", async () => {
    for (const id of ["layers", "fixtures"]) expect(jordan.spec.find((l) => l.id === id)!.value).toBe(jordanFree.spec.find((l) => l.id === id)!.value);
    const rep = await replayBrief(jordan);
    expect(rep.checks.every((c) => c.ok)).toBe(true);
  });
  it("answering the clarifying question cannot break the range", async () => {
    if (!jordan.question) return;
    const after = await answerQuestion(jordan, "A");
    const cct = after.spec.find((l) => l.id === "cct")!;
    expect(kelvins(cct.value).every((k) => k >= 2700 && k <= 3000)).toBe(true);
  });
  it("the no-Qloo recompute uses the stored range", () => {
    const lit = computeLiteral({ ...base, cctRange: { min: 2700, max: 3000 } }).find((l) => l.id === "cct")!;
    expect(kelvins(lit.value).every((k) => k <= 3000)).toBe(true);
  });
});

describe("CRI, dimming and lux limits", () => {
  it("reads each quantity as its own thing", () => {
    expect(parseConstraints("CRI of at least 90").limits.criMin).toBe(90);
    expect(parseConstraints("Minimum CRI 95 please").limits.criMin).toBe(95);
    expect(parseConstraints("Use Ra 90 or above").limits.criMin).toBe(90);
    expect(parseConstraints("Must dim to 10%").limits).toMatchObject({ dimTo: 10, dimmable: true });
    expect(parseConstraints("Dimming range 5% to 100%").limits.dimTo).toBe(5);
    expect(parseConstraints("Lights must support dimming").limits).toEqual({ dimmable: true });
    expect(parseConstraints("about 300 lux on the desk").limits.luxTarget).toBe(300);
  });
  it("does not mistake other numbers for them", () => {
    expect(parseConstraints("built in 2024, budget 3000, 80% done, extra 50 chairs").limits).toEqual({});
    expect(parseConstraints("a 5000 lumen fixture").limits).toEqual({});
  });
  it("notes lumens instead of inventing a room target", () => {
    const p = parseConstraints("We want 2000 lumens in here");
    expect(p.limits.luxTarget).toBeUndefined();
    expect(p.notes.join(" ")).toMatch(/lumens/i);
  });
  it("rejects impossible values and contradictions rather than choosing", () => {
    expect(parseConstraints("CRI 120").conflicts.join(" ")).toMatch(/not possible/);
    expect(parseConstraints("CRI at least 90 and CRI of at least 97").conflicts.join(" ")).toMatch(/two different CRI/);
    expect(parseConstraints("must dim to 0%").conflicts.join(" ")).toMatch(/0% is off/);
    expect(parseConstraints("no dimming needed, but it must dim to 10%").conflicts.join(" ")).toMatch(/asks for dimming and says/);
    expect(parseConstraints("at least 3500K but no higher than 3000K").conflicts.join(" ")).toMatch(/cannot both hold/);
    expect(parseConstraints("300 lux, or maybe 500 lux").conflicts.join(" ")).toMatch(/two different lux/);
    expect(parseConstraints("CRI 120").limits.criMin).toBeUndefined();
  });
  it("cleanLimits rejects bad numbers from outside", () => {
    expect(cleanLimits({ criMin: 120, dimTo: 0, luxTarget: 1, dimmable: "yes" })).toEqual({ cctRange: undefined, criMin: undefined, dimTo: undefined, dimmable: undefined, luxTarget: undefined });
    expect(cleanLimits({ criMin: 95, dimTo: 5, luxTarget: 300, dimmable: true }).criMin).toBe(95);
  });
  it("the rulebook meets every limit, for any vector (property)", () => {
    const rnd = rng(11);
    const rooms = ["living_room", "kitchen", "home_office", "bedroom", "bar"] as const;
    const limits = { cct: { min: 2700, max: 3000 }, criMin: 97, dimTo: 5, dimmable: true, luxTarget: 250 };
    for (let i = 0; i < 300; i++) {
      const dims: DimensionScore[] = computeDimensions([], [], []).map((d) => ({ ...d, score: Math.round((rnd() * 2 - 1) * 100) / 100, pGreater: rnd() }));
      const words = [WORDS[Math.floor(rnd() * WORDS.length)]];
      const spec = buildSpec("lighting", rooms[Math.floor(rnd() * rooms.length)], dims, words.map((w) => decodeWord(w, dims)), words, undefined, { evidenceUsable: true, evidenceLedger: [1], signalEntityIds: ["x"], limits });
      const v = (id: string) => spec.find((l) => l.id === id)!.value;
      expect(Number(/CRI (\d+)\+/.exec(v("cri"))![1])).toBeGreaterThanOrEqual(97);
      expect(Math.min(...[...v("dimming").matchAll(/(\d+)%/g)].map((m) => Number(m[1])))).toBeLessThanOrEqual(5);
      expect(v("level")).toMatch(/\b250 lux/);
      expect(kelvins(v("cct")).every((k) => k >= 2700 && k <= 3000)).toBe(true);
    }
  });
  it("leaves lines alone when the rulebook already satisfies them, and says so", () => {
    expect(applyCriLimit("CRI 95+ with R9 > 50, so wood, skin and food read true.", 90).note).toMatch(/honoured/);
    expect(applyDimLimit("Full-range dimming to 1% and three scenes (day / dinner / late).", 10).value).toMatch(/to 1%/);
    expect(applyDimLimit("Standard 0–10V or phase dimming on ambient circuits.", 10).value).toMatch(/no protocol is assumed/);
  });
  it("does not claim CRI is the whole story", () => {
    expect(applyCriLimit("CRI 90+.", 97).value).toMatch(/TM-30/);
  });
});

describe("limits across the product", () => {
  const base = { clientLabel: "Jordan", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["modern"], loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };
  const message = "Hi, we're in Chicago and want a modern living room. We love Fred again.., Severance (show), MUJI and Blue Bottle Coffee. Please CRI of at least 97, it must dim to 5%, around 250 lux, light between 2700K and 3000K.";
  it("flow from the message through intake into a built, replayable, valid brief", async () => {
    const draft = parseIntakeHeuristic(message);
    const l = draft.constraints!.limits;
    expect(l).toMatchObject({ criMin: 97, dimTo: 5, luxTarget: 250, cct: { min: 2700, max: 3000 } });
    process.env.QLOO_MODE = "fixture";
    const b = await runBrief({ ...base, cctRange: l.cct, criMin: l.criMin, dimTo: l.dimTo, dimmable: l.dimmable, luxTarget: l.luxTarget, sourceText: message }, () => {});
    expect(validateBrief(b)).toEqual([]);
    expect(b.spec.find((x) => x.id === "cri")!.basis).toBe("constraint");
    expect(b.spec.find((x) => x.id === "level")!.value).toMatch(/250 lux/);
    expect((await replayBrief(b)).checks.every((c) => c.ok)).toBe(true);
    const lit = computeLiteral({ ...base, criMin: 97, dimTo: 5, luxTarget: 250 });
    expect(lit.find((x) => x.id === "cri")!.value).toMatch(/CRI 97\+/);
    const forged = { ...b, spec: b.spec.map((x) => (x.id === "cri" ? { ...x, value: "CRI 90+." } : x)) };
    expect(validateBrief(forged)).toContain("cri: below the minimum the client wrote down");
  });
  it("a message with conflicting requirements is refused at intake, not built", async () => {
    const bad = `${message} Actually CRI of at least 90 is fine too.`;
    expect(parseIntakeHeuristic(bad).constraints!.conflicts.length).toBeGreaterThan(0);
    await expect(runBrief({ ...base, sourceText: bad }, () => {})).rejects.toThrow(/Requirements that can't both hold/);
  });
});
