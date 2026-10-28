// Progressive depth, the answer/depth rebuild path, deterministic replay,
// client share views and the cached tag mapper.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerQuestion, runBrief } from "@/lib/agent";
import { exploreDepth, popularityCaps } from "@/lib/depth";
import { applyDepth, effectiveDimensions } from "@/lib/refine";
import { replayBrief } from "@/lib/replay";
import { clientView, recordReaction } from "@/lib/share";
import { makeTagMapper } from "@/lib/tagmap";
import { verifyLedger } from "@/lib/ledger";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { QlooClient } from "@/lib/qloo/client";
import { setDbForTests } from "@/lib/db";
import { migrate } from "@/lib/db/schema";
import { openSqlite } from "@/lib/db/sqlite";
import type { Db } from "@/lib/db";
import type { Brief, DimensionId } from "@/lib/types";

const maya = { clientLabel: "Maya", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
const jordan = { ...maya, clientLabel: "Jordan", loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };

let brief: Brief;
let db: Db;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  db = openSqlite(":memory:");
  await migrate(db);
  setDbForTests(db);
  brief = await runBrief(maya, () => {});
});

afterAll(async () => {
  setDbForTests();
  await db.close();
});

describe("fixture world", () => {
  it("honours the hard city filter and the popularity cap", async () => {
    const q = new QlooClient(new FixtureTransport());
    const austin = await q.insightsEntities({ "filter.type": "urn:entity:place", "filter.location.query": "Austin" }, "t", 40);
    expect(austin.value.length).toBeGreaterThan(0);
    expect(austin.value.every((e) => e.properties.city === "Austin")).toBe(true);
    const capped = await q.insightsEntities({ "filter.type": "urn:entity:place", "filter.location.query": "Chicago", "filter.popularity.max": 0.5 }, "t", 40);
    expect(capped.value.length).toBeGreaterThan(0);
    expect(capped.value.every((e) => (e.popularity ?? 1) <= 0.5)).toBe(true);
  });
});

describe("depth levels", () => {
  it("records an adaptive popularity ladder from the main run", () => {
    const caps = popularityCaps(brief.crowdVenues);
    expect(caps[1]).toBeDefined();
    expect(caps[2]!).toBeLessThanOrEqual(caps[1]!);
    expect(brief.depth?.[0]).toMatchObject({ level: 0, label: "Mainstream", usable: true });
    expect(brief.depth?.[0].references.length).toBeGreaterThan(0);
  });

  it("explores a deeper level with the same cap on both sides, ledgered", async () => {
    const { brief: next, layer, fresh } = await exploreDepth(brief, 1, new FixtureTransport());
    expect(fresh).toBe(true);
    expect(layer.method).toBe("api_filter");
    expect(layer.popularityMax).toBe(popularityCaps(brief.crowdVenues)[1]);
    expect(layer.usable).toBe(true);
    expect(layer.references.every((r) => (r.popularity ?? 0) <= layer.popularityMax!)).toBe(true);
    // Both sides were capped: every insights call in this layer carried the cap.
    const calls = next.ledger.slice(brief.ledger.length).filter((e) => e.kind === "qloo_call");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.every((e) => (e.detail.params as Record<string, unknown>)["filter.popularity.max"] === layer.popularityMax)).toBe(true);
    expect((await verifyLedger(next.ledger)).ok).toBe(true);
    // Exploring does not change the spec.
    expect(next.spec.map((l) => l.value)).toEqual(brief.spec.map((l) => l.value));
    const again = await exploreDepth(next, 1, new FixtureTransport());
    expect(again.fresh).toBe(false);
  });

  it("falls back to filtering locally when Qloo rejects the popularity filter", async () => {
    const strict = new FixtureTransport();
    const inner = strict.get.bind(strict);
    strict.get = async (path, params) => (params["filter.popularity.max"] !== undefined ? { status: 400, body: { message: "unknown param" } } : inner(path, params));
    const { layer, brief: next } = await exploreDepth(brief, 2, strict);
    expect(layer.method).toBe("client_filter");
    expect(layer.references.every((r) => (r.popularity ?? 0) <= layer.popularityMax!)).toBe(true);
    expect(next.ledger.some((e) => e.kind === "decision" && /filtering returned places locally/.test(e.summary))).toBe(true);
  });

  it("applies a level to the spec, keeps the answer, and can return to the main run", async () => {
    const explored = (await exploreDepth(brief, 1, new FixtureTransport())).brief;
    const applied = await applyDepth(explored, 1);
    expect(applied.brief.appliedDepth).toBe(1);
    expect(applied.brief.dimensions).toEqual(effectiveDimensions(applied.brief, 1));
    expect(applied.brief.ledger.at(-1)?.summary).toMatch(/depth "Curated"/);
    const back = await applyDepth(applied.brief, 0);
    expect(back.brief.spec.map((l) => l.value)).toEqual(brief.spec.map((l) => l.value));
    await expect(applyDepth(brief, 2)).rejects.toThrow(/explored/);
  });
});

describe("answer then depth then replay", () => {
  it("replays an untouched brief line for line", async () => {
    const r = await replayBrief(brief);
    expect(r.identical).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("replays after an answer and a depth switch", async () => {
    let b = brief;
    if (b.question) b = await answerQuestion(b, "A");
    b = (await exploreDepth(b, 1, new FixtureTransport())).brief;
    b = (await applyDepth(b, 1)).brief;
    const r = await replayBrief(b);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.identical).toBe(true);
  });

  it("names the lines that were edited after the run", async () => {
    const b = structuredClone(brief);
    b.spec[0].value = "Something the evidence never said";
    const r = await replayBrief(b);
    expect(r.identical).toBe(false);
    expect(r.lines.filter((l) => !l.same).map((l) => l.id)).toEqual([b.spec[0].id]);
  });

  it("answering through the client link is ledgered as the client", async () => {
    const b = await runBrief(jordan, () => {});
    if (!b.question) return; // the planner may decide no question is worth asking
    const next = await answerQuestion(b, "B", "client");
    expect(next.ledger.some((e) => e.kind === "client_input" && (e.detail as { via?: string }).via === "client")).toBe(true);
  });
});

describe("client share view", () => {
  it("leaves out the brief id, owner, pasted message, ledger and trace", () => {
    const v = clientView({ ...brief, ownerHash: "f".repeat(64), input: { ...brief.input, sourceText: "secret message" } });
    const text = JSON.stringify(v);
    expect(text).not.toContain(brief.id);
    expect(text).not.toContain("f".repeat(64));
    expect(text).not.toContain("secret message");
    expect(text).not.toContain('"ledger"');
    expect(v.spec.length).toBe(brief.spec.length);
  });

  it("records reactions per line, ledgered", async () => {
    const line = brief.spec[1];
    const next = await recordReaction(brief, line.id, "love", "yes!");
    expect(next.clientFeedback?.[line.id]).toMatchObject({ reaction: "love", note: "yes!", value: line.value });
    expect((await verifyLedger(next.ledger)).ok).toBe(true);
    await expect(recordReaction(brief, "nope", "love")).rejects.toThrow();
  });
});

describe("tag mapper", () => {
  it("asks once per term, validates ids, caches empty answers too", async () => {
    const asked: string[][] = [];
    const mapper = makeTagMapper(async (terms) => {
      asked.push(terms);
      return { "natural wine": ["natural_organic", "low_glow", "calm_quiet"] as DimensionId[], "parking": [], "omakase counter": ["bogus" as DimensionId, "refined_luxe"] };
    }, "test-model");
    const first = await mapper(["Natural Wine", "parking", "omakase counter"]);
    expect(first.mapped).toEqual({ "natural wine": ["natural_organic", "low_glow"], "omakase counter": ["refined_luxe"] });
    const second = await mapper(["natural wine", "parking"]);
    expect(second.mapped).toEqual({ "natural wine": ["natural_organic", "low_glow"] });
    expect(asked).toHaveLength(1);
  });

  it("feeds mapped terms into the run, labelled and ledgered", async () => {
    const mapper = makeTagMapper(async (terms) => Object.fromEntries(terms.map((t) => [t, t === "reservations" ? (["refined_luxe"] as DimensionId[]) : []])), "test-model");
    const b = await runBrief(maya, () => {}, { tagMapper: mapper });
    expect(b.tagMap?.model).toBe("test-model");
    const mappedMatches = [...b.crowdVenues, ...b.baseVenues].flatMap((v) => v.matches.filter((m) => m.source === "mapped"));
    expect(b.tagMap?.mapped).toEqual({ reservations: ["refined_luxe"] });
    expect(mappedMatches.length).toBeGreaterThan(0);
    expect(mappedMatches.every((m) => m.term.toLowerCase() === "reservations" && m.dimension === "refined_luxe")).toBe(true);
    expect(b.ledger.some((e) => e.kind === "llm_call" && /place terms/.test(e.summary))).toBe(true);
  });
});
