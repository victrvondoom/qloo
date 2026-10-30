// Production-style reliability on the fixture world: concurrent users, duplicate submissions, long briefs,
// long revision chains, malformed stored projects. Bounded; nothing here touches an external service.
import { beforeAll, describe, expect, it } from "vitest";
import { runBrief } from "@/lib/agent";
import { compileSpec } from "@/lib/compiler";
import { challengeWhy } from "@/lib/challenge";
import { verifyLedger } from "@/lib/ledger";
import { runRevision } from "@/lib/revise";
import { diffSpecs } from "@/lib/spec-diff";
import { buildExport, exportCsv, exportHtml, exportJson, reopenExport } from "@/lib/spec-export";
import { verifySpec } from "@/lib/verify-spec";
import type { Brief, BriefInput } from "@/lib/types";

const maya: BriefInput = { clientLabel: "Maya", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"], cctRange: { min: 2700, max: 3000 }, criMin: 90 };
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(0.95 * xs.length))];

beforeAll(() => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
});

describe("reliability", () => {
  it("ten concurrent users each get a complete, valid, independent brief", async () => {
    const ms: number[] = [];
    const runs = await Promise.all(Array.from({ length: 10 }, async (_, i) => {
      const t = Date.now();
      const b = await runBrief({ ...maya, clientLabel: `User ${i}` }, () => {});
      ms.push(Date.now() - t);
      return b;
    }));
    expect(new Set(runs.map((b) => b.id)).size).toBe(10);
    for (const b of runs) {
      expect(["COMPLETE", "NEEDS_CLARIFICATION"]).toContain(b.status);
      expect((await verifyLedger(b.ledger)).ok).toBe(true);
    }
    expect(p95(ms)).toBeLessThan(5000);
  });

  it("a long client message and many repeated revisions stay correct, and export works after them", async () => {
    const long = `${"We are renovating slowly and love talking about it. ".repeat(60)}Please keep the light between 2700K and 3000K.`.slice(0, 3900);
    let cur: Brief = await runBrief({ ...maya, cctRange: undefined, criMin: undefined, sourceText: long }, () => {});
    expect(cur.status).not.toBe("UPSTREAM_UNAVAILABLE");
    const first = await compileSpec(cur);
    const ids = new Set([cur.id]);
    for (let i = 0; i < 12; i++) {
      const r = await runRevision(cur, i % 3 === 0 ? { cctRange: { min: 2700, max: 3000 } } : i % 3 === 1 ? { criMin: 90 + (i % 5) } : { replaceLove: { from: cur.input.loves[0], to: cur.input.loves[0] === "Khruangbin" ? "Norah Jones" : "Khruangbin" } }).catch((e: Error) => e);
      if (r instanceof Error) {
        // Swapping to a name already present is refused with a reason rather than corrupting the brief.
        expect(r.message).toBeTruthy();
        continue;
      }
      ids.add(r.brief.id);
      cur = r.brief;
    }
    expect(ids.size).toBeGreaterThan(8);
    const spec = await compileSpec(cur);
    const v = await verifySpec(spec, { brief: cur, previous: first });
    expect(v.counts.ERROR).toBe(0);
    const x = buildExport(spec, v, { revision: diffSpecs(first, spec) });
    expect((await reopenExport(exportJson(x))).ok).toBe(true);
    expect(exportHtml(x).length).toBeGreaterThan(2000);
    expect(exportCsv(x).split("\n").length).toBe(spec.lines.length + 2);
    expect(spec.limits.cct).toEqual({ min: 2700, max: 3000 }); // hard limits survived every revision
  });

  it("a malformed stored project fails with a clear error and never corrupts a healthy one", async () => {
    const good = await runBrief(maya, () => {});
    const broken = { ...structuredClone(good), spec: undefined } as unknown as Brief;
    await expect(compileSpec(broken)).rejects.toBeDefined();
    const noLedger = { ...structuredClone(good), ledger: [] } as Brief;
    const spec = await compileSpec(noLedger);
    const v = await verifySpec(spec, { brief: noLedger });
    expect(v.counts.ERROR).toBeGreaterThan(0); // evidence cited but absent from the ledger
    await expect(challengeWhy(good, await compileSpec(good), "cct")).resolves.toBeDefined();
  });

  it("duplicate submissions are independent and identical in content", async () => {
    const [a, b, c] = await Promise.all([runBrief(maya, () => {}), runBrief(maya, () => {}), runBrief(maya, () => {})]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    const va = (await compileSpec(a)).versionId;
    expect([(await compileSpec(b)).versionId, (await compileSpec(c)).versionId]).toEqual([va, va]);
  });
});
