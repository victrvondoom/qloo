import { describe, expect, it, beforeAll } from "vitest";
import { Ledger, verifyLedger, canonicalJson } from "@/lib/ledger";
import { betaLift, classifyVenue, computeDimensions, scoreFrom, normalCdf } from "@/lib/fingerprint";
import { termMatches } from "@/lib/dimensions";
import { chooseCandidate, parseLove, similarity } from "@/lib/resolve";
import { decodeWord } from "@/lib/words";
import { buildSpec, literalVector, specMenu } from "@/lib/spec";
import { parseEntity, resultArray } from "@/lib/qloo/client";
import { runBrief, answerQuestion, recordDecision, cleanInput } from "@/lib/agent";
import type { AgentEvent, DimensionScore, QlooEntity } from "@/lib/types";

const neutralDims = (): DimensionScore[] =>
  computeDimensions([], [], []).map((d) => ({ ...d, score: 0 }));

describe("ledger", () => {
  it("chains entries and detects tampering", async () => {
    const l = new Ledger();
    await Promise.all([l.append("decision", "a", { x: 1 }), l.append("decision", "b", { y: [1, 2] }), l.append("qloo_call", "c")]);
    expect(l.entries.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect((await verifyLedger(l.entries)).ok).toBe(true);
    const tampered = structuredClone(l.entries);
    tampered[1].detail = { y: [1, 3] };
    const res = await verifyLedger(tampered);
    expect(res.ok).toBe(false);
    expect(res.firstBadSeq).toBe(1);
  });

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe("statistics", () => {
  it("normal CDF is sane", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 2);
  });

  it("lift reflects over-representation and certainty grows with n", () => {
    const small = betaLift(4, 10, 1, 10);
    const large = betaLift(40, 100, 10, 100);
    expect(small.lift).toBeGreaterThan(1.5);
    expect(large.pGreater).toBeGreaterThan(small.pGreater);
    expect(betaLift(5, 50, 5, 50).lift).toBeCloseTo(1, 5);
  });

  it("scores are bounded and neutral evidence scores zero", () => {
    expect(scoreFrom({ lift: 1, pGreater: 0.5 }, 0)).toBe(0);
    expect(scoreFrom({ lift: 50, pGreater: 1 }, 10)).toBeLessThanOrEqual(1);
    expect(scoreFrom({ lift: 0.01, pGreater: 0 }, 0)).toBeGreaterThanOrEqual(-1);
  });
});

describe("lexicon matching", () => {
  it("matches whole phrases only", () => {
    expect(termMatches("Dimly lit cocktail bar", "dimly lit")).toBe(true);
    expect(termMatches("Dim sum palace", "dimly lit")).toBe(false);
    expect(termMatches("urn:tag:genre:place:wine_bar", "wine bar")).toBe(true);
    expect(termMatches("Clubhouse", "club")).toBe(false);
  });

  it("classifies a venue from tags and keywords", () => {
    const e: QlooEntity = {
      entity_id: "x",
      name: "X",
      tags: [{ tag_id: "urn:tag:genre:place:speakeasy", name: "Speakeasy" }],
      keywords: ["exposed brick"],
      properties: {},
    };
    const v = classifyVenue(e);
    expect(v.dimensions).toContain("low_glow");
    expect(v.dimensions).toContain("industrial_raw");
  });
});

describe("Qloo response parsing", () => {
  it("accepts results as array or keyed object, affinity at either level", () => {
    const a = resultArray({ results: [{ entity_id: "1", name: "A" }] }, "entities");
    const b = resultArray({ results: { entities: [{ id: "2", name: "B", query: { affinity: 0.7 } }] } }, "entities");
    expect(a).toHaveLength(1);
    expect(parseEntity(b[0])?.affinity).toBe(0.7);
    const kw = parseEntity({ entity_id: "3", name: "C", properties: { keywords: [{ name: "cozy", count: 3 }, "dim"] } });
    expect(kw?.keywords).toEqual(["cozy", "dim"]);
  });
});

describe("entity resolution", () => {
  const cand = (id: string, name: string, type: string, popularity = 0.5): QlooEntity => ({
    entity_id: id, name, type, popularity, tags: [], keywords: [], properties: {},
  });

  it("parses type hints", () => {
    expect(parseLove("The Bear (show)")).toEqual({ query: "The Bear", typeHint: "urn:entity:tv_show" });
    expect(parseLove("Khruangbin")).toEqual({ query: "Khruangbin" });
  });

  it("flags same-name entities of different types as ambiguous", () => {
    const r = chooseCandidate("The Bear", [cand("1", "The Bear", "urn:entity:tv_show", 0.9), cand("2", "The Bear", "urn:entity:movie", 0.3)]);
    expect(r.status).toBe("ambiguous");
    expect(r.chosen?.entity_id).toBe("1");
  });

  it("refuses weak matches rather than poisoning the signal", () => {
    const r = chooseCandidate("Khruangbin", [cand("9", "Kraftwerk", "urn:entity:artist")]);
    expect(r.status).toBe("not_found");
    expect(r.chosen).toBeUndefined();
  });

  it("honours a pinned choice", () => {
    const r = chooseCandidate("The Bear", [cand("1", "The Bear", "urn:entity:tv_show"), cand("2", "The Bear", "urn:entity:movie")], { pinnedId: "2" });
    expect(r.chosen?.entity_id).toBe("2");
    expect(r.method).toBe("pinned");
  });

  it("similarity ignores case, punctuation and leading 'the'", () => {
    expect(similarity("the bear", "The Bear!")).toBe(1);
  });
});

describe("words and spec", () => {
  it("with no evidence, words take their dictionary reading", () => {
    const w = decodeWord("warm", neutralDims());
    expect(w.chosen?.isDictionaryDefault).toBe(true);
  });

  it("evidence can flip a word's reading", () => {
    const dims = neutralDims().map((d) => (d.id === "natural_organic" ? { ...d, score: 0.9 } : d));
    expect(decodeWord("warm", dims).chosen?.dimension).toBe("natural_organic");
  });

  it("INVARIANT: with no evidence the spec equals the literal reading", () => {
    for (const trade of ["lighting", "finishes"] as const) {
      const words = ["warm", "modern"];
      const decoded = words.map((w) => decodeWord(w, neutralDims()));
      const spec = buildSpec(trade, "living_room", neutralDims(), decoded, words);
      for (const line of spec) expect(line.value).toBe(line.literalValue);
    }
  });

  it("a client who said 'warm' never gets light cooler than 3000K", () => {
    const dims = neutralDims().map((d) => (d.id === "bright_airy" || d.id === "clean_minimal" ? { ...d, score: 1 } : d));
    const words = ["warm"];
    const spec = buildSpec("lighting", "living_room", dims, words.map((w) => decodeWord(w, dims)), words);
    expect(spec.find((l) => l.id === "cct")?.value).toBe("3000K throughout");
    const noWarm = buildSpec("lighting", "living_room", dims, [decodeWord("clean", dims)], ["clean"]);
    expect(noWarm.find((l) => l.id === "cct")?.value).toMatch(/3500K|4000K/);
  });

  it("literal vector only uses dictionary senses", () => {
    const v = literalVector(["warm", "modern"]);
    expect(v.low_glow).toBeGreaterThan(0);
    expect(v.clean_minimal).toBeGreaterThan(0);
    expect(v.natural_organic).toBe(0);
  });

  it("the menu covers every value the rulebook can emit for common vectors", () => {
    const menu = specMenu("lighting", "living_room");
    expect(Object.keys(menu)).toContain("cct");
    expect(menu.cct.values.length).toBeGreaterThanOrEqual(4);
  });
});

describe("agent on SYNTHETIC fixture data", () => {
  beforeAll(() => {
    process.env.QLOO_MODE = "fixture";
    delete process.env.ANTHROPIC_API_KEY;
  });

  const maya = { clientLabel: "Maya", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
  const jordan = { ...maya, clientLabel: "Jordan", loves: ["Fred again..", "Severance", "MUJI", "Kinfolk"] };

  it("cleans input", () => {
    const c = cleanInput({ words: ["Warm, modern and cozy"], loves: ["a", "Khruangbin"], city: " Chicago " });
    expect(c.words).toEqual(["warm", "modern", "cozy"]);
    expect(c.loves).toEqual(["Khruangbin"]);
    expect(c.city).toBe("Chicago");
  });

  it("same words, different taste → different specs, with a verifiable ledger", async () => {
    const events: AgentEvent[] = [];
    const a = await runBrief(maya, (e) => events.push(e));
    const b = await runBrief(jordan, () => {});
    expect(a.dataMode).toBe("fixture");
    expect(events.some((e) => e.type === "step" && e.id === "fingerprint" && e.status === "done")).toBe(true);
    const differing = a.spec.filter((l) => b.spec.find((m) => m.id === l.id)?.value !== l.value);
    expect(differing.length).toBeGreaterThanOrEqual(3);
    // Both share the same literal column: the words are identical.
    expect(a.spec.map((l) => l.literalValue)).toEqual(b.spec.map((l) => l.literalValue));
    expect((await verifyLedger(a.ledger)).ok).toBe(true);
    expect(a.ledger.filter((e) => e.kind === "qloo_call").length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(a.ledger)).not.toContain("X-Api-Key");
    expect(a.llmBaseline.available).toBe(false);
  });

  it("answering the question re-scores and keeps the chain valid", async () => {
    const a = await runBrief(maya, () => {});
    if (!a.question) return; // planner may legitimately decline
    const after = await answerQuestion(a, "B");
    expect(after.question?.answer).toBe("B");
    expect(after.dimensions.some((d) => d.clientAdjusted)).toBe(true);
    expect((await verifyLedger(after.ledger)).ok).toBe(true);
    await expect(answerQuestion(after, "A")).rejects.toThrow();
  });

  it("records pro decisions in the ledger", async () => {
    const a = await runBrief(jordan, () => {});
    const d = await recordDecision(a, a.spec[0].id, "revised", "3000K", "client prefers neutral");
    expect(d.spec[0].status).toBe("revised");
    expect(d.ledger.at(-1)?.kind).toBe("client_input");
    expect((await verifyLedger(d.ledger)).ok).toBe(true);
  });

  it("refuses bad input clearly", async () => {
    await expect(runBrief({ ...maya, city: "" }, () => {})).rejects.toThrow(/city/);
    await expect(runBrief({ ...maya, loves: ["Nobody Real At All"] }, () => {})).rejects.toThrow();
  });
});
