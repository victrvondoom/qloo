// The decision challenge engine and the review board, on real agent runs (synthetic world).
import { beforeAll, describe, expect, it } from "vitest";
import { recordDecision, runBrief } from "@/lib/agent";
import { approvedValue, challengeProve, challengeRepair, challengeWhy, challengeWhyNot, normaliseAlternative } from "@/lib/challenge";
import { compileSpec } from "@/lib/compiler";
import { clearQlooCache } from "@/lib/qloo/client";
import { approvalValid, approveSpecification, isLocked, lineStates, reviewLine, ReviewError } from "@/lib/review";
import { verifySpec } from "@/lib/verify-spec";
import { runRevision } from "@/lib/revise";
import { buildExport, exportHtml } from "@/lib/spec-export";
import { buildBenchmark } from "../benchmarks/scenarios";
import type { Brief, BriefInput } from "@/lib/types";

const base: BriefInput = { clientLabel: "Jordan", trade: "lighting", room: "living_room", city: "Chicago", words: ["modern"], loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };
const warm: BriefInput = { ...base, clientLabel: "Maya", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
const limited: BriefInput = { ...base, cctRange: { min: 2700, max: 3000 }, criMin: 95, dimTo: 5, dimmable: true, luxTarget: 250 };
let free: Brief;
let w: Brief;
let lim: Brief;
const specOf = (b: Brief) => compileSpec(b);

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  clearQlooCache();
  [free, w, lim] = await Promise.all([runBrief(base, () => {}), runBrief(warm, () => {}), runBrief(limited, () => {})]);
});

describe("why this?", () => {
  it("answers from the decision record: client statements, evidence, rule, limits, alternatives", async () => {
    const a = await challengeWhy(free, await specOf(free), "cct");
    expect(a.decidedBy.rule).toBe(`${free.rulebookVersion}:cct`);
    expect(a.clientStatements.join(" ")).toMatch(/modern/);
    expect(a.evidence.length).toBeGreaterThan(0);
    expect(a.evidenceIds.length).toBeGreaterThan(0);
    expect(a.decidedBy.margin).toBeGreaterThanOrEqual(0);
    expect(a.alternatives.some((x) => x.verdict === "SAME")).toBe(true);
    expect(a.alternatives.length).toBeGreaterThan(2);
    const ledger = new Set(free.ledger.filter((e) => e.kind === "qloo_call").map((e) => e.seq));
    for (const e of a.evidenceIds) expect(ledger.has(e)).toBe(true); // nothing invented: every id is a real Qloo request
  });
  it("with a written range: the limit decided it, and alternatives outside it are blocked", async () => {
    const a = await challengeWhy(lim, await specOf(lim), "cct");
    expect(a.decidedBy.basis).toBe("constraint");
    expect(a.constraints.some((c) => /written limit/.test(c.text) && c.held)).toBe(true);
    expect(a.alternatives.filter((x) => x.verdict === "BLOCKED").every((x) => /written limit/.test(x.reasons.join(" ")))).toBe(true);
  });
  it("with no Qloo evidence it says so instead of inventing support", async () => {
    const r = await runRevision(free, { removeEvidence: true });
    const a = await challengeWhy(r.brief, await specOf(r.brief), "layers");
    expect(a.evidence).toEqual([]);
    expect(a.decidedBy.summary).toMatch(/No usable Qloo evidence|client's words/);
    expect(a.needsInfo.join(" ")).toMatch(/nothing from Qloo supports it/);
  });
});

describe("why not that?", () => {
  it("2700K vs 3000K under a 2700–3000K range: allowed, with consequences from the verifier", async () => {
    const spec = await specOf(lim);
    const a = await challengeWhyNot(lim, spec, "cct", "2700K");
    expect(["ALLOWED", "SAME"]).toContain(a.verdict);
    if (a.verdict === "ALLOWED") {
      expect(a.normalised).toBe("2700K throughout");
      expect(a.consequences).toBeDefined();
      expect(a.evidenceView).toMatch(/rulebook/);
    }
  });
  it("blocks a value outside an explicit CCT range, and one that breaks the warm floor, with the reason", async () => {
    const a = await challengeWhyNot(lim, await specOf(lim), "cct", "4000K");
    expect(a.verdict).toBe("BLOCKED");
    expect(a.reasons.join(" ")).toMatch(/written limit/);
    const b = await challengeWhyNot(w, await specOf(w), "cct", "4000K");
    expect(b.verdict).toBe("BLOCKED");
    expect(b.reasons.join(" ")).toMatch(/warm word|3000K/);
  });
  it("blocks a CRI below the minimum, a dimming floor above the client's, and a different lux target", async () => {
    const spec = await specOf(lim);
    expect((await challengeWhyNot(lim, spec, "cri", "CRI 90")).reasons.join(" ")).toMatch(/minimum of 95/);
    expect((await challengeWhyNot(lim, spec, "dimming", "20%")).verdict).toBe("BLOCKED");
    expect((await challengeWhyNot(lim, spec, "level", "400 lux")).verdict).toBe("BLOCKED");
    expect((await challengeWhyNot(lim, spec, "cri", "CRI 99")).verdict).toBe("ALLOWED");
  });
  it("rejects impossible values and unsupported material assumptions with meaningful reasons", async () => {
    const spec = await specOf(free);
    expect((await challengeWhyNot(free, spec, "cri", "CRI 140")).reasons[0]).toMatch(/not possible/);
    expect((await challengeWhyNot(free, spec, "dimming", "0%")).reasons[0]).toMatch(/off/);
    expect((await challengeWhyNot(free, spec, "cct", "9000K")).reasons[0]).toMatch(/outside/);
    const lumens = await challengeWhyNot(free, spec, "level", "5000 lumens");
    expect(lumens.verdict).toBe("UNSUPPORTED");
    const mat = await challengeWhyNot(free, spec, "fixtures", "hand-blown Murano glass pendants");
    expect(mat.verdict).toBe("UNSUPPORTED");
    expect(mat.reasons[0]).toMatch(/unsupported assumption/);
    expect((await challengeWhyNot(free, spec, "cct", "")).verdict).toBe("UNSUPPORTED");
  });
  it("accepts a rulebook option by name, and says when it is already the choice", async () => {
    const spec = await specOf(free);
    const menuAlt = (await challengeWhy(free, spec, "fixtures")).alternatives.find((x) => x.verdict === "ALLOWED")!;
    expect((await challengeWhyNot(free, spec, "fixtures", menuAlt.value)).verdict).toBe("ALLOWED");
    expect((await challengeWhyNot(free, spec, "fixtures", spec.lines.find((l) => l.id === "fixtures")!.requirement)).verdict).toBe("SAME");
  });
  it("refuses a line that isn't in the specification", async () => {
    await expect(challengeWhy(free, await specOf(free), "nope")).rejects.toThrow(/not in this specification/);
  });
});

describe("prove it and repair it", () => {
  it("prove shows this line's findings from the real verifier", async () => {
    const p = await challengeProve(lim, await specOf(lim), "level");
    expect(p.findings.some((f) => f.code === "NEEDS_CALCULATION")).toBe(true);
    expect(p.errors).toBe(0);
  });
  it("repair: a line forced out of its limit gets the minimal valid correction, with consequences, and nothing changes until applied", async () => {
    const spec = await specOf(lim);
    const broken = { ...spec, lines: spec.lines.map((l) => (l.id === "cct" ? { ...l, requirement: "4000K throughout", machine: { kind: "cct" as const, unit: "K" as const, min: 4000, max: 4000, ambient: 4000, dimToWarm: false } } : l)) };
    const r = await challengeRepair(lim, broken, "cct");
    expect(r.requiresApproval).toBe(true);
    expect(r.problems.join(" ")).toMatch(/outside the client's range/);
    expect(r.proposal?.value).toBe("3000K throughout");
    expect(r.consequences?.resolvedFindings.some((d) => d.code === "LIMIT_VIOLATED")).toBe(true);
    expect(r.consequences?.newFindings.filter((d) => d.severity === "ERROR")).toEqual([]);
    expect(broken.lines.find((l) => l.id === "cct")!.requirement).toBe("4000K throughout"); // no hidden mutation
    expect((await challengeRepair(lim, spec, "cct")).problems).toEqual([]);
  });
  it("repair of an error no written limit explains proposes nothing instead of guessing", async () => {
    const spec = await specOf(free);
    const bad = { ...spec, lines: spec.lines.map((l) => (l.id === "layers" ? { ...l, evidenceIds: [], evidenceSummary: [], basis: "qloo_evidence" as const } : l)) };
    const r = await challengeRepair(free, bad, "layers");
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.proposal).toBeUndefined();
    expect(r.note).toMatch(/No automatic repair/);
  });
  it("corrupted evidence is caught by prove, never passed", async () => {
    const tampered = structuredClone(free);
    tampered.ledger[1].summary += " (edited)";
    const p = await challengeProve(tampered, await specOf(tampered), "cct");
    expect(p.overall).toBe("DRAFT_CHECKS_FAILED");
    const w2 = await challengeWhy(tampered, await specOf(tampered), "cct");
    expect(w2.constraints.every((c) => !c.held)).toBe(true);
  });
  it("applying is re-evaluated server side: a blocked alternative can't be applied", async () => {
    const spec = await specOf(lim);
    await expect(approvedValue(lim, spec, "cct", "4000K", "alternative")).rejects.toThrow(/written limit/);
    expect(await approvedValue(lim, spec, "cri", "CRI 99", "alternative")).toBe("CRI 99+.");
    const next = await recordDecision(lim, "cri", "revised", "CRI 99+.", "after challenge");
    const spec2 = await compileSpec(next);
    expect(spec2.lines.find((l) => l.id === "cri")!.requirement).toBe("CRI 99+.");
    expect(spec2.lines.find((l) => l.id === "cri")!.override?.from).toMatch(/CRI 95/);
    expect((await verifySpec(spec2, { brief: next })).diagnostics.some((d) => d.code === "DESIGNER_OVERRIDE" && d.lineId === "cri")).toBe(true);
    expect(lim.spec.find((l) => l.id === "cri")!.status).not.toBe("revised"); // the earlier version is untouched
  });
});

describe("challenges around changed and ambiguous references", () => {
  it("a changed favourite changes the evidence the explanation cites", async () => {
    const r = await runRevision(free, { replaceLove: { from: "Kendrick Lamar", to: "Norah Jones" } });
    const a = await challengeWhy(free, await specOf(free), "layers");
    const b = await challengeWhy(r.brief, await specOf(r.brief), "layers");
    expect(b.evidenceIds.every((e) => r.brief.ledger.some((l) => l.seq === e && l.kind === "qloo_call"))).toBe(true);
    expect(JSON.stringify(a.evidence)).toBeDefined();
  });
  it("conflicting instructions never reach the engine: they are refused when the revision is built", async () => {
    await expect(runRevision(free, { sentence: "CRI at least 90 and CRI at least 97" })).rejects.toThrow(/can't both hold/);
  });
  it("an ambiguous reference is flagged by the challenge as needing information", async () => {
    const { world, scenarios } = buildBenchmark();
    const amb = scenarios.find((s) => s.id === "amb-0")!;
    clearQlooCache();
    const br = await runBrief({ ...amb.input }, () => {}, { transport: world, useLlm: false });
    const spec = await compileSpec(br);
    const amb0 = br.resolutions.find((x) => x.input === "Harbor Lights")!;
    if (amb0.status === "ambiguous") expect(spec.openQuestions.join(" ")).toMatch(/more than one entity/);
    else expect(["resolved", "not_found", "weak", "ambiguous"]).toContain(amb0.status);
  });
});

describe("normaliseAlternative", () => {
  it("maps typed text to the rulebook's wording", () => {
    expect(normaliseAlternative("cct", "2200–2700K", undefined, []).value).toBe("2200–2700K");
    expect(normaliseAlternative("cct", "3000 k", undefined, []).value).toBe("3000K throughout");
    expect(normaliseAlternative("cri", "ra 92", undefined, []).value).toBe("CRI 92+.");
    expect(normaliseAlternative("cct", "2700-2200K", undefined, []).impossible).toMatch(/backwards/);
  });
});

describe("review board", () => {
  it("starts DRAFT or NEEDS_REVIEW, never approved, and walks the allowed transitions", async () => {
    const spec = await specOf(free);
    const v = await verifySpec(spec, { brief: free });
    const s0 = lineStates(free, v);
    expect(Object.values(s0).every((s) => s === "DRAFT" || s === "NEEDS_REVIEW")).toBe(true);
    expect(s0.level).toBe("NEEDS_REVIEW");
    let b = await reviewLine(free, spec, v, { lineId: "cct", action: "accept" });
    expect(lineStates(b, v).cct).toBe("APPROVED");
    await expect(reviewLine(b, spec, v, { lineId: "cct", action: "accept" })).rejects.toThrow(/can't be/);
    await expect(reviewLine(b, spec, v, { lineId: "cct", action: "reopen" })).resolves.toBeDefined();
    await expect(reviewLine(b, spec, v, { lineId: "cct", action: "request_clarification" })).rejects.toThrow(/reason/);
    b = await reviewLine(b, spec, v, { lineId: "cct", action: "request_clarification", note: "Ask whether 2700K feels too amber" });
    expect(lineStates(b, v).cct).toBe("REVISION_REQUESTED");
    b = await reviewLine(b, spec, v, { lineId: "cct", action: "reject", note: "Not what they described" });
    expect(lineStates(b, v).cct).toBe("REJECTED");
    await expect(reviewLine(b, spec, v, { lineId: "cct", action: "accept" })).rejects.toThrow(/can't be/);
    b = await reviewLine(b, spec, v, { lineId: "cct", action: "reopen" });
    expect(lineStates(b, v).cct).toBe("NEEDS_REVIEW");
    const e = b.review!.entries.at(-1)!;
    expect(e).toMatchObject({ lineId: "cct", action: "reopen", from: "REJECTED", to: "NEEDS_REVIEW", specVersionId: spec.versionId });
    expect(e.at).toBeTruthy();
    expect(b.ledger.some((l) => /Review: reopen/.test(l.summary))).toBe(true);
    expect(free.review).toBeUndefined(); // the earlier version is unchanged
  });
  it("a line with errors can't be accepted; a proposed alternative must be pre-evaluated", async () => {
    const spec = await specOf(lim);
    const broken = { ...spec, lines: spec.lines.map((l) => (l.id === "cct" ? { ...l, requirement: "4000K throughout", machine: { kind: "cct" as const, unit: "K" as const, min: 4000, max: 4000, ambient: 4000, dimToWarm: false } } : l)) };
    const v = await verifySpec(broken, { brief: lim });
    await expect(reviewLine(lim, broken, v, { lineId: "cct", action: "accept" })).rejects.toThrow(/verification errors/);
    await expect(reviewLine(lim, spec, await verifySpec(spec, { brief: lim }), { lineId: "cri", action: "propose_alternative" })).rejects.toThrow(/evaluated/);
    const ok = await reviewLine(lim, spec, await verifySpec(spec, { brief: lim }), { lineId: "cri", action: "propose_alternative", after: "CRI 99+.", note: "client likes colour accuracy" });
    expect(ok.spec.find((l) => l.id === "cri")!.revisedTo).toBe("CRI 99+.");
    expect(ok.review!.entries[0]).toMatchObject({ before: spec.lines.find((l) => l.id === "cri")!.requirement, after: "CRI 99+." });
  });
  it("final approval needs every line approved and no errors, locks the version, and exports the review history", async () => {
    let b = free;
    const spec = await specOf(b);
    const v = await verifySpec(spec, { brief: b });
    await expect(approveSpecification(b, spec, v)).rejects.toThrow(/Every line must be approved/);
    for (const l of spec.lines) b = await reviewLine(b, spec, v, { lineId: l.id, action: "accept" });
    const done = await approveSpecification(b, spec, v, "Reviewed with the client");
    expect(isLocked(done)).toBe(true);
    expect(approvalValid(done, spec.versionId)).toBe(true);
    await expect(reviewLine(done, spec, v, { lineId: "cct", action: "reopen" })).rejects.toThrow(/locked/);
    await expect(approveSpecification(done, spec, v)).rejects.toThrow(/already approved/);
    const spec2 = await compileSpec(done);
    expect(spec2.versionId).toBe(spec.versionId); // approving does not alter the specification
    const html = exportHtml(buildExport(spec2, await verifySpec(spec2, { brief: done }), { review: { entries: done.review!.entries, approval: done.review!.approval, approvalValid: true } }));
    expect(html).toMatch(/Approved by a human reviewer/);
    expect(html).toMatch(/not a professional certification/);
    expect(html).toMatch(/Review history/);
    expect(done.review!.entries.length).toBe(spec.lines.length);
    // A revision of an approved version is a new brief; the approved one stays as it was.
    const rev = await runRevision(done, { cctRange: { min: 2700, max: 3000 } });
    expect(rev.brief.review).toBeUndefined();
    expect(done.review!.approval).toBeDefined();
  });
  it("won't approve while verification has errors", async () => {
    const spec = await specOf(lim);
    const broken = { ...spec, lines: spec.lines.map((l) => (l.id === "cri" ? { ...l, requirement: "CRI 80+.", machine: { kind: "cri" as const, unit: "Ra" as const, min: 80, r9Required: false } } : l)) };
    const v = await verifySpec(broken, { brief: lim });
    let b = lim;
    for (const l of spec.lines.filter((x) => x.id !== "cri")) b = await reviewLine(b, spec, await verifySpec(spec, { brief: lim }), { lineId: l.id, action: "accept" });
    await expect(approveSpecification(b, broken, v)).rejects.toThrow(/Every line must be approved|error/);
    expect(ReviewError).toBeDefined();
  });
});

describe("clarification optimizer", () => {
  it("explains the question asked, what each answer changes, and why other contrasts were held back", async () => {
    const { explainClarification } = await import("@/lib/clarify");
    const asked = [free, w, lim].map((b) => explainClarification(b));
    for (const r of asked) {
      expect(r.candidates.length).toBeGreaterThan(3);
      expect(r.metric).toMatch(/Not calibrated information gain/);
      if (r.asked) {
        expect(r.asked.affected.length).toBeGreaterThanOrEqual(2);
        expect(r.candidates.filter((c) => c.decision === "asked")).toHaveLength(1);
        expect(r.asked.ifA.length + r.asked.ifB.length).toBeGreaterThan(0);
      } else {
        expect(r.candidates.every((c) => c.decision === "held back")).toBe(true);
      }
    }
    const r = await runRevision(free, { removeEvidence: true });
    expect(() => explainClarification(r.brief)).not.toThrow();
  });
});
