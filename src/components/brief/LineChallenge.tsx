"use client";

import { useState } from "react";
import type { ChallengeAnswer, RepairAnswer, WhyAnswer, WhyNotAnswer, ProveAnswer, Consequences } from "@/lib/challenge";
import type { CompiledSpec } from "@/lib/compiler";
import type { Brief, ReviewAction, ReviewState } from "@/lib/types";

interface Props {
  brief: Brief;
  spec: CompiledSpec;
  states: Record<string, ReviewState>;
  locked: boolean;
  onChanged: (b?: Brief) => void;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; answer?: unknown };
  if (!res.ok) {
    const e = new Error(j.error ?? `Request failed (${res.status})`) as Error & { answer?: unknown };
    e.answer = j.answer;
    throw e;
  }
  return j;
}

const STATE_LABEL: Record<ReviewState, string> = { DRAFT: "Draft", NEEDS_REVIEW: "Needs review", APPROVED: "Approved", REVISION_REQUESTED: "Revision requested", REJECTED: "Rejected" };
const NEXT: Record<ReviewState, ReviewAction[]> = {
  DRAFT: ["accept", "request_clarification", "reject"],
  NEEDS_REVIEW: ["accept", "request_clarification", "reject"],
  APPROVED: ["request_clarification", "reject", "reopen"],
  REVISION_REQUESTED: ["accept", "reject", "reopen"],
  REJECTED: ["reopen"],
};
const ACTION_LABEL: Record<ReviewAction, string> = { accept: "Accept", request_clarification: "Request clarification", propose_alternative: "Propose alternative", reject: "Reject", reopen: "Reopen review" };

function Cons({ c }: { c?: Consequences }) {
  if (!c) return null;
  return (
    <div className="small">
      <b>If applied:</b>{" "}
      {c.newFindings.length ? c.newFindings.map((d) => `new ${d.severity.toLowerCase().replace("_", " ")}: ${d.message}`).join("; ") : "no new findings"}
      {c.resolvedFindings.length ? `; resolves: ${c.resolvedFindings.map((d) => d.message).join("; ")}` : ""}.
    </div>
  );
}

/** Pick a line and challenge it: why this, why not that, prove it, repair it; then review it. Every answer is computed from the decision record. */
export function LineChallenge({ brief, spec, states, locked, onChanged }: Props) {
  const [lineId, setLineId] = useState(spec.lines.find((l) => l.id === "cct")?.id ?? spec.lines[0]?.id ?? "");
  const [alt, setAlt] = useState("2700K");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();
  const [answer, setAnswer] = useState<ChallengeAnswer>();
  const [msg, setMsg] = useState<string>();
  const line = spec.lines.find((l) => l.id === lineId);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setErr(undefined);
    setMsg(undefined);
    try {
      await fn();
    } catch (e) {
      const a = (e as { answer?: ChallengeAnswer }).answer;
      if (a) setAnswer(a);
      setErr((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const ask = (op: "why" | "why_not" | "prove" | "repair") => run(op, async () => setAnswer(await post<ChallengeAnswer>(`/api/briefs/${brief.id}/challenge`, { op, lineId, alternative: alt })));
  const apply = (mode: "alternative" | "repair") =>
    run("apply", async () => {
      const r = await post<{ applied: string; brief: Brief }>(`/api/briefs/${brief.id}/challenge`, { op: "apply", mode, lineId, alternative: alt, note });
      setMsg(`Applied: ${r.applied}. Recorded as a designer revision in the evidence ledger.`);
      setAnswer(undefined);
      onChanged(r.brief);
    });
  const review = (action: ReviewAction) =>
    run(`review-${action}`, async () => {
      if ((action === "reject" || action === "request_clarification") && !note.trim()) throw new Error("Give a reason: write it in the note box first.");
      const r = await post<{ brief: Brief }>(`/api/briefs/${brief.id}/review`, { lineId, action, note, alternative: action === "propose_alternative" ? alt : undefined });
      setMsg(`${ACTION_LABEL[action]}: recorded.`);
      onChanged(r.brief);
    });

  if (!line) return null;
  const state = states[lineId] ?? "DRAFT";
  const a = answer;
  return (
    <section className="card" aria-labelledby="chal-h">
      <div className="eyebrow">Challenge a recommendation</div>
      <h2 id="chal-h" style={{ margin: "0 0 6px" }}>I don’t agree with this. Why did you choose it?</h2>
      <p className="small muted">Answers are computed from the actual decision record (the client’s words and written limits, the Qloo evidence, the rulebook’s choice) and the real verifier. Nothing is changed until you apply it.</p>
      <div className="row tight">
        <label className="field" style={{ margin: 0 }}>
          <span>Line</span>
          <select value={lineId} onChange={(e) => { setLineId(e.target.value); setAnswer(undefined); setErr(undefined); }}>
            {spec.lines.map((l) => <option key={l.id} value={l.id}>{l.category}</option>)}
          </select>
        </label>
        <span className="pill plain" aria-label="Review state">{STATE_LABEL[state]}</span>
      </div>
      <p className="small" style={{ margin: "8px 0" }}><b>{line.category}:</b> {line.requirement}{line.override ? <span className="muted"> (designer override of “{line.override.from.slice(0, 60)}”)</span> : null}</p>
      <label className="field">
        <span>Alternative to test (for “Why not that?”)</span>
        <input type="text" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} placeholder="2700K · CRI 95 · 5% · 250 lux · a rulebook option" />
      </label>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => ask("why")} disabled={Boolean(busy)}>Why this?</button>
        <button type="button" className="btn" onClick={() => ask("why_not")} disabled={Boolean(busy) || !alt.trim()}>Why not that?</button>
        <button type="button" className="btn" onClick={() => ask("prove")} disabled={Boolean(busy)}>Prove it</button>
        <button type="button" className="btn" onClick={() => ask("repair")} disabled={Boolean(busy)}>Repair it</button>
      </div>
      {busy && !busy.startsWith("review") ? <p className="small" aria-live="polite">Working…</p> : null}
      {err ? <div className="err" role="alert">{err}</div> : null}
      {msg ? <p className="small" role="status">{msg}</p> : null}

      {a?.op === "why" ? (
        <div className="callout" aria-label="Why this" style={{ marginTop: 10 }}>
          <b>{(a as WhyAnswer).decidedBy.summary}</b>
          <ul className="small">
            <li>Rule: <span className="mono">{(a as WhyAnswer).decidedBy.rule}</span>{(a as WhyAnswer).decidedBy.drivers.length ? `, driven by ${(a as WhyAnswer).decidedBy.drivers.join(" and ")}` : ""}.</li>
            <li>The client said: {(a as WhyAnswer).clientStatements.join("; ") || "nothing relevant"}.</li>
            <li>Qloo evidence: {(a as WhyAnswer).evidence.length ? (a as WhyAnswer).evidence.map((e) => `${e.atmosphere.replace(/_/g, " ")} x${e.lift.toFixed(1)} (${e.crowd} vs ${e.baseline})`).join("; ") : "none behind this line"}{(a as WhyAnswer).evidenceIds.length ? ` · requests ${(a as WhyAnswer).evidenceIds.map((x) => `#${x}`).join(" ")}` : ""}.</li>
            <li>Constraints checked: {(a as WhyAnswer).constraints.length ? (a as WhyAnswer).constraints.map((c) => `${c.text} (${c.held ? "held" : "NOT held"})`).join("; ") : "no written limit applies to this line"}.</li>
            <li>The client’s words alone would give: {(a as WhyAnswer).literalValue}.</li>
          </ul>
          <b className="small">Alternatives</b>
          <ul className="small">
            {(a as WhyAnswer).alternatives.map((x) => <li key={x.value}><b>{x.verdict}</b> · {x.value.slice(0, 110)}<div className="muted">{x.reasons.join(" ")}</div></li>)}
          </ul>
          {(a as WhyAnswer).needsInfo.length ? <p className="small"><b>Needs information:</b> {(a as WhyAnswer).needsInfo.join(" ")}</p> : null}
        </div>
      ) : null}

      {a?.op === "why_not" ? (
        <div className="callout" aria-label="Why not that" style={{ marginTop: 10 }}>
          <b>{(a as WhyNotAnswer).verdict}</b>: “{(a as WhyNotAnswer).proposed}”{(a as WhyNotAnswer).normalised ? ` → ${(a as WhyNotAnswer).normalised!.slice(0, 120)}` : ""}
          <ul className="small">{(a as WhyNotAnswer).reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="small">{(a as WhyNotAnswer).evidenceView}</p>
          <Cons c={(a as WhyNotAnswer).consequences} />
          {(a as WhyNotAnswer).needsInfo.map((n) => <p key={n} className="small">{n}</p>)}
          {(a as WhyNotAnswer).verdict === "ALLOWED" && !locked ? (
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn primary" onClick={() => apply("alternative")} disabled={Boolean(busy)}>Apply this alternative</button>
              <button type="button" className="btn" onClick={() => review("propose_alternative")} disabled={Boolean(busy)}>Propose it for review</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {a?.op === "prove" ? (
        <div className="callout" aria-label="Prove it" style={{ marginTop: 10 }}>
          <b>{(a as ProveAnswer).findings.length ? `${(a as ProveAnswer).findings.length} finding(s) on this line` : "No findings on this line"}</b> · document {(a as ProveAnswer).overall.replace(/_/g, " ").toLowerCase()}
          <ul className="small">
            {(a as ProveAnswer).findings.map((f, i) => <li key={i}><b>{f.severity.replace("_", " ")}</b> {f.message}{f.repair ? <div className="muted">Next: {f.repair}</div> : null}</li>)}
            {(a as ProveAnswer).passes.map((f, i) => <li key={`p${i}`} className="muted">Passed: {f.message}</li>)}
          </ul>
        </div>
      ) : null}

      {a?.op === "repair" ? (
        <div className="callout" aria-label="Repair it" style={{ marginTop: 10 }}>
          {(a as RepairAnswer).problems.length ? <ul className="small">{(a as RepairAnswer).problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          {(a as RepairAnswer).proposal ? (
            <>
              <p className="small"><b>Proposed correction:</b> {(a as RepairAnswer).proposal!.value.slice(0, 160)}<br />{(a as RepairAnswer).proposal!.because}</p>
              <Cons c={(a as RepairAnswer).consequences} />
              {!locked ? <button type="button" className="btn primary" onClick={() => apply("repair")} disabled={Boolean(busy)}>Approve and apply this repair</button> : null}
            </>
          ) : null}
          <p className="small muted">{(a as RepairAnswer).note}</p>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div className="eyebrow">Review this line</div>
        {locked ? <p className="small">This version is approved and locked. Change it through a revision.</p> : (
          <>
            <label className="field"><span>Reason or note (needed to reject or request clarification)</span><input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row tight">
              {NEXT[state].map((act) => <button key={act} type="button" className="btn sm" onClick={() => review(act)} disabled={Boolean(busy)}>{ACTION_LABEL[act]}</button>)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
