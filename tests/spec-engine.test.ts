// The specification compiler, verification agent, semantic diff, sensitivity and export,
// exercised on real agent runs over the synthetic world (labelled fixture throughout).
import { beforeAll, describe, expect, it } from "vitest";
import { runBrief } from "@/lib/agent";
import { compileSpec, lineVersionOf, machineValue } from "@/lib/compiler";
import { computeInfluence } from "@/lib/influence";
import { clearQlooCache } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { ReviseError, reviseInput, runRevision } from "@/lib/revise";
import { NoInfluenceError, sensitivityFromBrief } from "@/lib/sensitivity";
import { diffSpecs } from "@/lib/spec-diff";
import { buildExport, exportCsv, exportHtml, exportJson, reopenExport } from "@/lib/spec-export";
import { verifySpec } from "@/lib/verify-spec";
import { buildBenchmark } from "../benchmarks/scenarios";
import type { Brief, BriefInput } from "@/lib/types";

const maya: BriefInput = { clientLabel: "Maya", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
const jordan: BriefInput = { ...maya, clientLabel: "Jordan", words: ["modern"], loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };
const limited: BriefInput = { ...jordan, cctRange: { min: 2700, max: 3000 }, criMin: 95, dimTo: 5, dimmable: true };
const kelvins = (v: string) => (v.match(/\d{4}/g) ?? []).map(Number);

let m: Brief;
let j: Brief;
let jl: Brief;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  clearQlooCache();
  [m, j, jl] = await Promise.all([runBrief(maya, () => {}), runBrief(jordan, () => {}), runBrief(limited, () => {})]);
});

describe("compiler", () => {
  it("turns an agent result into typed lines that keep their values and evidence", async () => {
    const s = await compileSpec(m);
    expect(s.schema).toBe("tastespec.spec/1");
    expect(s.lines.map((l) => l.id)).toEqual(m.spec.map((l) => l.id));
    const cct = s.lines.find((l) => l.id === "cct")!;
    expect(cct.machine).toMatchObject({ kind: "cct", unit: "K" });
    const ledgerSeqs = new Set(m.ledger.filter((e) => e.kind === "qloo_call").map((e) => e.seq));
    for (const l of s.lines) {
      expect(l.interpretationRule).toBe(`${m.rulebookVersion}:${l.id}`);
      for (const e of l.evidenceIds) expect(ledgerSeqs.has(e)).toBe(true);
      expect(s.evidenceRefs.length).toBeGreaterThan(0);
    }
    expect(s.syntheticNotice).toMatch(/SYNTHETIC/);
    expect(s.unknowns.length).toBeGreaterThan(2);
    expect(s.notCertified).toMatch(/not an engineering design/);
  });
  it("is deterministic: the same brief gives the same version id", async () => {
    expect((await compileSpec(m)).versionId).toBe((await compileSpec(m)).versionId);
    expect((await compileSpec(m)).versionId).not.toBe((await compileSpec(j)).versionId);
  });
  it("reads machine values from the rulebook's wording", () => {
    expect(machineValue("cct", "3000K ambient, 3500K on task surfaces")).toMatchObject({ min: 3000, max: 3500, ambient: 3000, task: 3500, dimToWarm: false });
    expect(machineValue("cct", "2200–2700K with dim-to-warm (glows amber as it dims)")).toMatchObject({ min: 2200, max: 2700, ambient: 2700, dimToWarm: true });
    expect(machineValue("cri", "CRI 95+ with R9 > 50, so wood")).toEqual({ kind: "cri", unit: "Ra", min: 95, r9Required: true });
    expect(machineValue("dimming", "Full-range dimming to 1% and three scenes")).toMatchObject({ floor: 1, scenes: 3 });
    expect(machineValue("level", "Ambient at the low end: ~100 lux; (Typical 100–200 lux for this room")).toMatchObject({ target: 100, typicalMin: 100, typicalMax: 200 });
  });
});

describe("verification", () => {
  it("passes a real brief, flags what needs a professional, and never certifies", async () => {
    const s = await compileSpec(jl);
    const v = await verifySpec(s, { brief: jl });
    expect(v.counts.ERROR).toBe(0);
    expect(v.documentStatus).toBe("CHECKS_PASSED_REVIEW_OPEN");
    expect(v.diagnostics.find((d) => d.code === "NEEDS_CALCULATION")?.lineId).toBe("level");
    expect(v.diagnostics.find((d) => d.code === "LIMIT_HELD" && d.lineId === "cct")).toBeTruthy();
    expect(v.diagnostics.find((d) => d.code === "LEDGER_INTACT")).toBeTruthy();
    expect(v.statement).toMatch(/not a certificate/);
    expect(JSON.stringify(v)).not.toMatch(/\bcertified\b(?! )/);
    for (const d of v.diagnostics) expect(d.lineId.length).toBeGreaterThan(0);
    expect(v.dimensions.map((d) => d.id)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });
  it("catches a line that breaks a written limit and says how to repair it", async () => {
    const s = await compileSpec(jl);
    const forged = { ...s, lines: s.lines.map((l) => (l.id === "cct" ? { ...l, requirement: "4000K throughout", machine: machineValue("cct", "4000K throughout") } : l)) };
    const v = await verifySpec(forged, { brief: jl });
    const e = v.diagnostics.find((d) => d.code === "LIMIT_VIOLATED" && d.lineId === "cct");
    expect(e?.severity).toBe("ERROR");
    expect(e?.repair).toMatch(/Rebuild/);
    expect(v.documentStatus).toBe("DRAFT_CHECKS_FAILED");
    expect(v.dimensions.find((d) => d.id === "A")?.status).toBe("FAIL");
  });
  it("rejects wrong units, impossible values and missing fields", async () => {
    const s = await compileSpec(m);
    const bad = { ...s, lines: s.lines.map((l) => (l.id === "cri" ? { ...l, machine: { kind: "cri" as const, unit: "Ra" as const, min: 140, r9Required: false } } : l.id === "cct" ? { ...l, machine: { kind: "cct" as const, unit: "C" as unknown as "K", min: 3000, max: 3000, ambient: 3000, dimToWarm: false } } : l.id === "dimming" ? { ...l, requirement: "" } : l)) };
    const codes = (await verifySpec(bad)).diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(["OUT_OF_RANGE", "BAD_UNIT", "MISSING_FIELD"]));
  });
  it("rejects evidence that isn't carried or isn't in the ledger, and a tampered ledger", async () => {
    const s = await compileSpec(m);
    const line = s.lines.find((l) => l.basis === "qloo_evidence")!;
    const dropped = { ...s, evidenceRefs: [] };
    expect((await verifySpec(dropped)).diagnostics.some((d) => d.code === "EVIDENCE_NOT_CARRIED" && d.lineId === line.id)).toBe(true);
    const foreign = { ...s, lines: s.lines.map((l) => (l.id === line.id ? { ...l, evidenceIds: [...l.evidenceIds, 9999] } : l)), evidenceRefs: [...s.evidenceRefs, { seq: 9999, kind: "qloo_call", summary: "x", hash: "0" }] };
    expect((await verifySpec(foreign, { brief: m })).diagnostics.some((d) => d.code === "EVIDENCE_NOT_IN_LEDGER")).toBe(true);
    const tampered = structuredClone(m);
    tampered.ledger[1].summary += " (edited)";
    expect((await verifySpec(s, { brief: tampered })).diagnostics.some((d) => d.code === "LEDGER_BROKEN")).toBe(true);
    const unsupported = { ...s, lines: s.lines.map((l) => (l.id === line.id ? { ...l, evidenceIds: [], evidenceSummary: [] } : l)) };
    expect((await verifySpec(unsupported)).diagnostics.some((d) => d.code === "EVIDENCE_MISSING")).toBe(true);
  });
  it("flags stale rulebooks, unlisted unknowns and inconsistent lines", async () => {
    const s = await compileSpec(m);
    const stale = { ...s, rulebookVersion: "rulebook-2020", lines: s.lines.map((l) => ({ ...l, interpretationRule: `rulebook-2020:${l.id}` })) };
    expect((await verifySpec(stale)).diagnostics.some((d) => d.code === "STALE_RULEBOOK")).toBe(true);
    expect((await verifySpec({ ...s, unknowns: [] })).diagnostics.some((d) => d.code === "NO_UNKNOWNS_LISTED")).toBe(true);
    const inc = { ...s, lines: s.lines.map((l) => (l.id === "cct" ? { ...l, machine: { ...(l.machine as { kind: "cct" }), kind: "cct" as const, unit: "K" as const, min: 2200, max: 2700, ambient: 2700, dimToWarm: true } } : l.id === "dimming" ? { ...l, requirement: "Standard 0–10V or phase dimming on ambient circuits.", machine: machineValue("dimming", "Standard 0–10V or phase dimming on ambient circuits.") } : l)) };
    expect((await verifySpec(inc)).diagnostics.some((d) => d.code === "DIM_TO_WARM_WITHOUT_DIMMING")).toBe(true);
  });
  it("no evidence is reported as INSUFFICIENT_EVIDENCE, not as a pass", async () => {
    const r = await runRevision(m, { removeEvidence: true });
    const v = await verifySpec(await compileSpec(r.brief), { brief: r.brief });
    expect(v.dimensions.find((d) => d.id === "B")?.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(v.diagnostics.some((d) => d.code === "NO_USABLE_EVIDENCE")).toBe(true);
    expect(v.diagnostics.filter((d) => d.code === "NO_EVIDENCE_BEHIND_LINE").length).toBe(r.brief.spec.length);
  });
});

describe("export", () => {
  it("JSON reopens with values and evidence intact, and a hand-edited line is caught", async () => {
    const s = await compileSpec(jl);
    const x = buildExport(s, await verifySpec(s, { brief: jl }));
    const text = exportJson(x);
    const back = await reopenExport(text);
    expect(back.ok).toBe(true);
    expect(back.export!.spec.lines.map((l) => [l.id, l.requirement, l.evidenceIds])).toEqual(s.lines.map((l) => [l.id, l.requirement, l.evidenceIds]));
    expect(back.export!.spec.evidenceRefs).toEqual(s.evidenceRefs);
    const edited = JSON.parse(text);
    edited.spec.lines[0].requirement = "5000K throughout";
    const bad = await reopenExport(JSON.stringify(edited));
    expect(bad.ok).toBe(false);
    expect(bad.problems.join(" ")).toMatch(/changed after it was compiled/);
    expect((await reopenExport("{not json")).ok).toBe(false);
    expect((await reopenExport('{"schema":"other"}')).ok).toBe(false);
  });
  it("a failing specification exports only as a DRAFT and can't be passed off as verified", async () => {
    const s = await compileSpec(jl);
    const forged = { ...s, lines: s.lines.map((l) => (l.id === "cri" ? { ...l, requirement: "CRI 80+.", machine: machineValue("cri", "CRI 80+.") } : l)) };
    const v = await verifySpec(forged, { brief: jl });
    const x = buildExport(forged, v);
    expect(x.documentStatus).toBe("DRAFT_CHECKS_FAILED");
    expect(exportHtml(x)).toMatch(/DRAFT: one or more automated checks failed/);
    expect(exportHtml(x)).toMatch(/<title>[^<]*\(DRAFT\)/);
    expect(exportCsv(x)).toMatch(/DRAFT_CHECKS_FAILED/);
    const lie = JSON.parse(exportJson({ ...x, documentStatus: "CHECKS_PASSED" }));
    expect((await reopenExport(JSON.stringify(lie))).ok).toBe(false);
  });
  it("HTML and CSV carry the disclosures, escape content and neutralise formulas", async () => {
    const hostile = structuredClone(jl);
    hostile.input.clientLabel = '<script>alert(1)</script>';
    const s = await compileSpec(hostile);
    const x = buildExport(s, await verifySpec(s, { brief: hostile }));
    const html = exportHtml(x);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toMatch(/SYNTHETIC DATA/);
    expect(html).toMatch(/not an engineering design/);
    expect(html).toMatch(/Unknown to this document/);
    const csv = exportCsv({ ...x, spec: { ...s, lines: s.lines.map((l, i) => (i === 0 ? { ...l, requirement: "=HYPERLINK(\"x\")" } : l)) } });
    expect(csv.split("\n").length).toBe(s.lines.length + 2);
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("change impact", () => {
  it("A: change a favourite place, keep the written limits: limits unchanged and still held", async () => {
    const a = await compileSpec(jl);
    const r = await runRevision(jl, { replaceLove: { from: "Kendrick Lamar", to: "Norah Jones" } });
    const b = await compileSpec(r.brief);
    const d = diffSpecs(a, b);
    expect(d.input.loves.replaced).toEqual([{ from: "Kendrick Lamar", to: "Norah Jones" }]);
    expect(d.limitsUnchanged).toBe(true);
    expect(d.input.limits).toEqual([]);
    const v = await verifySpec(b, { brief: r.brief, previous: a });
    expect(v.counts.ERROR).toBe(0);
    for (const id of ["cct", "cri", "dimming"]) expect(d.lines.find((l) => l.id === id)!.cause ?? "evidence").not.toBe("limit"); // the limits did not move, so nothing may be attributed to them
    expect(kelvins(b.lines.find((l) => l.id === "cct")!.requirement).every((k) => k >= 2700 && k <= 3000)).toBe(true);
    expect(d.lines.map((l) => l.id)).toEqual(a.lines.map((l) => l.id));
  });
  it("B: change the CCT requirement, keep every reference: only that limit moves, the references don't", async () => {
    const a = await compileSpec(j);
    const r = await runRevision(j, { cctRange: { min: 2700, max: 3000 } });
    const b = await compileSpec(r.brief);
    const d = diffSpecs(a, b);
    expect(d.input.limits).toEqual([{ field: "colour temperature", from: "not set", to: "2700–3000K" }]);
    expect(d.input.loves).toEqual({ added: [], removed: [], replaced: [] });
    const cct = d.lines.find((l) => l.id === "cct")!;
    expect(cct.change).toBe("semantic_value");
    expect(cct.cause).toBe("limit");
    for (const id of ["layers", "fixtures", "optics"]) expect(["none", "explanation_only"]).toContain(d.lines.find((l) => l.id === id)!.change);
    expect(d.preserved).toContain("layers");
    expect(d.reverify.join(" ")).toMatch(/Written limits changed/);
    expect(d.limitsUnchanged).toBe(false);
  });
  it("wording changes alone are not changes", async () => {
    const a = await compileSpec(m);
    const reworded = { ...a, lines: a.lines.map((l) => ({ ...l, requirement: l.requirement.toUpperCase().replace(/\./g, " ."), rationale: `${l.rationale} (reworded)` })) };
    const d = diffSpecs(a, reworded);
    expect(d.counts.revised).toBe(0);
    expect(d.lines.every((l) => l.change === "none" || l.change === "explanation_only")).toBe(true);
    const same = diffSpecs(a, a);
    expect(same.counts).toMatchObject({ revised: 0, needsReview: 0 });
  });
  it("an accepted decision whose line changes is flagged NEEDS_REVIEW", async () => {
    const a = await compileSpec(j);
    const accepted = { ...a, lines: a.lines.map((l) => (l.id === "cct" ? { ...l, review: "accepted" as const } : l)) };
    const r = await runRevision(j, { cctRange: { min: 2700, max: 3000 } });
    const d = diffSpecs(accepted, await compileSpec(r.brief));
    expect(d.lines.find((l) => l.id === "cct")!.display).toBe("NEEDS_REVIEW");
    expect(d.invalidatedDecisions).toEqual(["cct"]);
    const v = await verifySpec(await compileSpec(r.brief), { previous: accepted });
    expect(v.diagnostics.some((x) => x.code === "ACCEPTED_DECISION_INVALIDATED")).toBe(true);
  });
  it("C: remove all Qloo evidence: limits survive, lines fall back to the literal reading and say so", async () => {
    const a = await compileSpec(jl);
    const r = await runRevision(jl, { removeEvidence: true });
    expect(r.brief.status).toBe("INSUFFICIENT_EVIDENCE");
    const b = await compileSpec(r.brief);
    const d = diffSpecs(a, b);
    expect(d.limitsUnchanged).toBe(true);
    expect(d.input.status).toEqual({ from: jl.status, to: "INSUFFICIENT_EVIDENCE" });
    expect(b.lines.every((l) => l.basis === "literal_fallback" || l.basis === "client_words")).toBe(true);
    expect(kelvins(b.lines.find((l) => l.id === "cct")!.requirement).every((k) => k >= 2700 && k <= 3000)).toBe(true);
    expect((await verifySpec(b, { brief: r.brief })).counts.ERROR).toBe(0);
  });
  it("D: contradictory requirements are refused before anything runs", () => {
    expect(() => reviseInput(jl.input, { sentence: "Minimum CRI 90 and CRI of at least 97." })).toThrow(ReviseError);
    expect(() => reviseInput(jl.input, { cctRange: { min: 3000, max: 2700 } })).toThrow(/not possible/);
    expect(() => reviseInput(jl.input, { criMin: 140 })).toThrow(/whole number/);
    expect(() => reviseInput(jl.input, { replaceLove: { from: "Nobody", to: "x" } })).toThrow(/not one of/);
    expect(() => reviseInput(jl.input, { sentence: "no dimming needed but it must dim to 5%" })).toThrow(/can't both hold/);
  });
  it("E: pinning an ambiguous reference to a confirmed entity changes what it resolved to", async () => {
    const { world, scenarios } = buildBenchmark();
    const amb = scenarios.find((s) => s.id === "amb-1")!;
    const movieId = amb.intended[0];
    const base: BriefInput = { ...amb.input, loves: ["Harbor Lights", "Sunday Brunch Club", "Wildflower Co"] };
    clearQlooCache();
    const before = await runBrief(base, () => {}, { transport: world, useLlm: false });
    const a = await compileSpec(before);
    const r = await runRevision(before, { pin: { "Harbor Lights": movieId } }, { transport: world });
    const b = await compileSpec(r.brief);
    const d = diffSpecs(a, b);
    expect(d.input.pinned).toEqual([{ input: "Harbor Lights", from: undefined, to: movieId }]);
    const resolved = (br: Brief) => br.resolutions.find((x) => x.input === "Harbor Lights")!;
    expect(resolved(r.brief).chosen?.entity_id).toBe(movieId);
    expect(resolved(r.brief).status).not.toBe("ambiguous");
    expect(b.brief.ambiguousReferences).not.toContain("Harbor Lights");
    if (a.brief.ambiguousReferences.includes("Harbor Lights")) expect(a.openQuestions.some((q) => q.includes("Harbor Lights"))).toBe(true);
    expect(b.openQuestions.some((q) => q.includes("Harbor Lights") && q.includes("more than one"))).toBe(false);
  });
});

describe("evidence sensitivity", () => {
  it("is computed from real recomputations, deterministic, and keeps the written limits", async () => {
    const t = new FixtureTransport();
    const run = async (b: Brief) => (await computeInfluence(structuredClone(b), t)).brief;
    clearQlooCache();
    const withInf = await run(jl);
    clearQlooCache();
    const again = await run(jl);
    const s1 = sensitivityFromBrief(withInf);
    const s2 = sensitivityFromBrief(again);
    const strip = (x: typeof s1) => ({ ...x, computedAt: "" });
    expect(strip(s1)).toEqual(strip(s2));
    expect(s1.references.length).toBe(withInf.influence!.references.length);
    expect(s1.hardLimitViolations).toBe(0);
    expect(s1.stabilityIndex).toBeGreaterThanOrEqual(0);
    expect(s1.stabilityIndex).toBeLessThanOrEqual(1);
    expect(s1.lines.map((l) => l.lineId)).toEqual(jl.spec.map((l) => l.id));
    for (const l of s1.lines) expect(["robust", "single_source", "multi_source", "unverifiable"]).toContain(l.stability);
    expect(s1.indexDefinition).toMatch(/not a validated confidence score/);
    // Cross-check: a line is "robust" exactly when no usable reference changed it.
    for (const l of s1.lines) expect(l.stability === "robust").toBe(!s1.references.some((r) => r.usable && r.changed.some((c) => c.lineId === l.lineId)));
  });
  it("runs on Maya and Jordan, and refuses to invent a result without the recomputation", async () => {
    clearQlooCache();
    const t = new FixtureTransport();
    for (const b of [m, j]) {
      const r = sensitivityFromBrief((await computeInfluence(structuredClone(b), t)).brief);
      expect(r.references.length).toBeGreaterThanOrEqual(2);
    }
    expect(() => sensitivityFromBrief(m)).toThrow(NoInfluenceError);
  });
  it("the compiled line versions are recomputable from the package", async () => {
    const s = await compileSpec(m);
    for (const l of s.lines) {
      const { lineVersion, ...rest } = l;
      expect(await lineVersionOf(rest)).toBe(lineVersion);
    }
  });
});
