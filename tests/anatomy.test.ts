// Taste Anatomy: facets, agreement, conflict, consensus core, bridge rooms,
// bootstrap stability, flip distance, domain-alone specs, corroboration, niche.
import { beforeAll, describe, expect, it } from "vitest";
import { runBrief } from "@/lib/agent";
import { bootstrapStability, computeAnatomy, cosine, domainOf, flipDistances, nicheIndex } from "@/lib/anatomy";
import { verifyLedger } from "@/lib/ledger";
import { FixtureTransport } from "@/lib/qloo/fixture";
import type { Brief, DimensionId } from "@/lib/types";

const maya = { clientLabel: "Maya", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
let brief: Brief;
beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  brief = await runBrief(maya, () => {});
});

describe("taste anatomy", () => {
  it("asks Qloo about each facet alone, ledgered, without changing the spec", async () => {
    const { brief: next, anatomy } = await computeAnatomy(brief, new FixtureTransport());
    const used = brief.resolutions.filter((r) => r.usedAsSignal).length;
    expect(anatomy.facets).toHaveLength(used);
    const calls = next.ledger.slice(brief.ledger.length).filter((e) => e.kind === "qloo_call");
    for (const f of anatomy.facets) {
      expect(calls.some((c) => (c.detail.params as Record<string, unknown>)["signal.interests.entities"] === f.entity_id || JSON.stringify((c.detail.params as Record<string, unknown>)["signal.interests.entities"]) === JSON.stringify([f.entity_id]))).toBe(true);
    }
    expect(next.spec).toEqual(brief.spec);
    expect((await verifyLedger(next.ledger)).ok).toBe(true);
    expect(new Set(anatomy.facets.map((f) => f.domain)).size).toBeGreaterThan(1);
  });

  it("agreement is a symmetric cosine and coherence its mean", async () => {
    const { anatomy } = await computeAnatomy(brief, new FixtureTransport());
    const usable = anatomy.facets.filter((f) => f.usable).length;
    expect(anatomy.agreement).toHaveLength((usable * (usable - 1)) / 2);
    for (const p of anatomy.agreement) {
      expect(p.cosine).toBeGreaterThanOrEqual(-1);
      expect(p.cosine).toBeLessThanOrEqual(1);
    }
    const mean = anatomy.agreement.reduce((s, x) => s + x.cosine, 0) / anatomy.agreement.length;
    expect(anatomy.coherence).toBeCloseTo(mean, 2);
    if (anatomy.conflict) {
      expect(anatomy.conflict.cosine).toBe(Math.min(...anatomy.agreement.map((x) => x.cosine)));
      expect(anatomy.bridge).toBeDefined();
    }
  });

  it("the consensus core only holds places a majority of facets chose", async () => {
    const { anatomy } = await computeAnatomy(brief, new FixtureTransport());
    expect(anatomy.core.threshold).toBeGreaterThanOrEqual(2);
    for (const p of anatomy.core.places) expect(p.votes).toBeGreaterThanOrEqual(anatomy.core.threshold);
  });

  it("domain-alone specs and per-line domain agreement line up", async () => {
    const { anatomy } = await computeAnatomy(brief, new FixtureTransport());
    for (const l of anatomy.lineDomains) expect(l.of).toBe(anatomy.domains.length);
    const total = anatomy.domains.reduce((s, d) => s + d.agrees, 0);
    expect(anatomy.lineDomains.reduce((s, l) => s + l.agree, 0)).toBe(total);
  });
});

describe("pure methods", () => {
  it("cosine: identical vectors 1, opposite -1, zero vector 0", () => {
    const v = { low_glow: 1, bright_airy: 0.5 } as Record<DimensionId, number>;
    const ids: DimensionId[] = ["low_glow", "bright_airy", "clean_minimal", "vintage_character", "industrial_raw", "natural_organic", "refined_luxe", "energetic_social", "calm_quiet"];
    const full = Object.fromEntries(ids.map((id) => [id, v[id] ?? 0])) as Record<DimensionId, number>;
    const neg = Object.fromEntries(ids.map((id) => [id, -(v[id] ?? 0)])) as Record<DimensionId, number>;
    const zero = Object.fromEntries(ids.map((id) => [id, 0])) as Record<DimensionId, number>;
    expect(cosine(full, full)).toBe(1);
    expect(cosine(full, neg)).toBe(-1);
    expect(cosine(full, zero)).toBe(0);
  });

  it("bootstrap is deterministic per brief and bounded", () => {
    const a = bootstrapStability(brief, 120);
    const b = bootstrapStability(brief, 120);
    expect(a).toEqual(b);
    for (const l of a.lines) {
      expect(l.stable).toBeGreaterThan(0);
      expect(l.stable).toBeLessThanOrEqual(1);
    }
    for (const d of a.dims) expect(d.lo).toBeLessThanOrEqual(d.hi);
  });

  it("flip distance really flips the line when it reports a number", () => {
    for (const f of flipDistances(brief)) {
      if (f.places !== null) {
        expect(f.places).toBeGreaterThanOrEqual(1);
        expect(f.toValue).toBeDefined();
        expect(f.toValue).not.toBe(brief.spec.find((l) => l.id === f.lineId)!.value);
      } else expect(f.reason).toBeTruthy();
    }
  });

  it("niche index is 0 when taste matches the city and rises with divergence", () => {
    expect(nicheIndex({ ...brief, crowdVenues: brief.baseVenues }).index).toBe(0);
    expect(nicheIndex(brief).index).toBeGreaterThan(0);
  });

  it("maps entity types to domains", () => {
    expect(domainOf("urn:entity:artist")).toBe("music");
    expect(domainOf("urn:entity:tv_show")).toBe("screen & people");
    expect(domainOf("urn:entity:brand")).toBe("places & brands");
  });
});
