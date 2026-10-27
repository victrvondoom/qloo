// Property-based checks over seeded random inputs (no extra dependency).
import { describe, expect, it } from "vitest";
import { rng } from "../benchmarks/world";
import { DIMENSIONS } from "@/lib/dimensions";
import { applyClientAnswer, computeDimensions } from "@/lib/fingerprint";
import { buildSpec, literalSpec, specMenu } from "@/lib/spec";
import { decodeWord, WORD_LEXICON } from "@/lib/words";
import { ROOM_LABEL } from "@/lib/rulebooks";
import type { DimensionScore, RoomType, Trade } from "@/lib/types";

const WORDS = Object.keys(WORD_LEXICON);
const ROOMS = Object.keys(ROOM_LABEL) as RoomType[];
const N = 400;

function randomCase(r: () => number) {
  const dims: DimensionScore[] = computeDimensions([], [], []).map((d) => ({ ...d, score: Math.round((r() * 2 - 1) * 100) / 100, pGreater: r() }));
  const words = Array.from({ length: 1 + Math.floor(r() * 3) }, () => WORDS[Math.floor(r() * WORDS.length)]);
  const trade: Trade = r() < 0.6 ? "lighting" : "finishes";
  const room = ROOMS[Math.floor(r() * ROOMS.length)];
  return { dims, words, trade, room };
}

describe("properties", () => {
  it("P1: without usable evidence, every line is the literal reading at low confidence", () => {
    const r = rng(1);
    for (let i = 0; i < N; i++) {
      const c = randomCase(r);
      const spec = buildSpec(c.trade, c.room, c.dims, c.words.map((w) => decodeWord(w, c.dims)), c.words, undefined, { evidenceUsable: false, evidenceLedger: [], signalEntityIds: [] });
      for (const l of spec) {
        expect(l.value).toBe(l.literalValue);
        expect(l.confidence).toBe("low");
        expect(l.basis).toBe("literal_fallback");
      }
    }
  });

  it("P2: a warm-word lighting brief is never cooler than 3000K ambient, whatever the evidence", () => {
    const r = rng(2);
    for (let i = 0; i < N; i++) {
      const c = randomCase(r);
      const words = [...c.words, "warm"];
      const spec = buildSpec("lighting", c.room, c.dims, words.map((w) => decodeWord(w, c.dims)), words, undefined, { evidenceUsable: true, evidenceLedger: [1], signalEntityIds: ["x"] });
      expect(spec.find((l) => l.id === "cct")!.value).not.toMatch(/3500K ambient|4000K/);
    }
  });

  it("P3: every emitted value is on the menu the LLM baseline chooses from", () => {
    const r = rng(3);
    for (let i = 0; i < N; i++) {
      const c = randomCase(r);
      const menu = specMenu(c.trade, c.room, c.words);
      const spec = buildSpec(c.trade, c.room, c.dims, c.words.map((w) => decodeWord(w, c.dims)), c.words, undefined, { evidenceUsable: true, evidenceLedger: [1], signalEntityIds: ["x"] });
      for (const l of spec) expect(menu[l.id].values).toContain(l.value);
      for (const l of literalSpec(c.trade, c.room, c.words)) expect(menu[l.id].values).toContain(l.value);
    }
  });

  it("P4: a client answer yields the stated ordering, moves nothing else, and is idempotent", () => {
    const r = rng(4);
    for (let i = 0; i < N; i++) {
      const c = randomCase(r);
      const d = DIMENSIONS[Math.floor(r() * DIMENSIONS.length)];
      const after = applyClientAnswer(c.dims, d.id, d.opposite);
      const a = after.find((x) => x.id === d.id)!.score;
      const b = after.find((x) => x.id === d.opposite)!.score;
      // The chosen atmosphere always ends ahead by at least the margin (found by this test: it once failed near -1).
      expect(a - b).toBeGreaterThanOrEqual(0.4 - 1e-9);
      for (const x of after) if (x.id !== d.id && x.id !== d.opposite) expect(x.score).toBe(c.dims.find((y) => y.id === x.id)!.score);
      const twice = applyClientAnswer(after, d.id, d.opposite);
      expect(twice.map((x) => x.score)).toEqual(after.map((x) => x.score));
    }
  });

  it("P5: word decoding weights are a distribution and the literal sense wins without evidence", () => {
    const zero = computeDimensions([], [], []).map((d) => ({ ...d, score: 0 }));
    for (const w of WORDS) {
      const dec = decodeWord(w, zero);
      expect(dec.readings.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 6);
      expect(dec.chosen?.isDictionaryDefault).toBe(true);
    }
  });

  it("P6: spec building is deterministic and independent of word order", () => {
    const r = rng(6);
    for (let i = 0; i < 100; i++) {
      const c = randomCase(r);
      const one = buildSpec(c.trade, c.room, c.dims, c.words.map((w) => decodeWord(w, c.dims)), c.words);
      const rev = [...c.words].reverse();
      const two = buildSpec(c.trade, c.room, c.dims, rev.map((w) => decodeWord(w, c.dims)), rev);
      expect(two.map((l) => l.value)).toEqual(one.map((l) => l.value));
    }
  });
});
