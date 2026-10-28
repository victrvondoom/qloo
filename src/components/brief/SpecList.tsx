"use client";

import { useState } from "react";
import { BasisPill } from "../Badges";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import type { Brief, SpecLine } from "@/lib/types";

const REACTION: Record<string, string> = { love: "♥ loves it", unsure: "? unsure", change: "✎ wants a change" };

function Line({ line, brief, changed, canEdit, busy, decide }: { line: SpecLine; brief: Brief; changed: boolean; canEdit: boolean; busy: boolean; decide: (lineId: string, status: "accepted" | "revised" | "proposed", revisedTo?: string) => void }) {
  const [revising, setRevising] = useState(false);
  const [text, setText] = useState(line.revisedTo ?? "");
  const same = line.value === line.literalValue;
  const fb = brief.clientFeedback?.[line.id];
  return (
    <div className={`spec-line${changed ? " changed" : ""}`} id={`line-${line.id}`}>
      <div>
        <div className="cat">{line.category}</div>
        <div className="row tight" style={{ marginTop: 6 }}>
          <BasisPill basis={line.basis} />
          <span className={`pill ${line.confidence}`} title="How firmly the evidence pins this line down. No evidence is always low.">
            {line.confidence}
          </span>
        </div>
      </div>
      <div>
        <div className="val">
          {line.status === "revised" && line.revisedTo ? (
            <>
              <span className="strike">{line.value}</span>
              <div>{line.revisedTo}</div>
            </>
          ) : (
            line.value
          )}
        </div>
        <div className="why">{line.why}</div>
        <div className="lit">
          <b>Taken literally</b>
          {same ? "the same." : line.literalValue}
        </div>
        {fb ? (
          <div className="callout" style={{ marginTop: 10 }}>
            <b>{brief.input.clientLabel}</b> {REACTION[fb.reaction]}
            {fb.note ? `: “${fb.note}”` : ""}
            {fb.value !== line.value ? <span className="muted small"> (on an earlier version of this line)</span> : null}
          </div>
        ) : null}
        <details style={{ marginTop: 8 }}>
          <summary className="small muted">
            Why this value{line.evidenceLedger.length ? ` · ${line.evidenceLedger.length} Qloo requests` : ""}
            {line.constraints.length ? ` · ${line.constraints.length} constraint${line.constraints.length > 1 ? "s" : ""}` : ""}
          </summary>
          <div className="small" style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {line.evidence.length ? (
              line.evidence.map((e) => (
                <div key={e.dimension}>
                  <b>{DIMENSION_BY_ID[e.dimension].label}</b>: {e.crowdHits} of {e.crowdN} taste-matched places vs {e.baseHits} of {e.baseN} typical {brief.input.city} places (×{e.lift.toFixed(1)}, P(higher) {Math.round(e.pGreater * 100)}%)
                  {e.exemplars.length ? <span className="muted">, e.g. {e.exemplars.slice(0, 3).join(", ")}</span> : null}.
                </div>
              ))
            ) : (
              <div className="muted">No Qloo evidence: this line comes from the client&apos;s words or a rule.</div>
            )}
            {line.constraints.map((c) => (
              <div key={c} className="muted">
                Constraint: {c}
              </div>
            ))}
            {line.evidenceLedger.length ? <div className="muted mono">ledger {line.evidenceLedger.map((s) => `#${s}`).join(" ")}</div> : null}
            {line.history.length ? <div className="muted">History: {line.history.map((h) => `${h.status}${h.status === "revised" ? ` → ${h.value}` : ""} (${new Date(h.at).toLocaleDateString()})`).join(" · ")}</div> : null}
          </div>
        </details>
      </div>
      <div className="acts">
        {line.status === "accepted" ? <span className="pill good">✓ accepted</span> : line.status === "revised" ? <span className="pill warn">revised</span> : <span className="pill plain">proposed</span>}
        {canEdit ? (
          revising ? (
            <div style={{ width: "100%" }}>
              <input type="text" value={text} placeholder="What do they want instead?" onChange={(e) => setText(e.target.value)} aria-label={`Revise ${line.category}`} />
              <div className="row tight" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn sm primary"
                  disabled={busy || !text.trim()}
                  onClick={() => {
                    setRevising(false);
                    decide(line.id, "revised", text);
                  }}
                >
                  Save
                </button>
                <button type="button" className="btn sm ghost" onClick={() => setRevising(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="row tight">
              {line.status !== "accepted" ? (
                <button type="button" className="btn sm" disabled={busy} onClick={() => decide(line.id, "accepted")}>
                  Accept
                </button>
              ) : (
                <button type="button" className="btn sm ghost" disabled={busy} onClick={() => decide(line.id, "proposed")}>
                  Undo
                </button>
              )}
              <button type="button" className="btn sm ghost" disabled={busy} onClick={() => setRevising(true)}>
                Revise
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

export function SpecList({ brief, changedIds, canEdit, busy, decide }: { brief: Brief; changedIds: string[]; canEdit: boolean; busy: boolean; decide: (lineId: string, status: "accepted" | "revised" | "proposed", revisedTo?: string) => void }) {
  const diffs = brief.spec.filter((l) => l.value !== l.literalValue).length;
  return (
    <div>
      <div className="panel-title">
        <div>
          <div className="eyebrow">The spec · rulebook {brief.rulebookVersion}</div>
          <h2 style={{ margin: 0 }}>What to build</h2>
        </div>
        <span className="small muted">
          {diffs} of {brief.spec.length} lines differ from a literal reading of “{brief.input.words.join(", ")}”.
        </span>
      </div>
      <div className="spec-list">
        {brief.spec.map((l) => (
          <Line key={l.id} line={l} brief={brief} changed={changedIds.includes(l.id)} canEdit={canEdit} busy={busy} decide={decide} />
        ))}
      </div>
    </div>
  );
}
