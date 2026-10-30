// Export of a compiled specification: print-ready HTML (use the browser's Print to
// PDF), structured JSON and CSV. Every export carries its verification outcome and
// its not-certified statement. A specification whose checks failed is exported as
// a DRAFT with that written on every page; it can never be exported as passing.
// No export is called certified, compliant or construction-ready.

import { rangeLabel } from "./constraints";
import { lineVersionOf, SPEC_SCHEMA, type CompiledSpec } from "./compiler";
import type { SpecDiff } from "./spec-diff";
import type { ReviewBoard, ReviewEntry } from "./types";
import type { SensitivityReport } from "./sensitivity";
import { verifySpec, type DocumentStatus, type Verification } from "./verify-spec";

export const EXPORT_SCHEMA = "tastespec.export/1";

export interface SpecExport {
  schema: typeof EXPORT_SCHEMA;
  documentStatus: DocumentStatus;
  exportedAt: string;
  spec: CompiledSpec;
  verification: Verification;
  revision?: SpecDiff;
  sensitivity?: SensitivityReport;
  review?: { entries: ReviewEntry[]; approval?: ReviewBoard["approval"]; approvalValid: boolean };
}

export const STATUS_TEXT: Record<DocumentStatus, string> = {
  CHECKS_PASSED: "All automated checks passed. Not a certificate.",
  CHECKS_PASSED_REVIEW_OPEN: "Automated checks passed; review items are open. Not a certificate.",
  DRAFT_CHECKS_FAILED: "DRAFT: one or more automated checks failed. Do not rely on this document.",
};

export function buildExport(spec: CompiledSpec, verification: Verification, extra: { revision?: SpecDiff; sensitivity?: SensitivityReport; review?: SpecExport["review"]; now?: string } = {}): SpecExport {
  return { schema: EXPORT_SCHEMA, documentStatus: verification.documentStatus, exportedAt: extra.now ?? new Date().toISOString(), spec, verification, ...(extra.revision ? { revision: extra.revision } : {}), ...(extra.sensitivity ? { sensitivity: extra.sensitivity } : {}), ...(extra.review ? { review: extra.review } : {}) };
}

export const exportJson = (x: SpecExport) => JSON.stringify(x, null, 2);

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Neutralise spreadsheet formulas as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function exportCsv(x: SpecExport): string {
  const head = ["spec_id", "version_id", "document_status", "data_mode", "line_id", "category", "requirement", "unit", "value_min", "value_max", "hard_constraints", "source", "confidence", "evidence_ids", "interpretation_rule", "review_status", "verification", "findings"];
  const rows = x.spec.lines.map((l) => {
    const m = l.machine;
    const f = x.verification.diagnostics.filter((d) => d.lineId === l.id && d.severity !== "PASS");
    const worst = f.some((d) => d.severity === "ERROR") ? "ERROR" : f.some((d) => d.severity === "NEEDS_REVIEW") ? "NEEDS_REVIEW" : f.length ? "WARNING" : "PASS";
    const [min, max] = m.kind === "cct" ? [m.min, m.max] : m.kind === "cri" ? [m.min, ""] : m.kind === "dimming" ? [m.floor ?? "", ""] : m.kind === "illuminance" ? [m.target ?? "", ""] : ["", ""];
    return [x.spec.specId, x.spec.versionId, x.documentStatus, x.spec.dataMode, l.id, l.category, l.requirement, m.kind === "text" ? "" : m.unit, min, max, l.hardConstraints.join(" | "), l.basis, l.confidence, l.evidenceIds.join(" "), l.interpretationRule, l.review, worst, f.map((d) => `${d.code}: ${d.message}`).join(" | ")];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function exportHtml(x: SpecExport): string {
  const { spec: s, verification: v } = x;
  const banner = x.documentStatus === "DRAFT_CHECKS_FAILED" ? "bad" : x.documentStatus === "CHECKS_PASSED_REVIEW_OPEN" ? "warn" : "ok";
  const limits = [s.limits.cct ? `Colour temperature ${rangeLabel(s.limits.cct)}` : "", s.limits.criMin ? `CRI at least ${s.limits.criMin}` : "", s.limits.dimTo ? `Dimming to ${s.limits.dimTo}% or lower` : s.limits.dimmable ? "Dimming required" : "", s.limits.luxTarget ? `${s.limits.luxTarget} lux target` : ""].filter(Boolean);
  const findings = v.diagnostics.filter((d) => d.severity !== "PASS");
  const sev = { ERROR: "Error", NEEDS_REVIEW: "Needs review", WARNING: "Warning", PASS: "Pass" } as const;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Specification ${esc(s.client.label)} v${s.version}${x.documentStatus === "DRAFT_CHECKS_FAILED" ? " (DRAFT)" : ""}</title>
<style>
:root{--ink:#1a1714;--mute:#6b6258;--line:#d8cfc0;--paper:#fff;--bad:#a02c2c;--warn:#8a6100;--ok:#2b6a43}
*{box-sizing:border-box}body{font:14px/1.5 Georgia,'Times New Roman',serif;color:var(--ink);background:var(--paper);margin:0;padding:32px;max-width:900px;margin-inline:auto}
h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:14px;margin:0}
.meta,.mute{color:var(--mute);font:12px/1.5 system-ui,sans-serif}.banner{font:600 13px system-ui,sans-serif;padding:10px 12px;border:2px solid;border-radius:6px;margin:14px 0}
.banner.bad{color:var(--bad)}.banner.warn{color:var(--warn)}.banner.ok{color:var(--ok)}.synthetic{background:#fff3cd;border:2px solid #8a6100;padding:8px 12px;font:600 13px system-ui,sans-serif;margin:10px 0}
table{border-collapse:collapse;width:100%;font:12.5px/1.4 system-ui,sans-serif}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f1e8}
.line{border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:10px 0;break-inside:avoid}.req{font-size:15px;margin:4px 0}
.tag{font:600 11px system-ui,sans-serif;border:1px solid var(--line);border-radius:10px;padding:1px 7px;margin-right:4px}.ERROR{color:var(--bad)}.NEEDS_REVIEW,.WARNING{color:var(--warn)}.PASS{color:var(--ok)}
footer{margin-top:30px;font:11.5px/1.5 system-ui,sans-serif;color:var(--mute);border-top:1px solid var(--line);padding-top:10px}
@media print{body{padding:0;max-width:none}.noprint{display:none}h2{break-after:avoid}}
</style></head><body>
<p class="noprint mute"><button onclick="window.print()">Print or save as PDF</button></p>
<h1>Lighting specification: ${esc(s.client.label)}${s.project ? ` · ${esc(s.project)}` : ""}</h1>
<p class="meta">${esc(s.client.room.replace(/_/g, " "))} in ${esc(s.client.city)} · version ${s.version} (${esc(s.versionId)}) · compiled ${esc(s.compiledAt.slice(0, 10))} · rulebook ${esc(s.rulebookVersion)} · brief ${esc(s.briefId)}</p>
<div class="banner ${banner}" role="status">${esc(STATUS_TEXT[x.documentStatus])}</div>
${s.syntheticNotice ? `<div class="synthetic">${esc(s.syntheticNotice)}</div>` : ""}
<p class="meta">${esc(s.notCertified)}</p>

<h2>1. Client brief</h2>
<p>Words: ${s.brief.words.map((w) => `“${esc(w)}”`).join(", ") || "none"}.<br>References: ${s.brief.loves.map(esc).join("; ") || "none"}.</p>
${s.brief.sourceText ? `<p class="mute">Client's message: ${esc(s.brief.sourceText.slice(0, 600))}</p>` : ""}
<p><b>Requirements the client wrote down:</b> ${limits.length ? limits.map(esc).join("; ") : "none"}.</p>
<p class="mute">References used as evidence: ${s.brief.usedReferences.map(esc).join(", ") || "none"}.${s.brief.abstainedReferences.length ? ` Not used (not identified): ${s.brief.abstainedReferences.map(esc).join(", ")}.` : ""}</p>

<h2>2. Specification</h2>
${s.lines.map((l) => {
  const f = v.diagnostics.filter((d) => d.lineId === l.id && d.severity !== "PASS");
  return `<div class="line"><h3>${esc(l.category)} <span class="mute">· ${esc(l.id)} · ${esc(l.lineVersion.slice(0, 8))}</span></h3>
<p class="req">${esc(l.requirement)}</p>
<p><span class="tag">${esc(l.basis.replace(/_/g, " "))}</span><span class="tag">${esc(l.confidence)} confidence</span><span class="tag">review: ${esc(l.review)}</span>${l.hardConstraints.length ? `<span class="tag">constraints: ${l.hardConstraints.length}</span>` : ""}</p>
<p class="mute">${esc(l.uncertainty)}</p>
${l.hardConstraints.length ? `<p class="mute">Constraints: ${l.hardConstraints.map(esc).join("; ")}</p>` : ""}
<p class="mute">Rule ${esc(l.interpretationRule)} · evidence ${l.evidenceIds.length ? l.evidenceIds.map((e) => `#${e}`).join(" ") : "none"}${l.evidenceSummary.length ? ` (${l.evidenceSummary.map((e) => `${esc(e.atmosphere.replace(/_/g, " "))} x${e.lift.toFixed(1)}`).join(", ")})` : ""}</p>
<p class="mute">Literal reading of the client's words: ${esc(l.literalValue)}</p>
${l.assumptions.map((a) => `<p class="mute">Assumption: ${esc(a)}</p>`).join("")}
${f.map((d) => `<p class="${d.severity}"><b>${sev[d.severity]}:</b> ${esc(d.message)}${d.repair ? ` <i>Next: ${esc(d.repair)}</i>` : ""}</p>`).join("")}</div>`;
}).join("")}

<h2>3. Verification</h2>
<table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>
${v.dimensions.map((d) => `<tr><td>${esc(d.id)}. ${esc(d.name)}</td><td>${esc(d.status.replace(/_/g, " "))}</td><td>${esc(d.detail)}</td></tr>`).join("")}
</tbody></table>
<p class="mute">${v.counts.ERROR} error(s), ${v.counts.NEEDS_REVIEW} needing review, ${v.counts.WARNING} warning(s), ${v.counts.PASS} passed. ${esc(v.statement)}</p>
${findings.length ? `<table><thead><tr><th>Line</th><th>Severity</th><th>Finding</th></tr></thead><tbody>${findings.map((d) => `<tr><td>${esc(d.lineId)}</td><td class="${d.severity}">${sev[d.severity]}</td><td>${esc(d.message)}${d.repair ? `<br><i>${esc(d.repair)}</i>` : ""}</td></tr>`).join("")}</tbody></table>` : ""}

<h2>4. Assumptions, unknowns and open questions</h2>
<p><b>Unknown to this document:</b></p><ul>${s.unknowns.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
${s.openQuestions.length ? `<p><b>Open questions:</b></p><ul>${s.openQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : "<p>No open questions.</p>"}

<h2>5. Evidence</h2>
${s.evidenceRefs.length ? `<table><thead><tr><th>#</th><th>Record</th><th>Hash</th></tr></thead><tbody>${s.evidenceRefs.map((e) => `<tr><td>${e.seq}</td><td>${esc(e.summary)}</td><td>${esc(e.hash.slice(0, 16))}…</td></tr>`).join("")}</tbody></table>` : "<p>No Qloo evidence behind this specification: every line is the literal reading of the client's words.</p>"}
${s.ledgerHead ? `<p class="mute">Ledger head ${esc(s.ledgerHead.slice(0, 24))}…</p>` : ""}

<h2>6. Revision summary</h2>
${x.revision ? `<p>${x.revision.counts.revised} revised · ${x.revision.counts.unchanged} unchanged · ${x.revision.counts.needsReview} needing review. Written limits ${x.revision.limitsUnchanged ? "unchanged" : "changed"}.</p>
<table><thead><tr><th>Line</th><th>Change</th><th>Before</th><th>After</th><th>Why</th></tr></thead><tbody>${x.revision.lines.filter((l) => l.change !== "none").map((l) => `<tr><td>${esc(l.category)}</td><td>${esc(l.change.replace(/_/g, " "))}</td><td>${esc(l.before ?? "")}</td><td>${esc(l.after ?? "")}</td><td>${esc(l.reason)}</td></tr>`).join("")}</tbody></table>` : "<p>First version: no revisions.</p>"}
${x.sensitivity ? `<h2>7. Evidence sensitivity</h2><p>${esc(x.sensitivity.indexDefinition)} Index: ${x.sensitivity.stabilityIndex ?? "n/a"}.</p><ul>${x.sensitivity.lines.map((l) => `<li><b>${esc(l.category)}:</b> ${esc(l.stability.replace(/_/g, " "))}. ${esc(l.advice)}</li>`).join("")}</ul>` : ""}
${x.review && (x.review.entries.length || x.review.approval) ? `<h2>8. Review history</h2>
${x.review.approval ? `<p class="${x.review.approvalValid ? "PASS" : "WARNING"}"><b>${x.review.approvalValid ? "Approved by a human reviewer" : "Approval is for an earlier version"}</b> on ${esc(x.review.approval.at.slice(0, 10))} (version ${esc(x.review.approval.specVersionId)}).${x.review.approval.note ? ` Note: ${esc(x.review.approval.note)}` : ""} This records that a person reviewed this version. It is not a professional certification.</p>` : "<p>Not yet approved by a human reviewer.</p>"}
${x.review.entries.length ? `<table><thead><tr><th>When</th><th>Line</th><th>Action</th><th>State</th><th>Before</th><th>After</th><th>Checks then</th><th>Note</th></tr></thead><tbody>${x.review.entries.map((e) => `<tr><td>${esc(e.at.slice(0, 16).replace("T", " "))}</td><td>${esc(e.category)}</td><td>${esc(e.action.replace(/_/g, " "))}</td><td>${esc(e.from)} → ${esc(e.to)}</td><td>${esc(e.before)}</td><td>${esc(e.after ?? "")}</td><td>${esc(e.verification.replace(/_/g, " "))}${e.findings.length ? `<br>${e.findings.map(esc).join("; ")}` : ""}</td><td>${esc(e.note ?? "")}</td></tr>`).join("")}</tbody></table>` : ""}` : ""}
<footer>${esc(s.notCertified)} Generated ${esc(x.exportedAt)} by Tastespec.</footer>
</body></html>`;
}

export interface ReopenResult {
  ok: boolean;
  problems: string[];
  export?: SpecExport;
  /** Verification re-run on the reopened package alone (no brief), and whether it matches the stored outcome. */
  reverified?: Verification;
}

/**
 * Reopen a JSON export and check it as a stranger would: schema, that every line's
 * content hash still matches its content, that cited evidence is carried, and that
 * the verification still gives the same outcome. A package edited by hand fails.
 */
export async function reopenExport(text: string): Promise<ReopenResult> {
  const problems: string[] = [];
  let x: SpecExport;
  try {
    x = JSON.parse(text) as SpecExport;
  } catch {
    return { ok: false, problems: ["Not valid JSON."] };
  }
  if (x?.schema !== EXPORT_SCHEMA || x.spec?.schema !== SPEC_SCHEMA || !Array.isArray(x.spec.lines)) return { ok: false, problems: ["Not a Tastespec specification export."] };
  for (const l of x.spec.lines) {
    const { lineVersion, ...rest } = l;
    if ((await lineVersionOf(rest)) !== lineVersion) problems.push(`Line "${l.id}" was changed after it was compiled (its content hash no longer matches).`);
  }
  const reverified = await verifySpec(x.spec);
  if (reverified.documentStatus !== x.documentStatus && !(x.documentStatus === "CHECKS_PASSED_REVIEW_OPEN" && reverified.documentStatus === "CHECKS_PASSED_REVIEW_OPEN")) problems.push(`The stored status ${x.documentStatus} does not match a fresh verification (${reverified.documentStatus}).`);
  if (x.documentStatus !== "DRAFT_CHECKS_FAILED" && reverified.counts.ERROR > 0) problems.push("The package claims passing checks but fresh verification finds errors.");
  return { ok: problems.length === 0, problems, export: x, reverified };
}
