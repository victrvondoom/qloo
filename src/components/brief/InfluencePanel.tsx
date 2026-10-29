"use client";

import { useState } from "react";
import { postBrief } from "./api";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import type { Brief, DimensionId } from "@/lib/types";

/** Which loves moved which lines: a reference × line matrix measured by leaving each reference out. */
export function InfluencePanel({ brief, canEdit, onBrief }: { brief: Brief; canEdit: boolean; onBrief: (b: Brief) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const inf = brief.influence;
  const used = brief.resolutions.filter((r) => r.usedAsSignal).length;
  const personal = brief.status === "COMPLETE" || brief.status === "NEEDS_CLARIFICATION";
  if (!personal || used < 2) return null;

  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      onBrief((await postBrief(`/api/briefs/${brief.id}/influence`, {})).brief);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fragile = inf?.lines.filter((l) => !l.robust) ?? [];
  const nameOf = (id: string) => inf?.references.find((r) => r.entity_id === id)?.name ?? id;
  return (
    <section className="card">
      <div className="panel-title">
        <div>
          <div className="eyebrow amber">Influence · measured, not guessed</div>
          <h3 style={{ margin: 0 }}>Which of {brief.input.clientLabel}&apos;s loves moved which line</h3>
        </div>
        {canEdit ? (
          <button type="button" className="btn sm" onClick={run} disabled={busy}>
            {busy ? "Asking Qloo without each one…" : inf ? "Measure again" : `Measure influence (${used} Qloo queries)`}
          </button>
        ) : null}
      </div>
      <p className="small muted">
        For each reference, Tastespec asks Qloo for the taste-matched places again with that one left out (same city baseline, same answer) and rebuilds the spec. A filled dot means
        the line changes without it.
      </p>
      {err ? <div className="err">{err}</div> : null}
      {inf ? (
        <>
          <p style={{ marginBottom: 12 }}>
            <b className="serif" style={{ fontSize: 22 }}>
              {inf.robustLines} of {inf.lines.length}
            </b>{" "}
            lines survive dropping any one reference.
            {fragile.length
              ? ` ${fragile
                  .slice(0, 2)
                  .map((l) => `${l.category} changes without ${l.deciders.map(nameOf).join(" or ")}`)
                  .join("; ")}.`
              : " Nothing hangs on a single thing they mentioned."}
          </p>
          <div className="scroll-x">
            <table className="table influence">
              <thead>
                <tr>
                  <th>Without…</th>
                  {inf.lines.map((l) => (
                    <th key={l.lineId} title={l.value} style={{ textAlign: "center" }}>
                      {l.category}
                    </th>
                  ))}
                  <th>Pushes toward</th>
                </tr>
              </thead>
              <tbody>
                {inf.references.map((r) => {
                  const pushes = (Object.entries(r.push) as [DimensionId, number][]).filter(([, v]) => v > 0.1).sort((a, b) => b[1] - a[1]).slice(0, 2);
                  return (
                    <tr key={r.entity_id}>
                      <td>
                        <b className="small">{r.name}</b>
                        {!r.usable ? <div className="tiny muted">too few places without it</div> : null}
                      </td>
                      {inf.lines.map((l) => {
                        const d = r.decides.find((x) => x.lineId === l.lineId);
                        return (
                          <td key={l.lineId} style={{ textAlign: "center" }}>
                            <span
                              className={`inf-dot${d ? " on" : ""}`}
                              role="img"
                              aria-label={d ? `Without ${r.name}, ${l.category} becomes: ${d.without}` : `${l.category} holds without ${r.name}`}
                              title={d ? `Without ${r.name}: ${d.without}` : "holds"}
                            />
                          </td>
                        );
                      })}
                      <td className="small">{pushes.length ? pushes.map(([k]) => DIMENSION_BY_ID[k].short).join(", ") : <span className="muted">nothing distinct</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>
            {inf.evidence.length} ledger entries · {new Date(inf.computedAt).toLocaleString()} · a fragile line is a good thing to confirm with the client.
          </p>
        </>
      ) : !canEdit ? (
        <p className="small muted" style={{ margin: 0 }}>Not measured yet.</p>
      ) : null}
    </section>
  );
}
