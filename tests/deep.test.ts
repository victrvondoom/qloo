// The deep brief: deterministic sections from the spec and evidence, and the
// optional prose layer with its grounding check.
import { beforeAll, describe, expect, it } from "vitest";
import { answerQuestion, runBrief } from "@/lib/agent";
import { buildDeepBrief, colourName } from "@/lib/deep/build";
import { applyProse, factsKey, groundingProblems, writeProse, type JsonCaller } from "@/lib/deep/prose";
import { ROOM_ZONES } from "@/lib/deep/zones";
import type { Brief, RoomType } from "@/lib/types";

const maya = { clientLabel: "Maya", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
const jordan = { ...maya, clientLabel: "Jordan", loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };
let m: Brief;
let j: Brief;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  [m, j] = await Promise.all([runBrief(maya, () => {}), runBrief(jordan, () => {})]);
});

describe("deterministic deep brief", () => {
  it("gives the same words two different, evidence-named directions", () => {
    const a = buildDeepBrief(m);
    const b = buildDeepBrief(j);
    expect(a.title).not.toBe(b.title);
    expect(a.personalised && b.personalised).toBe(true);
    expect(a.summary).toMatch(/Maya/);
    expect(a.summary).toMatch(/×/);
    expect(a.decoded.map((w) => w.word)).toEqual(["warm", "modern"]);
  });

  it("plans every zone of the room, with a scene row per zone", () => {
    const d = buildDeepBrief(m);
    expect(d.zones.map((z) => z.name)).toEqual(ROOM_ZONES.living_room.map((z) => z.name));
    expect(d.sceneTable).toHaveLength(d.zones.length);
    expect(d.sceneTable.every((r) => r.levels.length === d.scenes.length && r.levels.every((x) => x >= 0 && x <= 100))).toBe(true);
    expect(d.scenes[0].label).toBe("Day");
  });

  it("names its palette and cites spec lines in the shopping list and checklist", () => {
    const d = buildDeepBrief(m);
    expect(d.palette).toHaveLength(6);
    expect(d.palette.every((p) => /^#[0-9a-f]{6}$/.test(p.hex) && p.name.length > 2)).toBe(true);
    const leds = d.shopping.find((s) => s.item.startsWith("LED light sources"))!;
    expect(leds.spec).toContain(m.spec.find((l) => l.id === "cct")!.value);
    expect(d.checklist.some((c) => c.ref === "dimming")).toBe(true);
    expect(d.risks.some((r) => /Demo data/.test(r.text))).toBe(true);
  });

  it("covers every room type and the finishes trade without gaps", async () => {
    const rooms = Object.keys(ROOM_ZONES) as RoomType[];
    for (const room of rooms) {
      const b = await runBrief({ ...maya, room }, () => {});
      const d = buildDeepBrief(b);
      const text = JSON.stringify(d);
      expect(text).not.toMatch(/undefined|NaN/);
      expect(d.zones.length).toBe(ROOM_ZONES[room].length);
    }
    const f = buildDeepBrief(await runBrief({ ...maya, trade: "finishes" }, () => {}));
    expect(f.zones.map((z) => z.name)).toContain("Walls");
    expect(f.shopping.some((s) => s.ref === "walls")).toBe(true);
    expect(JSON.stringify(f)).not.toMatch(/undefined|NaN/);
  });

  it("says plainly when nothing was personalised", async () => {
    const b = await runBrief({ ...maya, loves: ["zzqv nonsense", "qqxx unknown"] }, () => {});
    const d = buildDeepBrief(b);
    expect(d.personalised).toBe(false);
    expect(d.title).toBe("Literal reading");
    expect(d.references).toEqual([]);
  });

  it("maps palette hexes to names, nearest when not exact", () => {
    expect(colourName("#5b5a3e")).toBe("olive");
    expect(colourName("#5c5b3f")).toBe("olive");
  });
});

describe("grounding check", () => {
  const facts = ["Client: Maya. Room: Living room in Chicago.", "Colour temperature: 2200–2700K with dim-to-warm", "Reference place: Ember Room (Chicago)."];
  it("accepts prose built from the facts", () => {
    expect(groundingProblems("Maya, your room should glow at 2700K, like Ember Room in Chicago.", facts, 60)).toEqual([]);
  });
  it("rejects invented numbers, names, links and length", () => {
    expect(groundingProblems("Use 4000K downlights.", facts, 60).join()).toMatch(/4000/);
    expect(groundingProblems("It feels like the Soho Grand.", facts, 60).join()).toMatch(/Soho/);
    expect(groundingProblems("See https://example.com for more.", facts, 60).join()).toMatch(/link/);
    expect(groundingProblems("word ".repeat(70), facts, 60).join()).toMatch(/too long/);
  });
});

describe("prose layer", () => {
  const caller = (impl: (system: string) => unknown): JsonCaller => (async (system: string) => impl(system)) as JsonCaller;

  it("keeps grounded pieces, rejects ungrounded ones, survives failures", async () => {
    const d = buildDeepBrief(m);
    const fields: string[] = [];
    const prose = await writeProse(
      d,
      caller((system) => {
        if (system.startsWith("You name")) return { title: "Amber Parlour", summary: `Maya's room should glow low and warm, like ${d.references[0]?.name ?? "the reference places"}.` };
        if (system.startsWith("Write a short note")) return { note: "Hi Maya, we'll use 6500K daylight panels from Lumenco." };
        throw new Error("model unavailable");
      }),
      "test-model",
      (f) => fields.push(`${f.field}:${f.status}`),
    );
    expect(fields.sort()).toEqual(["clientNote:rejected", "direction:model", "references:failed"]);
    expect(prose.direction?.title).toBe("Amber Parlour");
    expect(prose.clientNote).toBeUndefined();
    expect(prose.fields.find((f) => f.field === "clientNote")?.reason).toMatch(/6500|Lumenco/);
    const merged = applyProse(d, prose);
    expect(merged.summary).toBe(prose.direction!.summary);
    expect(merged.clientNote).toBe(d.clientNote);
    expect(merged.prose?.stale).toBe(false);
  });

  it("only accepts reference lines for real places, by index", async () => {
    const d = buildDeepBrief(m);
    const prose = await writeProse(
      d,
      caller((system) => {
        if (system.startsWith("For each numbered")) return { items: [{ index: 0, why: "Shows the low, warm glow Maya chooses." }, { index: 99, why: "Invented." }] };
        throw new Error("skip");
      }),
      "test-model",
    );
    expect(Object.keys(prose.references ?? {})).toEqual([d.references[0].entity_id]);
  });

  it("marks prose stale once the brief's facts change", async () => {
    const d = buildDeepBrief(m);
    const prose = { version: "prose/1" as const, key: factsKey(d.facts), model: "x", createdAt: "", clientNote: "Hi Maya.", fields: [] };
    expect(applyProse(d, prose).clientNote).toBe("Hi Maya.");
    if (m.question) {
      const answered = buildDeepBrief(await answerQuestion(m, "B"));
      const merged = applyProse(answered, prose);
      expect(merged.prose?.stale).toBe(answered.facts.join() !== d.facts.join());
    }
  });
});
