// The specification verification agent: deterministic checks over a compiled
// specification. It is not a model and it does not grade taste. Each check is an
// invariant that can be tested on its own, each diagnostic points at a line, and
// the result is a list of checks that ran and what they found. It never certifies
// compliance.

import { limitProblem, type Limits } from "./constraints";
import type { CompiledLine, CompiledSpec } from "./compiler";
import { RULEBOOK_VERSION } from "./rulebooks";
import type { Brief } from "./types";
import { verifyLedger } from "./ledger";

export type Severity = "ERROR" | "WARNING" | "NEEDS_REVIEW" | "PASS";
export type DimensionStatus = "PASS" | "FAIL" | "NEEDS_REVIEW" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";
export type DimensionId = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface Diagnostic {
  severity: Severity;
  dimension: DimensionId;
  /** The specification line this is about, or "*" for the whole specification. */
  lineId: string;
  code: string;
  message: string;
  repair?: string;
}

export interface DimensionResult {
  id: DimensionId;
  name: string;
  status: DimensionStatus;
  detail: string;
}

export type DocumentStatus = "CHECKS_PASSED" | "CHECKS_PASSED_REVIEW_OPEN" | "DRAFT_CHECKS_FAILED";

export interface Verification {
  schema: "tastespec.verification/1";
  verifiedAt: string;
  versionId: string;
  dimensions: DimensionResult[];
  diagnostics: Diagnostic[];
  counts: Record<Severity, number>;
  documentStatus: DocumentStatus;
  /** Always present. A verification result is not a certificate. */
  statement: string;
}

export const DIMENSION_NAMES: Record<DimensionId, string> = {
  A: "Constraint correctness",
  B: "Evidence integrity",
  C: "Interpretation provenance",
  D: "Specification consistency",
  E: "Professional review requirements",
  F: "Revision safety",
  G: "Unknown-data disclosure",
};

const STATEMENT = "These are the checks that were run and what they found. They are not a certificate of compliance, safety or suitability, and they do not replace review by a qualified professional.";
const KNOWN_LINES = new Set(["cct", "layers", "fixtures", "dimming", "level", "optics", "cri", "walls", "materials", "floor", "accent", "pattern"]);

interface Context {
  /** The brief the specification was compiled from, if available: enables the ledger checks. */
  brief?: Pick<Brief, "ledger" | "input" | "status">;
  /** The previous accepted version, for revision-safety checks. */
  previous?: CompiledSpec;
}

const lineById = (s: CompiledSpec, id: string) => s.lines.find((l) => l.id === id);

export async function verifySpec(spec: CompiledSpec, ctx: Context = {}): Promise<Verification> {
  const d: Diagnostic[] = [];
  const add = (severity: Severity, dimension: DimensionId, lineId: string, code: string, message: string, repair?: string) => d.push({ severity, dimension, lineId, code, message, repair });
  const limits: Limits = spec.limits ?? {};

  // Structure: required fields, units, ranges (feeds A and C).
  for (const l of spec.lines) {
    if (!l.id || !l.category || !l.requirement) add("ERROR", "C", l.id || "?", "MISSING_FIELD", "The line is missing its id, category or requirement.", "Rebuild the specification from the brief.");
    const m = l.machine;
    if (m.kind === "cct") {
      if (m.unit !== "K") add("ERROR", "A", l.id, "BAD_UNIT", `Colour temperature must be in K, found ${String((m as { unit?: unknown }).unit)}.`);
      if (m.min < 1800 || m.max > 6500 || m.min > m.max) add("ERROR", "A", l.id, "OUT_OF_RANGE", `Colour temperature ${m.min}–${m.max}K is outside what a room specification can use (1800–6500K).`);
    }
    if (m.kind === "cri" && (m.min < 60 || m.min > 100)) add("ERROR", "A", l.id, "OUT_OF_RANGE", `CRI ${m.min} is not a possible Ra value.`);
    if (m.kind === "dimming" && m.floor !== undefined && (m.floor < 1 || m.floor > 100)) add("ERROR", "A", l.id, "OUT_OF_RANGE", `A dimming floor of ${m.floor}% is not a valid level (1–100).`);
    if (m.kind === "illuminance" && m.target !== undefined && (m.target < 5 || m.target > 2000)) add("ERROR", "A", l.id, "OUT_OF_RANGE", `${m.target} lx is outside a sensible room target (5–2000).`);
  }

  // A. Constraint correctness: each written limit against its line.
  const limitLines = new Set<string>();
  for (const l of spec.lines) {
    const p = limitProblem(l.id, l.requirement, limits);
    const applies = (l.id === "cct" && limits.cct) || (l.id === "cri" && limits.criMin) || (l.id === "dimming" && limits.dimTo) || (l.id === "level" && limits.luxTarget);
    if (applies) limitLines.add(l.id);
    if (p) add("ERROR", "A", l.id, "LIMIT_VIOLATED", `${l.category}: ${p}.`, "Rebuild the specification: the client's written limit always wins over evidence.");
    else if (applies) add("PASS", "A", l.id, "LIMIT_HELD", `${l.category} respects the client's written limit.`);
  }
  for (const [id, need] of [["cct", limits.cct], ["cri", limits.criMin], ["dimming", limits.dimTo], ["level", limits.luxTarget]] as const) {
    if (need && !lineById(spec, id)) add("ERROR", "A", id, "LIMIT_LINE_MISSING", `The client wrote a ${id} limit but the specification has no such line.`, "Rebuild the specification.");
  }
  if (spec.client.trade === "lighting" && spec.brief.words.length && /warm|cozy|cosy|inviting|snug/i.test(spec.brief.words.join(" "))) {
    const cct = lineById(spec, "cct");
    if (cct?.machine.kind === "cct" && cct.machine.ambient > 3000) add("ERROR", "A", "cct", "WARM_FLOOR", `The client used a warm word but ambient light is ${cct.machine.ambient}K (above 3000K).`, "Cap ambient colour temperature at 3000K unless the client wrote a different range.");
  }

  // B. Evidence integrity.
  const refSeqs = new Set(spec.evidenceRefs.map((r) => r.seq));
  const ledgerSeqs = ctx.brief ? new Set(ctx.brief.ledger.filter((e) => e.kind === "qloo_call").map((e) => e.seq)) : undefined;
  for (const l of spec.lines) {
    if (l.basis === "qloo_evidence") {
      if (!l.evidenceIds.length) add("ERROR", "B", l.id, "EVIDENCE_MISSING", "The line claims Qloo evidence but cites no Qloo request.", "Rebuild the specification, or treat the line as the literal reading.");
      if (!l.evidenceSummary.length) add("ERROR", "B", l.id, "EVIDENCE_EMPTY", "The line cites requests but carries no measured atmosphere.", "Rebuild the specification.");
      for (const s of l.evidenceIds) {
        if (!refSeqs.has(s)) add("ERROR", "B", l.id, "EVIDENCE_NOT_CARRIED", `Evidence #${s} is cited but not included in the package.`, "Re-export from the original brief.");
        if (ledgerSeqs && !ledgerSeqs.has(s)) add("ERROR", "B", l.id, "EVIDENCE_NOT_IN_LEDGER", `Evidence #${s} is not a Qloo request in this brief's ledger.`, "The citation does not match the record. Do not rely on this line.");
      }
      if (l.evidenceIds.length && l.evidenceSummary.length && !d.some((x) => x.lineId === l.id && x.dimension === "B" && x.severity === "ERROR")) add("PASS", "B", l.id, "EVIDENCE_CITED", `Cites ${l.evidenceIds.length} Qloo request(s) with measured atmospheres.`);
    } else if (l.evidenceIds.length === 0 && l.basis !== "client_words" && l.basis !== "literal_fallback" && l.basis !== "constraint" && l.basis !== "client_answer") {
      add("ERROR", "B", l.id, "UNSUPPORTED_SOURCE", `Unrecognised source "${String(l.basis)}".`);
    }
  }
  if (ctx.brief) {
    const chain = await verifyLedger(ctx.brief.ledger, spec.ledgerHead);
    if (!chain.ok) add("ERROR", "B", "*", "LEDGER_BROKEN", `The evidence ledger does not verify: ${chain.reason}.`, "Do not rely on this specification; the record was altered or truncated.");
    else add("PASS", "B", "*", "LEDGER_INTACT", `The evidence ledger chain verifies (${chain.checked} entries).`);
  }
  if (spec.dataMode === "fixture") add("WARNING", "B", "*", "SYNTHETIC_EVIDENCE", "The evidence is from a fictional test world, not from Qloo. Suitable for demonstration only.", "Run the brief against live Qloo before relying on it.");
  if (spec.status === "UPSTREAM_UNAVAILABLE" || spec.status === "INSUFFICIENT_EVIDENCE") add("WARNING", "B", "*", "NO_USABLE_EVIDENCE", `No usable Qloo evidence (${spec.status.replace(/_/g, " ").toLowerCase()}): every line is the literal reading of the client's words.`, "Add references Qloo can identify, or retry when Qloo is available.");

  // C. Interpretation provenance.
  for (const l of spec.lines) {
    const [rb, id] = l.interpretationRule.split(":");
    if (id !== l.id) add("ERROR", "C", l.id, "RULE_MISMATCH", `The interpretation rule "${l.interpretationRule}" does not belong to this line.`);
    else if (rb !== RULEBOOK_VERSION) add("WARNING", "C", l.id, "STALE_RULEBOOK", `Built with ${rb}; the current rulebook is ${RULEBOOK_VERSION}. The line may read differently now.`, "Rebuild the specification to apply the current rules.");
    else if (!KNOWN_LINES.has(l.id)) add("NEEDS_REVIEW", "C", l.id, "UNKNOWN_RULE", `No documented rule is registered for "${l.id}".`);
    else add("PASS", "C", l.id, "RULE_LINKED", `Linked to documented rule ${l.interpretationRule}.`);
  }
  if (spec.rulebookVersion !== RULEBOOK_VERSION) add("WARNING", "C", "*", "STALE_EVIDENCE_VERSION", `The specification was compiled with ${spec.rulebookVersion}; the current rulebook is ${RULEBOOK_VERSION}.`, "Rebuild to refresh.");

  // D. Consistency between lines.
  const cct = lineById(spec, "cct");
  const dim = lineById(spec, "dimming");
  const level = lineById(spec, "level");
  if (cct?.machine.kind === "cct" && cct.machine.dimToWarm && dim?.machine.kind === "dimming") {
    if (dim.machine.floor === undefined && !/Full-range|Smooth/.test(dim.requirement)) add("WARNING", "D", "cct", "DIM_TO_WARM_WITHOUT_DIMMING", "The colour-temperature line relies on dim-to-warm, but the dimming line gives no dimming range.", "Specify full-range dimming, or drop dim-to-warm.");
    else add("PASS", "D", "cct", "DIM_TO_WARM_CONSISTENT", "Dim-to-warm is matched by a dimming range.");
  }
  if (level?.machine.kind === "illuminance" && level.machine.target !== undefined && level.machine.typicalMin !== undefined && level.machine.typicalMax !== undefined) {
    const { target, typicalMin, typicalMax } = level.machine;
    if (target < typicalMin || target > typicalMax) add("NEEDS_REVIEW", "D", "level", "TARGET_OUTSIDE_TYPICAL", `The ${target} lx target is outside the typical ${typicalMin}–${typicalMax} lx for this room. That may be intended; a lighting calculation should confirm it.`, "Confirm the client means it, then keep it.");
  }
  if (limits.cct && limits.criMin && limits.criMin >= 95 && limits.cct.max < 2200) add("NEEDS_REVIEW", "D", "cri", "CRI_AT_VERY_WARM_CCT", "A very high CRI at a very low colour temperature narrows the available fittings.", "Ask the supplier whether such fittings exist.");
  if (!d.some((x) => x.dimension === "D" && x.severity !== "PASS")) add("PASS", "D", "*", "NO_CONFLICTS", "No conflicts found between the specification's lines.");

  // E. What needs a professional.
  for (const l of spec.lines) {
    if (l.id === "level") add("NEEDS_REVIEW", "E", l.id, "NEEDS_CALCULATION", "The light level is a starting target. It needs a lighting calculation with the room's dimensions, surfaces and fittings, none of which are known here.", "Provide room dimensions and run a lighting calculation.");
    if (l.id === "dimming") add("NEEDS_REVIEW", "E", l.id, "NEEDS_COMPATIBILITY", "Driver and dimmer compatibility depends on the chosen fittings, which are not selected.", "Confirm compatibility with the manufacturer once fittings are chosen.");
    if (l.basis === "literal_fallback") add("NEEDS_REVIEW", "E", l.id, "NO_EVIDENCE_BEHIND_LINE", "This line is the literal reading of the client's words; nothing from Qloo supports it.", "Ask the client about this line directly.");
    else if (l.confidence === "low" && l.basis === "qloo_evidence") add("NEEDS_REVIEW", "E", l.id, "LOW_CONFIDENCE", "The evidence for this line is weak.", "Confirm with the client before relying on it.");
  }
  for (const q of spec.openQuestions) add("NEEDS_REVIEW", "E", "*", "OPEN_QUESTION", q);
  for (const a of spec.brief.ambiguousReferences) if (!spec.openQuestions.some((q) => q.includes(a))) add("NEEDS_REVIEW", "E", "*", "AMBIGUOUS_REFERENCE", `"${a}" matched more than one entity.`);

  // F. Revision safety.
  if (ctx.previous) {
    const prev = ctx.previous;
    for (const l of spec.lines) {
      const p = lineById(prev, l.id);
      if (!p) continue;
      if (p.review === "accepted" && p.lineVersion !== l.lineVersion) add("NEEDS_REVIEW", "F", l.id, "ACCEPTED_DECISION_INVALIDATED", `An accepted decision on "${l.category}" no longer matches the revised line (${p.requirement} → ${l.requirement}).`, "Re-review this line.");
    }
    for (const id of limitLines) {
      const was = lineById(prev, id);
      const now = lineById(spec, id);
      if (was && now && limitProblem(id, was.requirement, limits) === undefined && limitProblem(id, now.requirement, limits) !== undefined) add("ERROR", "F", id, "REVISION_BROKE_LIMIT", "The revision breaks a limit the previous version met.", "Reject the revision or rebuild it.");
    }
    if (!d.some((x) => x.dimension === "F")) add("PASS", "F", "*", "REVISION_SAFE", "No earlier decision was invalidated and no limit was broken by the revision.");
  }

  // G. Unknown-data disclosure.
  if (!spec.unknowns.length) add("ERROR", "G", "*", "NO_UNKNOWNS_LISTED", "The specification lists no unknowns, which would present assumptions as measured values.", "Rebuild the specification.");
  else add("PASS", "G", "*", "UNKNOWNS_LISTED", `${spec.unknowns.length} unknowns are stated in the package.`);
  if (!spec.notCertified) add("ERROR", "G", "*", "NO_DISCLAIMER", "The package lacks its not-certified statement.");
  for (const l of spec.lines) if (l.machine.kind !== "text" && !l.assumptions.length) add("WARNING", "G", l.id, "NO_ASSUMPTIONS_STATED", "A measured-looking value carries no stated assumptions.");

  const counts = { ERROR: 0, WARNING: 0, NEEDS_REVIEW: 0, PASS: 0 } as Record<Severity, number>;
  for (const x of d) counts[x.severity]++;
  const status = (id: DimensionId): DimensionStatus => {
    const xs = d.filter((x) => x.dimension === id);
    if (xs.some((x) => x.severity === "ERROR")) return "FAIL";
    if (xs.some((x) => x.severity === "NEEDS_REVIEW")) return "NEEDS_REVIEW";
    if (id === "B" && (spec.status === "INSUFFICIENT_EVIDENCE" || spec.status === "UPSTREAM_UNAVAILABLE")) return "INSUFFICIENT_EVIDENCE";
    if (id === "F" && !ctx.previous) return "NOT_APPLICABLE";
    if (id === "A" && !limitLines.size && !xs.some((x) => x.code === "WARM_FLOOR")) return xs.length ? "PASS" : "NOT_APPLICABLE";
    return "PASS";
  };
  const detail = (id: DimensionId, s: DimensionStatus) => {
    const n = d.filter((x) => x.dimension === id && x.severity !== "PASS").length;
    return s === "NOT_APPLICABLE" ? (id === "F" ? "No previous version to compare." : "No written limits to check.") : s === "INSUFFICIENT_EVIDENCE" ? "No usable Qloo evidence to check against." : n ? `${n} finding(s).` : "No findings.";
  };
  const dimensions = (Object.keys(DIMENSION_NAMES) as DimensionId[]).map((id) => {
    const s = status(id);
    return { id, name: DIMENSION_NAMES[id], status: s, detail: detail(id, s) };
  });
  const failed = counts.ERROR > 0;
  return {
    schema: "tastespec.verification/1",
    verifiedAt: new Date().toISOString(),
    versionId: spec.versionId,
    dimensions,
    diagnostics: d,
    counts,
    documentStatus: failed ? "DRAFT_CHECKS_FAILED" : counts.NEEDS_REVIEW > 0 || counts.WARNING > 0 ? "CHECKS_PASSED_REVIEW_OPEN" : "CHECKS_PASSED",
    statement: STATEMENT,
  };
}

/** Findings for one line, worst first. */
export function lineFindings(v: Verification, line: Pick<CompiledLine, "id">) {
  const order: Record<Severity, number> = { ERROR: 0, NEEDS_REVIEW: 1, WARNING: 2, PASS: 3 };
  return v.diagnostics.filter((x) => x.lineId === line.id).sort((a, b) => order[a.severity] - order[b.severity]);
}
