"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { postBrief } from "./api";
import { ClarifyPanel } from "./ClarifyPanel";
import { LineChallenge } from "./LineChallenge";
import { DiffView, SensitivityView, StatusBanner, VerificationView } from "./SpecViews";
import type { CompiledSpec } from "@/lib/compiler";
import type { SensitivityReport } from "@/lib/sensitivity";
import type { SpecDiff } from "@/lib/spec-diff";
import type { RevisionRow } from "@/lib/store";
import type { Verification } from "@/lib/verify-spec";
import type { Brief, ReviewEntry, ReviewState } from "@/lib/types";

interface Report {
  spec: CompiledSpec;
  verification: Verification;
  revision?: { row: RevisionRow; diff: SpecDiff };
  sensitivity?: SensitivityReport;
  review: { states: Record<string, ReviewState>; entries: ReviewEntry[]; approval?: { at: string; specVersionId: string; note?: string }; approvalValid: boolean; locked: boolean };
  canEdit: boolean;
}
interface Proposal {
  revision: RevisionRow;
  diff: SpecDiff;
  verification: Verification;
  briefId: string;
}

type Kind = "love" | "sentence" | "cct" | "evidence";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

/**
 * The compiled specification: verify it, challenge it with a change, compare, accept or return to the
 * previous version, stress it by removing one reference, and export it. Every button calls the real service.
 */
export function SpecificationPanel({ brief, canEdit, onBrief }: { brief: Brief; canEdit: boolean; onBrief: (b: Brief) => void }) {
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const [kind, setKind] = useState<Kind>("sentence");
  const [love, setLove] = useState(brief.input.loves[0] ?? "");
  const [replacement, setReplacement] = useState("");
  const [sentence, setSentence] = useState("Actually, keep the light between 2700K and 3000K.");
  const [proposal, setProposal] = useState<Proposal>();
  const [history, setHistory] = useState<{ currentBriefId: string; revisions: RevisionRow[] }>();
  const [decided, setDecided] = useState<string>();

  const load = useCallback(async () => {
    setErr(undefined);
    try {
      setReport(await getJson<Report>(`/api/briefs/${brief.id}/spec`));
      if (canEdit) setHistory(await getJson<{ currentBriefId: string; revisions: RevisionRow[] }>(`/api/briefs/${brief.id}/revisions`).catch(() => undefined));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [brief.id, canEdit]);

  useEffect(() => {
    let live = true;
    getJson<Report>(`/api/briefs/${brief.id}/spec`)
      .then((r) => live && setReport(r))
      .catch((e) => live && setErr((e as Error).message));
    if (canEdit) getJson<{ currentBriefId: string; revisions: RevisionRow[] }>(`/api/briefs/${brief.id}/revisions`).then((h) => live && setHistory(h)).catch(() => {});
    return () => {
      live = false;
    };
  }, [brief.id, canEdit, brief.influence?.computedAt]);

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setErr(undefined);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const verify = () => act("verify", load);
  const names = Object.fromEntries((report?.spec.lines ?? []).map((l) => [l.id, l.category]));

  const changes = () => {
    if (kind === "love") return { replaceLove: { from: love, to: replacement.trim() } };
    if (kind === "cct") return { cctRange: { min: 2700, max: 3000 } };
    if (kind === "evidence") return { removeEvidence: true };
    return { sentence };
  };
  const revise = () =>
    act("revise", async () => {
      setDecided(undefined);
      setProposal(await getJson<Proposal>(`/api/briefs/${brief.id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: changes() }) }));
    });
  const decide = (action: "accept" | "reject" | "revert", id: string) =>
    act(action, async () => {
      const r = await getJson<{ revision: RevisionRow; currentBriefId: string }>(`/api/revisions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      setDecided(action === "accept" ? `Accepted. The current version is the revised brief.` : action === "reject" ? "Rejected. The current version is unchanged." : "Returned to the previous version.");
      setHistory(await getJson<{ currentBriefId: string; revisions: RevisionRow[] }>(`/api/briefs/${brief.id}/revisions`).catch(() => undefined));
      if (action !== "accept") setProposal(undefined);
      void r;
    });
  const [note, setNote] = useState("");
  const approve = () =>
    act("approve", async () => {
      onBrief((await postBrief(`/api/briefs/${brief.id}/review`, { approve: true, note })).brief);
    });
  const changed = (b?: Brief) => {
    if (b) onBrief(b);
    void load();
  };
  const sensitivity = () =>
    act("sensitivity", async () => {
      onBrief((await postBrief(`/api/briefs/${brief.id}/influence`, {})).brief);
    });

  if (!report) return err ? <div className="err" role="alert">{err}</div> : <div className="skeleton" style={{ height: 160 }} />;
  const { spec, verification: v } = report;
  const base = `/api/briefs/${brief.id}/spec`;
  const personal = brief.status === "COMPLETE" || brief.status === "NEEDS_CLARIFICATION";
  const used = brief.resolutions.filter((r) => r.usedAsSignal).length;

  return (
    <div className="stack">
      <section className="card">
        <div className="panel-title">
          <div>
            <div className="eyebrow">Compiled specification · version {spec.version} · {spec.versionId.slice(0, 10)}</div>
            <h2 style={{ margin: 0 }}>{spec.client.label}’s specification, checked</h2>
          </div>
          <div className="row tight">
            {spec.dataMode === "fixture" ? <span className="pill low" title={spec.syntheticNotice}>FIXTURE · synthetic</span> : <span className="pill high">LIVE · Qloo</span>}
            <StatusBanner v={v} />
          </div>
        </div>
        <p className="small muted">
          Each line is a value with its unit, the limits that bound it, what the client said, the Qloo requests behind it, the rule that produced it, and what is assumed or unknown. {spec.notCertified}
        </p>
        <div className="row">
          <button type="button" className="btn primary" onClick={verify} disabled={busy === "verify"}>
            {busy === "verify" ? "Verifying…" : "Verify specification"}
          </button>
          <a className="btn" href={`${base}?format=html`} target="_blank" rel="noreferrer">Open printable document</a>
          <a className="btn" href={`${base}?format=html&download=1`}>Download HTML</a>
          <a className="btn" href={`${base}?format=json&download=1`}>Download JSON</a>
          <a className="btn" href={`${base}?format=csv&download=1`}>Download CSV</a>
        </div>
        <p className="tiny muted" style={{ margin: "6px 0 0" }}>For PDF, open the printable document and use the browser’s Print → Save as PDF.</p>
        {err ? <div className="err" role="alert">{err}</div> : null}
        <div style={{ marginTop: 12 }}>
          <VerificationView v={v} lineNames={names} />
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Lines</div>
        <div className="scroll-x">
          <table className="table" aria-label="Specification lines">
            <thead><tr><th>Line</th><th>Requirement</th><th>Value</th><th>Source</th><th>Evidence</th><th>Review</th></tr></thead>
            <tbody>
              {spec.lines.map((l) => (
                <tr key={l.id}>
                  <td className="small"><b>{l.category}</b><div className="tiny muted mono">{l.lineVersion.slice(0, 8)}</div></td>
                  <td className="small">{l.requirement}{l.hardConstraints.length ? <div className="tiny muted">{l.hardConstraints.join("; ")}</div> : null}</td>
                  <td className="small mono">{l.machine.kind === "text" ? "–" : l.machine.kind === "cct" ? `${l.machine.min === l.machine.max ? l.machine.min : `${l.machine.min}–${l.machine.max}`} K` : l.machine.kind === "cri" ? `Ra ≥ ${l.machine.min}` : l.machine.kind === "dimming" ? (l.machine.floor ? `≤ ${l.machine.floor} %` : "–") : l.machine.target ? `${l.machine.target} lx` : "–"}</td>
                  <td className="small">{l.basis.replace(/_/g, " ")} · {l.confidence}</td>
                  <td className="small mono">{l.evidenceIds.length ? l.evidenceIds.map((e) => `#${e}`).join(" ") : "–"}</td>
                  <td className="small">{report.review.states[l.id]?.replace(/_/g, " ").toLowerCase()}{l.override ? " · overridden" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary className="small muted">What this document does not know</summary>
          <ul className="small">{spec.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
        </details>
      </section>

      {canEdit && personal ? <ClarifyPanel brief={brief} onBrief={onBrief} /> : null}

      {canEdit ? <LineChallenge brief={brief} spec={spec} states={report.review.states} locked={report.review.locked} onChanged={changed} /> : null}

      {canEdit ? (
        <section className="card" aria-labelledby="approve-h">
          <div className="eyebrow">Approve</div>
          <h2 id="approve-h" style={{ margin: "0 0 6px" }}>Final review by a person</h2>
          {report.review.approval ? (
            <p className="small" role="status">
              <b>{report.review.approvalValid ? "Approved" : "Approved an earlier version"}</b> by a human reviewer on {new Date(report.review.approval.at).toLocaleString()} (version {report.review.approval.specVersionId.slice(0, 10)}). This version is locked; a change is a revision. This records that a person reviewed it. It is not a professional certification.
            </p>
          ) : (
            <>
              <p className="small muted">Every line must be approved and verification must have no errors. Approval means a human reviewed this exact version; it is not a certification, and it locks the version.</p>
              <p className="small">{Object.values(report.review.states).filter((s) => s === "APPROVED").length} of {spec.lines.length} lines approved.</p>
              <label className="field"><span>Approval note (optional)</span><input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
              <button type="button" className="btn primary" onClick={approve} disabled={busy === "approve"}>Approve this specification</button>
            </>
          )}
          {report.review.entries.length ? (
            <details style={{ marginTop: 8 }}>
              <summary className="small muted">Review history ({report.review.entries.length})</summary>
              <ol className="small">{report.review.entries.map((e) => <li key={e.seq}>{new Date(e.at).toLocaleString()} · {e.category}: {e.action.replace(/_/g, " ")} ({e.from} → {e.to}){e.note ? ` · ${e.note}` : ""}</li>)}</ol>
            </details>
          ) : null}
        </section>
      ) : null}

      {canEdit && !report.review.locked ? (
        <section className="card" aria-labelledby="revise-h">
          <div className="eyebrow">Challenge it</div>
          <h2 id="revise-h" style={{ margin: "0 0 6px" }}>What if the client changes their mind?</h2>
          <p className="small muted">Change one thing. The real agent runs again on the modified brief, and you see exactly which lines changed, which stayed, and why. Nothing replaces the current version until you accept it.</p>
          <div className="row tight" role="group" aria-label="What to change">
            {([["sentence", "A client sentence"], ["love", "Swap a reference"], ["cct", "Set light to 2700–3000K"], ["evidence", "Remove all Qloo evidence"]] as [Kind, string][]).map(([k, label]) => (
              <button key={k} type="button" className="btn sm" aria-pressed={kind === k} onClick={() => setKind(k)} style={kind === k ? { background: "var(--ink)", color: "var(--paper, #fff)" } : undefined}>
                {label}
              </button>
            ))}
          </div>
          {kind === "sentence" ? (
            <label className="field"><span>The client now writes</span><input type="text" value={sentence} maxLength={300} onChange={(e) => setSentence(e.target.value)} /></label>
          ) : kind === "love" ? (
            <div className="row tight" style={{ marginTop: 8 }}>
              <select aria-label="Reference to replace" value={love} onChange={(e) => setLove(e.target.value)}>{brief.input.loves.map((l) => <option key={l}>{l}</option>)}</select>
              <span>→</span>
              <input aria-label="Replacement reference" type="text" value={replacement} placeholder="Another thing they love" onChange={(e) => setReplacement(e.target.value)} />
            </div>
          ) : kind === "cct" ? (
            <p className="small">Written limit: colour temperature between 2700K and 3000K. Every reference stays as it is.</p>
          ) : (
            <p className="small">Runs the same brief as if Qloo returned nothing: lines fall back to the literal reading, and the written limits must still hold.</p>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn primary" onClick={revise} disabled={busy === "revise" || (kind === "love" && !replacement.trim())}>
              {busy === "revise" ? "Running the agent…" : "Recompute with this change"}
            </button>
          </div>

          {proposal ? (
            <div style={{ marginTop: 14 }} aria-label="Proposed revision">
              <h3 style={{ margin: "0 0 6px" }}>Proposed revision</h3>
              <DiffView diff={proposal.diff} />
              <div style={{ marginTop: 8 }}>
                <b className="small">Verification of the revised specification:</b>
                <div style={{ marginTop: 6 }}><StatusBanner v={proposal.verification} /></div>
                {proposal.verification.counts.ERROR ? <p className="small err" role="alert">The revision has errors. Reject it, or fix and rerun.</p> : null}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                {proposal.revision.status === "proposed" && !decided ? (
                  <>
                    <button type="button" className="btn primary" onClick={() => decide("accept", proposal.revision.id)} disabled={Boolean(busy)}>Accept revision</button>
                    <button type="button" className="btn" onClick={() => decide("reject", proposal.revision.id)} disabled={Boolean(busy)}>Reject revision</button>
                  </>
                ) : null}
                {decided?.startsWith("Accepted") ? <button type="button" className="btn" onClick={() => decide("revert", proposal.revision.id)} disabled={Boolean(busy)}>Return to previous version</button> : null}
                <Link className="btn" href={`/brief/${proposal.briefId}`}>Open revised brief</Link>
                <a className="btn" href={`/api/briefs/${proposal.briefId}/spec?format=html`} target="_blank" rel="noreferrer">Export revised specification</a>
              </div>
              {decided ? <p role="status" className="small">{decided}</p> : null}
            </div>
          ) : null}

          {history?.revisions.length ? (
            <div style={{ marginTop: 14 }}>
              <div className="eyebrow">Revision history</div>
              <ol className="small" aria-label="Revision history">
                {history.revisions.map((r) => (
                  <li key={r.id}>
                    {new Date(r.createdAt).toLocaleString()} · <b>{r.status}</b> · {Object.keys(r.changes).join(", ")}{" "}
                    <Link href={`/brief/${r.toBriefId}`}>open</Link>{r.toBriefId === history.currentBriefId ? " · current" : ""}
                  </li>
                ))}
              </ol>
              <p className="tiny muted">Current version: <Link href={`/brief/${history.currentBriefId}`}>{history.currentBriefId === brief.id ? "this brief" : "revised brief"}</Link>.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card" aria-labelledby="sens-h">
        <div className="eyebrow">Stress it</div>
        <h2 id="sens-h" style={{ margin: "0 0 6px" }}>Does it hang on one reference?</h2>
        <p className="small muted">Qloo is asked again without each reference in turn, and the specification is rebuilt under the same written limits. A line that changes when one reference goes depends on it.</p>
        {canEdit && personal && used >= 2 ? (
          <button type="button" className="btn primary" onClick={sensitivity} disabled={busy === "sensitivity"}>
            {busy === "sensitivity" ? "Asking Qloo without each reference…" : report.sensitivity ? "Run again" : `Remove one reference at a time (${used} Qloo queries)`}
          </button>
        ) : <p className="small muted">Needs a brief with at least two identified references{canEdit ? "" : " and the designer’s account"}.</p>}
        {report.sensitivity ? <div style={{ marginTop: 10 }}><SensitivityView s={report.sensitivity} /></div> : null}
      </section>
    </div>
  );
}
