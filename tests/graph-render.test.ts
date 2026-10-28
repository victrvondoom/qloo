import { beforeAll, describe, expect, it } from "vitest";
import { runBrief } from "@/lib/agent";
import { buildTasteGraph, tracePath } from "@/lib/graph";
import { cctRange, fixtureOf, kelvinToRgb, layeringOf, opticsOf, roomVisual, scenesOf } from "@/lib/render";
import { specMenu } from "@/lib/spec";
import { ROOM_LABEL } from "@/lib/rulebooks";
import type { Brief, RoomType, SpecLine } from "@/lib/types";

let maya: Brief;
let jordan: Brief;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  const base = { trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"] };
  maya = await runBrief({ ...base, clientLabel: "Maya", loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] }, () => {});
  jordan = await runBrief({ ...base, clientLabel: "Jordan", loves: ["Fred again..", "Severance", "MUJI", "Kinfolk"] }, () => {});
});

describe("narrowing graph", () => {
  it("narrows from rooms to atmospheres to spec, with valid edges", () => {
    const g = buildTasteGraph(maya);
    const count = (c: string) => g.nodes.filter((n) => n.column === c).length;
    expect(count("said")).toBe(7);
    expect(count("atmospheres")).toBe(9);
    expect(count("spec")).toBe(maya.spec.length);
    expect(g.columns.find((c) => c.id === "rooms")!.count).toBe(maya.crowdVenues.length);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it("traces every evidence-based spec line back to the client's references", () => {
    const g = buildTasteGraph(maya);
    for (const l of maya.spec.filter((x) => x.basis === "qloo_evidence")) {
      const p = tracePath(g, `s:${l.id}`);
      expect([...p.nodes].some((n) => n.startsWith("r:"))).toBe(true);
      expect([...p.nodes].some((n) => n.startsWith("a:"))).toBe(true);
    }
  });

  it("traces a word forward to the lines it decided", () => {
    const g = buildTasteGraph(maya);
    const p = tracePath(g, "w:warm");
    expect([...p.nodes].some((n) => n.startsWith("s:"))).toBe(true);
  });

  it("builds a partial graph while the agent is still running", () => {
    const g = buildTasteGraph({ input: maya.input, resolutions: maya.resolutions });
    expect(g.nodes.filter((n) => n.column === "rooms")).toHaveLength(0);
    expect(g.nodes.filter((n) => n.column === "means").length).toBeGreaterThan(0);
  });

  it("streams graph events during a run", async () => {
    const graphs: number[] = [];
    await runBrief({ ...maya.input }, (e) => {
      if (e.type === "graph") graphs.push(e.graph.nodes.length);
    });
    expect(graphs.length).toBeGreaterThanOrEqual(3);
    expect(graphs.at(-1)!).toBeGreaterThan(graphs[0]);
  });
});

describe("room render model", () => {
  it("maps every rulebook value to a visual", () => {
    for (const room of Object.keys(ROOM_LABEL) as RoomType[]) {
      const menu = specMenu("lighting", room, ["warm"]);
      for (const v of menu.cct.values) expect(cctRange([{ id: "cct", value: v } as SpecLine]).day).toBeGreaterThan(2000);
      for (const v of menu.layers.values) expect(["lamps", "even", "concealed", "track"]).toContain(layeringOf([{ id: "layers", value: v } as SpecLine]));
      for (const v of menu.fixtures.values) expect(["vintage", "minimal", "industrial", "natural", "luxe"]).toContain(fixtureOf([{ id: "fixtures", value: v } as SpecLine]));
      for (const v of menu.optics.values) expect(["lowglare", "accent", "sparkle", "grid"]).toContain(opticsOf([{ id: "optics", value: v } as SpecLine]));
      for (const v of menu.dimming.values) expect(scenesOf([{ id: "dimming", value: v } as SpecLine]).length).toBeGreaterThanOrEqual(2);
    }
    // No value falls through to a default silently: each distinct menu value maps distinctly.
    const layers = specMenu("lighting", "living_room").layers.values.map((v) => layeringOf([{ id: "layers", value: v } as SpecLine]));
    expect(new Set(layers).size).toBe(layers.length);
  });

  it("warms as it dims with dim-to-warm, and draws two clients differently", () => {
    const day = roomVisual({ spec: maya.spec, dims: maya.dimensions, trade: "lighting", room: "living_room", scene: "day" });
    const late = roomVisual({ spec: maya.spec, dims: maya.dimensions, trade: "lighting", room: "living_room", scene: "late" });
    expect(late.kelvin).toBeLessThanOrEqual(day.kelvin);
    expect(late.level).toBeLessThan(day.level);
    const j = roomVisual({ spec: jordan.spec, dims: jordan.dimensions, trade: "lighting", room: "living_room", scene: "day" });
    expect(j.layering).not.toBe(day.layering);
    expect(j.palette.wall).not.toBe(day.palette.wall);
  });

  it("converts kelvin to plausible colours", () => {
    expect(kelvinToRgb(2200)).toMatch(/^#ff[0-9a-f]{4}$/);
    const warm = parseInt(kelvinToRgb(2200).slice(5, 7), 16);
    const cool = parseInt(kelvinToRgb(4000).slice(5, 7), 16);
    expect(cool).toBeGreaterThan(warm);
  });
});
