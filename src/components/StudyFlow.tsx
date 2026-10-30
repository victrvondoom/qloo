"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CRITERIA, QUESTIONS, type Choice, type Criterion, type StudyLine } from "@/lib/study";

interface Status {
  enabled: boolean;
  reason?: string;
  cases: { id: string; title: string; dataMode: "live" | "fixture" }[];
}
interface Assignment {
  assignmentId: string;
  title: string;
  dataMode: "live" | "fixture";
  brief: { clientLabel: string; city: string; room: string; words: string[]; loves: string[]; constraints: string[] };
  left: StudyLine[];
  right: StudyLine[];
}

const LABEL: Record<Choice, string> = { A: "Option A", B: "Option B", equal: "Equal", neither: "Neither" };

function Spec({ title, lines }: { title: string; lines: StudyLine[] }) {
  return (
    <div className="card sunk">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <dl className="small" style={{ margin: 0 }}>
        {lines.map((l) => (
          <div key={l.category} style={{ marginBottom: 8 }}>
            <dt style={{ fontWeight: 600 }}>{l.category}</dt>
            <dd style={{ margin: 0 }}>{l.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StudyFlow() {
  const [status, setStatus] = useState<Status>();
  const [consent, setConsent] = useState(false);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [a, setA] = useState<Assignment>();
  const [answers, setAnswers] = useState<Partial<Record<Criterion, Choice>>>({});
  const [confidence, setConfidence] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [code, setCode] = useState<string>();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<number>();

  useEffect(() => {
    fetch("/api/study/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setErr("Could not reach the study service. Reload to try again."));
  }, []);

  async function load(i: number): Promise<void> {
    if (!status) return;
    const c = status.cases[i];
    setIdx(i);
    if (!c) return;
    setBusy(true);
    setErr(undefined);
    setA(undefined);
    setAnswers({});
    setConfidence(undefined);
    try {
      const res = await fetch("/api/study/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: c.id, consent: true }) });
      const j = await res.json();
      if (j.answered) {
        // Already answered (a reload, or another tab): move on rather than ask twice.
        setSkipped((s) => [...s, c.id]);
        setBusy(false);
        return load(i + 1);
      }
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
      setA(j as Assignment);
    } catch (e) {
      setErr(`${(e as Error).message} Press “Try again”.`);
    } finally {
      setBusy(false);
    }
  }

  const submit = async () => {
    if (!a || !confidence) return;
    setBusy(true);
    setErr(undefined);
    try {
      const res = await fetch("/api/study/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId: a.assignmentId, consent: true, answers, confidence }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
      setCode(j.withdrawCode);
      setBusy(false);
      await load(idx + 1);
    } catch (e) {
      setErr(`${(e as Error).message} Your answers are still here: press Submit again.`);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const res = await fetch("/api/study/responses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const j = await res.json();
    setDeleted(j.deleted ?? 0);
  };

  if (err && !status) return <div className="err" role="alert">{err}</div>;
  if (!status) return <div className="skeleton" style={{ height: 120 }} />;

  if (!status.enabled)
    return (
      <div className="card">
        <h2>Responses are not being collected here</h2>
        <p>{status.reason}</p>
        <p className="small muted">No responses are recorded and none are invented. <Link href="/study/results">See the results page</Link> for what has been collected so far (nothing, until real people respond).</p>
      </div>
    );

  if (!started)
    return (
      <div className="card">
        <h2>Before you start</h2>
        <ul>
          <li><b>Voluntary.</b> You can stop at any time. Closing this page is enough.</li>
          <li>
            <b>What you do:</b> read a short description of a fictional client, compare two lighting specifications, and answer four short questions about them plus how sure you are. About
            {" "}{Math.max(2, status.cases.length)} minutes for {status.cases.length} cases.
          </li>
          <li>
            <b>What is recorded:</b> your choices, your confidence, which case and version you saw, and which of two specifications was on which side. <b>Not recorded:</b> your name, email, IP
            address or anything typed in free text. Your browser gets a random anonymous session id only so the same person isn’t counted twice for one case.
          </li>
          <li><b>Withdraw:</b> after you answer you get a withdraw code. A button here and that code delete all of your responses.</li>
          <li><b>Data:</b> {status.cases.some((c) => c.dataMode === "fixture") ? "some cases here are built from synthetic demo data, and are labelled so; " : ""}the clients are fictional, so you’re judging the specifications against what the client described, not your own taste.</li>
        </ul>
        <label className="row tight" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
          <span>I have read this and agree to take part.</span>
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!consent} onClick={() => {
              setStarted(true);
              void load(0);
            }}>
            Begin
          </button>
          <Link className="btn" href="/study/results">Results so far</Link>
        </div>
      </div>
    );

  const done = idx >= status.cases.length;
  if (done)
    return (
      <div className="card">
        <h2>Thank you</h2>
        {skipped.length ? <p className="small muted">{skipped.length} case(s) were already answered from this browser and were skipped.</p> : null}
        {code ? (
          <p>
            Your withdraw code is <b className="mono">{code}</b>. Keep it if you want to remove your answers later from another browser. It is not stored anywhere that links to you.
          </p>
        ) : (
          <p className="small muted">Your withdraw code was shown when you submitted. This browser can still delete your responses.</p>
        )}
        <div className="row">
          <button className="btn" onClick={withdraw}>Delete my responses now</button>
          <Link className="btn" href="/study/results">Results so far</Link>
        </div>
        {deleted !== undefined ? <p role="status" className="small">{deleted} response(s) deleted.</p> : null}
      </div>
    );

  const complete = CRITERIA.every((c) => answers[c]) && confidence;
  return (
    <div>
      <p className="small muted" aria-live="polite">Case {Math.min(idx + 1, status.cases.length)} of {status.cases.length}</p>
      {err ? <div className="err" role="alert">{err} {!a ? <button className="btn sm" onClick={() => load(idx)}>Try again</button> : null}</div> : null}
      {busy && !a ? <div className="skeleton" style={{ height: 160 }} /> : null}
      {a ? (
        <>
          <div className="card">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{a.brief.clientLabel}, a fictional client</h2>
              {a.dataMode === "fixture" ? <span className="pill low" title="Specifications in this case were generated from synthetic demo data">DEMO · synthetic data</span> : <span className="pill high">Live data</span>}
            </div>
            <p className="small">
              {a.brief.room} in {a.brief.city}. They said <i>“{a.brief.words.join(", ")}”</i>. They love: {a.brief.loves.join("; ")}.
            </p>
            {a.brief.constraints.length ? (
              <p className="small"><b>Explicit requirements:</b> {a.brief.constraints.join("; ")}.</p>
            ) : <p className="small muted">No explicit numeric requirements.</p>}
          </div>
          <div className="grid2 section">
            <Spec title="Option A" lines={a.left} />
            <Spec title="Option B" lines={a.right} />
          </div>
          <div className="card section">
            {CRITERIA.map((c) => (
              <fieldset key={c} className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                <legend style={{ fontWeight: 600, marginBottom: 6 }}>{QUESTIONS[c]}</legend>
                <div className="row tight">
                  {(["A", "B", "equal", "neither"] as Choice[]).map((o) => (
                    <label key={o} className="chip" style={{ cursor: "pointer" }}>
                      <input type="radio" name={c} value={o} checked={answers[c] === o} onChange={() => setAnswers({ ...answers, [c]: o })} /> {LABEL[o]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, marginBottom: 6 }}>How confident are you in these answers? (1 = guessing, 5 = certain)</legend>
              <div className="row tight">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="chip" style={{ cursor: "pointer" }}>
                    <input type="radio" name="confidence" value={n} checked={confidence === n} onChange={() => setConfidence(n)} /> {n}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn primary" disabled={!complete || busy} onClick={submit}>
                {busy ? "Saving…" : idx + 1 === status.cases.length ? "Submit and finish" : "Submit and continue"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
