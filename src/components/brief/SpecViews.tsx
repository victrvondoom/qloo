"use client";

import type { SpecDiff } from "@/lib/spec-diff";
import type { SensitivityReport } from "@/lib/sensitivity";
import type { Verification } from "@/lib/verify-spec";
import { STATUS_TEXT } from "@/lib/spec-export";

const DIM_CLASS: Record<string, string> = { PASS: "high", FAIL: "bad", NEEDS_REVIEW: "medium", INSUFFICIENT_EVIDENCE: "low", NOT_APPLICABLE: "plain" };
const SEV_LABEL = { ERROR: "Error", NEEDS_REVIEW: "Needs review", WARNING: "Warning", PASS: "Pass" } as const;

export function StatusBanner({ v }: { v: Verification }) {
  const cls = v.documentStatus === "DRAFT_CHECKS_FAILED" ? "bad" : v.documentStatus === "CHECKS_PASSED_REVIEW_OPEN" ? "medium" : "high";
  return (
    <div className={`pill ${cls}`} role="status" style={{ display: "inline-block", whiteSpace: "normal" }}>
      {STATUS_TEXT[v.documentStatus]}
    </div>
  );
}

/** The seven checks, then every finding that is not a pass, each pointing at its line. */
export function VerificationView({ v, lineNames }: { v: Verification; lineNames: Record<string, string> }) {
  const findings = v.diagnostics.filter((d) => d.severity !== "PASS");
  return (
    <div>
      <div className="row tight" aria-label="Verification checks">
        {v.dimensions.map((d) => (
          <span key={d.id} className={`pill ${DIM_CLASS[d.status]}`} title={d.detail}>
            {d.id} · {d.name}: {d.status.replace(/_/g, " ").toLowerCase()}
          </span>
        ))}
      </div>
      <p className="small muted" style={{ margin: "8px 0" }}>
        {v.counts.ERROR} error(s) · {v.counts.NEEDS_REVIEW} needing review · {v.counts.WARNING} warning(s) · {v.counts.PASS} checks passed. {v.statement}
      </p>
      {findings.length ? (
        <div className="scroll-x">
          <table className="table" aria-label="Verification findings">
            <thead>
              <tr><th>Line</th><th>Result</th><th>Finding and next step</th></tr>
            </thead>
            <tbody>
              {findings.map((d, i) => (
                <tr key={i} className={d.severity === "ERROR" ? "changed" : undefined}>
                  <td className="small"><b>{d.lineId === "*" ? "Whole specification" : lineNames[d.lineId] ?? d.lineId}</b></td>
                  <td className="small">{SEV_LABEL[d.severity]}</td>
                  <td className="small">{d.message}{d.repair ? <div className="muted">Next: {d.repair}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="small">No findings.</p>}
    </div>
  );
}

const DISPLAY_LABEL = { UNCHANGED: "Unchanged", REVISED: "Revised", NEEDS_REVIEW: "Needs review" } as const;

/** Original and revised side by side, with why each line changed or didn't. */
export function DiffView({ diff, fromLabel = "Original", toLabel = "Revised" }: { diff: SpecDiff; fromLabel?: string; toLabel?: string }) {
  const i = diff.input;
  const changed: string[] = [
    ...i.loves.replaced.map((r) => `Reference “${r.from}” → “${r.to}”`),
    ...i.loves.added.map((x) => `Added reference “${x}”`),
    ...i.loves.removed.map((x) => `Removed reference “${x}”`),
    ...i.words.added.map((w) => `Added word “${w}”`),
    ...i.words.removed.map((w) => `Removed word “${w}”`),
    ...i.limits.map((l) => `${l.field}: ${l.from} → ${l.to}`),
    ...i.pinned.map((p) => `Pinned “${p.input}” to a specific entity`),
    ...(i.status ? [`Run status: ${i.status.from} → ${i.status.to}`] : []),
  ];
  return (
    <div>
      <p className="small" style={{ margin: "0 0 6px" }}>
        <b>What changed in the input:</b> {changed.length ? changed.join("; ") : "nothing"}.{" "}
        Written limits {diff.limitsUnchanged ? <b>unchanged</b> : <b>changed</b>}.
      </p>
      <p className="small" aria-live="polite" style={{ margin: "0 0 8px" }}>
        {diff.counts.revised} revised · {diff.counts.unchanged} unchanged · {diff.counts.needsReview} need review
        {diff.counts.explanationOnly ? ` · ${diff.counts.explanationOnly} reworded only` : ""}{diff.counts.evidenceOnly ? ` · ${diff.counts.evidenceOnly} on different evidence` : ""}.
      </p>
      <div className="scroll-x">
        <table className="table" aria-label="Before and after">
          <thead>
            <tr><th>Line</th><th>Status</th><th>{fromLabel}</th><th>{toLabel}</th><th>Why</th></tr>
          </thead>
          <tbody>
            {diff.lines.map((l) => (
              <tr key={l.id} className={l.display !== "UNCHANGED" ? "changed" : undefined}>
                <td className="small"><b>{l.category}</b></td>
                <td className="small">{DISPLAY_LABEL[l.display]}</td>
                <td className="small">{l.before ?? "–"}</td>
                <td className="small">{l.change === "none" || l.change === "explanation_only" ? <span className="muted">same</span> : l.after ?? "–"}</td>
                <td className="small">{l.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {diff.reverify.length ? (
        <ul className="small" aria-label="To re-check">
          {diff.reverify.map((r) => <li key={r}>{r}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

const STAB_LABEL = { robust: "Robust", single_source: "Hangs on one reference", multi_source: "Sensitive", unverifiable: "Can't test" } as const;

export function SensitivityView({ s }: { s: SensitivityReport }) {
  return (
    <div>
      <p className="small" style={{ margin: "0 0 6px" }}>
        {s.stabilityIndex === null ? "Not enough places came back to test." : <>Stability index <b>{Math.round(s.stabilityIndex * 100)}%</b> of reference × line pairs unchanged when a reference is removed.</>}{" "}
        Written limits held in every recomputation: <b>{s.hardLimitViolations === 0 ? "yes" : `no (${s.hardLimitViolations} violation(s))`}</b>.
      </p>
      <div className="scroll-x">
        <table className="table" aria-label="Which lines depend on which reference">
          <thead><tr><th>Line</th><th>Verdict</th><th>Depends on</th><th>What to do</th></tr></thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.lineId} className={l.stability === "robust" ? undefined : "changed"}>
                <td className="small"><b>{l.category}</b></td>
                <td className="small">{STAB_LABEL[l.stability]}</td>
                <td className="small">{l.deciders.join(", ") || "–"}</td>
                <td className="small">{l.advice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="scroll-x">
        <table className="table" aria-label="Effect of removing each reference">
          <thead><tr><th>Remove this reference</th><th>Lines that change</th><th>Places returned without it</th></tr></thead>
          <tbody>
            {s.references.map((r) => (
              <tr key={r.entity_id}>
                <td className="small"><b>{r.name}</b></td>
                <td className="small">{r.usable ? (r.changed.length ? r.changed.map((c) => `${c.category} → ${c.without}`).join("; ") : "none") : "not enough places to test"}</td>
                <td className="small">{r.placesWithout} ({r.coverageChange >= 0 ? "+" : ""}{r.coverageChange})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">{s.indexDefinition}</p>
    </div>
  );
}
