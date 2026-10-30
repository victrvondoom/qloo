"use client";

import { useEffect, useState } from "react";
import { postBrief } from "./api";
import type { ClarificationReport } from "@/lib/clarify";
import type { Brief } from "@/lib/types";

/** Why the agent asked what it asked: the lines each answer would change, and the contrasts it held back. Answer, or defer. */
export function ClarifyPanel({ brief, onBrief }: { brief: Brief; onBrief: (b: Brief) => void }) {
  const [r, setR] = useState<ClarificationReport>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [deferred, setDeferred] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/briefs/${brief.id}/clarify`)
      .then((x) => x.json().then((j) => (x.ok ? j : Promise.reject(new Error(j.error ?? "Request failed")))))
      .then((j) => live && setR(j))
      .catch((e) => live && setErr((e as Error).message));
    return () => {
      live = false;
    };
  }, [brief.id, brief.question?.answer]);
  const answer = async (a: "A" | "B" | "neither") => {
    setBusy(true);
    setErr(undefined);
    try {
      onBrief((await postBrief(`/api/briefs/${brief.id}/answer`, { answer: a })).brief);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (err && !r) return null;
  if (!r) return <div className="skeleton" style={{ height: 80 }} />;
  const q = r.asked;
  const effect = (label: string, list: { lineId: string; category: string; from: string; to: string }[]) => (
    <div className="card sunk" key={label}>
      <b>{label}</b>
      {list.length ? <ul className="small">{list.map((e) => <li key={e.lineId}><b>{e.category}</b>: {e.from.slice(0, 60)} → {e.to.slice(0, 60)}</li>)}</ul> : <p className="small muted">No line changes.</p>}
    </div>
  );
  return (
    <section className="card" aria-labelledby="clar-h">
      <div className="eyebrow">Clarification, only when it matters</div>
      <h2 id="clar-h" style={{ margin: "0 0 6px" }}>{q ? "One question would settle something" : "No question is worth asking"}</h2>
      {q ? (
        <>
          <p className="small">{q.whyItMatters}</p>
          <div className="grid2">
            {effect(`If they lean ${q.contrast[0]}`, q.ifA)}
            {effect(`If they lean ${q.contrast[1]}`, q.ifB)}
          </div>
          {q.answered ? <p className="small" role="status">Answered ({q.answered}).</p> : deferred ? (
            <p className="small" role="status">Deferred. The specification stays with the evidence alone; nothing is blocked.</p>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn primary" disabled={busy} onClick={() => answer("A")}>They lean {q.contrast[0]}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => answer("B")}>They lean {q.contrast[1]}</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setDeferred(true)}>Defer</button>
            </div>
          )}
        </>
      ) : <p className="small">The evidence already decides every line that a single answer could change, so asking would be noise.</p>}
      {err ? <div className="err" role="alert">{err}</div> : null}
      <details style={{ marginTop: 8 }}>
        <summary className="small muted">Every contrast the agent considered ({r.candidates.length})</summary>
        <ul className="small">{r.candidates.map((c) => <li key={c.contrast.join("|")}><b>{c.contrast[0]} vs {c.contrast[1]}</b>: {c.reason} <span className="muted">(expected change {c.expectedChange}, {c.entropyBits} bits)</span></li>)}</ul>
        <p className="tiny muted">{r.metric}</p>
      </details>
    </section>
  );
}
