"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BasisPill, ModeBadges } from "./Badges";
import { PRESETS } from "./presets";
import { Timeline } from "./Timeline";
import { useAgentStream } from "./useAgentStream";
import { limitChips, parseConstraints } from "@/lib/constraints";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import { verifyLedger, type VerifyResult } from "@/lib/ledger";
import type { Brief, BriefInput } from "@/lib/types";

type Literal = { id: string; category: string; value: string; constraints: string[] }[];

async function fetchLiteral(input: BriefInput): Promise<Literal> {
  const res = await fetch("/api/literal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const j = (await res.json()) as { lines?: Literal; error?: string };
  if (!res.ok || !j.lines) throw new Error(j.error ?? "The no-Qloo baseline could not be computed. Try again.");
  return j.lines;
}

const STEPS = ["Ambiguity", "References", "Evidence", "Reasoning", "Specs", "Remove Qloo", "Challenge", "Verify"] as const;

/**
 * A three-minute, self-guided run of the real pipeline for a judge. Every step
 * calls the same functions the product uses (/api/run, /api/literal, the
 * browser-side ledger check); nothing here is animated or pre-recorded.
 */
export function GuidedTour() {
  const maya = PRESETS[0].input;
  const jordan = PRESETS[1].input;
  const a = useAgentStream();
  const b = useAgentStream();
  const c = useAgentStream();
  const d = useAgentStream();
  const [step, setStep] = useState(0);
  const [literal, setLiteral] = useState<Literal>();
  const [litErr, setLitErr] = useState<string>();
  const [sentence, setSentence] = useState("Use 2700K to 3000K lighting.");
  const [verify, setVerify] = useState<VerifyResult>();
  const [verifyErr, setVerifyErr] = useState<string>();
  const both = a.brief && b.brief;
  const mode = a.brief?.dataMode;
  const parsed = useMemo(() => parseConstraints(sentence), [sentence]);
  const chips = limitChips(parsed.limits);

  const runBoth = async () => {
    setLiteral(undefined);
    await Promise.all([a.run(maya), b.run(jordan)]);
  };
  const removeQloo = async () => {
    setLitErr(undefined);
    try {
      setLiteral(await fetchLiteral(maya));
    } catch (e) {
      setLitErr((e as Error).message);
    }
  };
  const challenge = async () => {
    // This time Jordan only says "modern", so nothing in the words implies warm light and the evidence is free to point cool.
    const plain = { ...jordan, words: ["modern"] };
    await Promise.all([
      d.run({ ...plain, clientLabel: "Jordan (evidence only)" }),
      c.run({ ...plain, clientLabel: "Jordan (with a written limit)", cctRange: parsed.limits.cct, criMin: parsed.limits.criMin, dimTo: parsed.limits.dimTo, dimmable: parsed.limits.dimmable, luxTarget: parsed.limits.luxTarget, sourceText: `Jordan says modern. ${sentence}` }),
    ]);
  };
  const check = async () => {
    setVerifyErr(undefined);
    if (!a.brief) return;
    try {
      setVerify(await verifyLedger(a.brief.ledger));
    } catch (e) {
      setVerifyErr((e as Error).message);
    }
  };

  const specIds = a.brief?.spec.map((l) => l.id) ?? [];
  const val = (br: Brief | undefined, id: string) => br?.spec.find((l) => l.id === id)?.value ?? "";
  const differing = both ? specIds.filter((id) => val(a.brief, id) !== val(b.brief, id)) : [];
  const top = (br: Brief) => [...br.dimensions].sort((x, y) => y.score - x.score).slice(0, 3);

  return (
    <section className="card section tour" id="tour" aria-labelledby="tour-h">
      <div className="eyebrow">Three-minute guided run · every step runs the real pipeline</div>
      <h2 id="tour-h">Two clients say “warm, modern”. Do they want the same room?</h2>
      <p className="small muted">
        {mode === "fixture"
          ? "This is DEMO mode: the places and taste data below are synthetic fixtures built for this demo, not Qloo's real data, and every screen says so."
          : mode === "live"
            ? "This is LIVE mode: the evidence below came from the Qloo API."
            : "Mode shows here after you run the agents: DEMO (synthetic fixtures, labelled) or LIVE (Qloo API)."}{" "}
        Runs are private to this browser.
      </p>
      <ol className="tour-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" className="btn sm" aria-current={step === i ? "step" : undefined} aria-pressed={step === i} onClick={() => setStep(i)}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="tour-panel" role="region" aria-live="polite" aria-label={`Step ${step + 1}: ${STEPS[step]}`}>
        {step === 0 ? (
          <div>
            <h3>1 · The words don’t say which room</h3>
            <div className="grid2">
              {PRESETS.map((p) => (
                <div key={p.key} className="card sunk">
                  <b>{p.title}</b> says <i>“{p.input.words.join(", ")}”</i>
                </div>
              ))}
            </div>
            <p className="small">
              Taken literally, “warm” means warm light and “modern” means clean lines, for both of them. A designer would build the same room twice. Press the button to
              see exactly that: the specification from their words alone, with no Qloo.
            </p>
            <button className="btn" onClick={removeQloo}>
              Show what their words alone produce
            </button>
            {litErr ? <div className="err" role="alert">{litErr}</div> : null}
            {literal ? (
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Line</th><th>Maya, from words alone</th><th>Jordan, from words alone</th></tr></thead>
                  <tbody>
                    {literal.slice(0, 4).map((l) => (
                      <tr key={l.id}><td><b className="small">{l.category}</b></td><td className="small">{l.value}</td><td className="small">{l.value}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="tiny muted">Identical for both, because their words are identical. (Computed just now by /api/literal, 0 Qloo calls.)</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h3>2 · What each one loves</h3>
            <p className="small muted">Voluntarily given references. These are the only personal inputs.</p>
            <div className="grid2">
              {PRESETS.map((p) => (
                <div key={p.key} className="card sunk">
                  <b>{p.title}</b>
                  <ul className="small">{p.input.loves.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3>3 · Qloo evidence</h3>
            <p className="small">The agent asks Qloo for the places each taste neighbourhood chooses, and compares them with typical places in the same city.</p>
            <div className="row">
              <button className="btn primary" onClick={runBoth} disabled={a.running || b.running}>
                {a.running || b.running ? "Running both…" : both ? "Run again" : "Run both agents"}
              </button>
              {a.running || b.running ? <button className="btn" onClick={() => { a.cancel(); b.cancel(); }}>Cancel</button> : null}
            </div>
            {a.error || b.error ? <div className="err" role="alert">{a.error ?? b.error}. Check the connection and press Run again.</div> : null}
            {(a.running || b.running) && !both ? <div className="grid2"><Timeline steps={a.steps} running={a.running} /><Timeline steps={b.steps} running={b.running} /></div> : null}
            {both ? (
              <div className="grid2" style={{ marginTop: 10 }}>
                {[a.brief!, b.brief!].map((br) => (
                  <div key={br.id} className="card sunk">
                    <div className="row between"><b>{br.input.clientLabel}</b><ModeBadges brief={br} /></div>
                    <ul className="small">
                      {top(br).map((d) => (
                        <li key={d.id}>
                          <b>{DIMENSION_BY_ID[d.id].short}</b> ×{d.lift.toFixed(1)}: {d.crowdHits}/{d.crowdN} of their places vs {d.baseHits}/{d.baseN} typical
                          {d.exemplars.length ? <span className="muted"> · e.g. {d.exemplars.slice(0, 2).map((e) => e.name).join(", ")}</span> : null}
                        </li>
                      ))}
                    </ul>
                    <div className="tiny muted">{br.stats.qlooRequests} Qloo requests · ledger {br.ledger.length} entries</div>
                  </div>
                ))}
              </div>
            ) : <p className="tiny muted">Run the agents to see the evidence.</p>}
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h3>4 · The agent’s decisions</h3>
            <p className="small muted">Recorded decision summaries and the ledger entries they cite. Not hidden model reasoning.</p>
            {a.brief ? (
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>State</th><th>Decision</th><th>Check</th><th>Evidence</th></tr></thead>
                  <tbody>
                    {a.brief.trace.map((t) => (
                      <tr key={t.seq}>
                        <td className="small"><b>{t.state}</b></td>
                        <td className="small">{t.decision}<div className="muted tiny">{t.rationale}</div></td>
                        <td className="small">{t.validation}</td>
                        <td className="small mono">{t.evidence.length ? t.evidence.map((e) => `#${e}`).join(" ") : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="small">Run the agents in step 3 first.</p>}
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <h3>5 · Two different specifications</h3>
            {both ? (
              <>
                <p className="small"><b>{differing.length} of {specIds.length}</b> lines differ. Highlighted rows are where they part ways.</p>
                <div className="scroll-x">
                  <table className="table">
                    <thead><tr><th>Line</th><th>Maya</th><th>Jordan</th></tr></thead>
                    <tbody>
                      {specIds.map((id) => (
                        <tr key={id} className={differing.includes(id) ? "changed" : undefined}>
                          <td><b className="small">{a.brief!.spec.find((l) => l.id === id)!.category}</b></td>
                          <td className="small">{val(a.brief, id)}<div style={{ marginTop: 4 }}><BasisPill basis={a.brief!.spec.find((l) => l.id === id)!.basis} /></div></td>
                          <td className="small">{val(b.brief, id)}<div style={{ marginTop: 4 }}><BasisPill basis={b.brief!.spec.find((l) => l.id === id)!.basis} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className="small">Run the agents in step 3 first.</p>}
          </div>
        ) : null}

        {step === 5 ? (
          <div>
            <h3>6 · Remove Qloo</h3>
            <p className="small">
              Recompute Maya’s spec from her words alone: same rulebook, same constraints, zero Qloo calls. A difference here shows what the evidence changed. It does not by itself show
              the change is an improvement; that needs people to judge (see the Study page).
            </p>
            <button className="btn" onClick={removeQloo} disabled={!a.brief}>
              Recompute without Qloo
            </button>
            {litErr ? <div className="err" role="alert">{litErr}</div> : null}
            {a.brief && literal ? (
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Line</th><th>Without Qloo</th><th>With Qloo</th></tr></thead>
                  <tbody>
                    {literal.map((l) => {
                      const w = val(a.brief, l.id);
                      return (
                        <tr key={l.id} className={w !== l.value ? "changed" : undefined}>
                          <td><b className="small">{l.category}</b></td>
                          <td className="small">{l.value}</td>
                          <td className="small">{w}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : !a.brief ? <p className="tiny muted">Run the agents in step 3 first.</p> : null}
          </div>
        ) : null}

        {step === 6 ? (
          <div>
            <h3>7 · Challenge the agent</h3>
            <p className="small">
              This time Jordan only says “modern”, and their taste points to cool, bright light. Then Jordan writes a hard requirement. Try your own: a colour-temperature range, a
              minimum CRI, a dimming floor or a lux target. The agent runs twice, with and without it.
            </p>
            <label className="field">
              <span>What the client wrote</span>
              <input type="text" value={sentence} onChange={(e) => setSentence(e.target.value)} maxLength={300} />
            </label>
            <div className="row tight">
              {chips.map((x) => <span key={x} className="chip">{x}</span>)}
              {!chips.length && !parsed.conflicts.length ? <span className="tiny muted">No numeric requirement recognised yet.</span> : null}
            </div>
            {parsed.conflicts.map((x) => <div key={x} className="err" role="alert">{x} Resolve this before building.</div>)}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={challenge} disabled={c.running || d.running || parsed.conflicts.length > 0 || !chips.length}>
                {c.running || d.running ? "Running…" : "Run Jordan with this requirement"}
              </button>
            </div>
            {c.error || d.error ? <div className="err" role="alert">{c.error ?? d.error}. Press Run again.</div> : null}
            {c.brief && d.brief ? (
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Line</th><th>Jordan, evidence only</th><th>Jordan, with the requirement</th></tr></thead>
                  <tbody>
                    {c.brief.spec.map((l) => {
                      const before = val(d.brief, l.id);
                      return (
                        <tr key={l.id} className={before && before !== l.value ? "changed" : undefined}>
                          <td><b className="small">{l.category}</b></td>
                          <td className="small">{before}</td>
                          <td className="small">{l.value}{l.basis === "constraint" ? <div className="tiny" style={{ marginTop: 4 }}><BasisPill basis={l.basis} /> {l.constraints.find((x) => /^client .* applied/.test(x))}</div> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 7 ? (
          <div>
            <h3>8 · Verify the evidence</h3>
            <p className="small">The ledger is a SHA-256 hash chain of every Qloo request and decision. This check runs in your browser, not on our server.</p>
            <button className="btn primary" onClick={check} disabled={!a.brief}>
              Verify Maya’s ledger
            </button>
            {verifyErr ? <div className="err" role="alert">{verifyErr}</div> : null}
            {verify ? (
              <p className={verify.ok ? "ok" : "err"} role="status">
                {verify.ok ? `Intact: all ${verify.checked} entries chain correctly (head ${verify.head.slice(0, 12)}…).` : `Broken at entry ${verify.firstBadSeq}: ${verify.reason}`}
              </p>
            ) : null}
            {a.brief ? (
              <ul className="small">
                {a.brief.ledger.slice(0, 4).map((e) => <li key={e.seq}><span className="mono">#{e.seq} {e.kind}</span> · {e.summary}</li>)}
              </ul>
            ) : <p className="tiny muted">Run the agents in step 3 first.</p>}
            {a.brief ? <Link href={`/brief/${a.brief.id}`}>Open Maya’s full brief, trace and ledger →</Link> : null}
          </div>
        ) : null}
      </div>

      <div className="row between" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</button>
        <button className="btn primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Next →</button>
      </div>
    </section>
  );
}
