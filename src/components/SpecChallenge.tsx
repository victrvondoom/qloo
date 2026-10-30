"use client";

import { useMemo, useState } from "react";
import { ModeBadges } from "./Badges";
import { PRESETS } from "./presets";
import { Timeline } from "./Timeline";
import { useAgentStream } from "./useAgentStream";
import { postBrief } from "./brief/api";
import { DiffView, SensitivityView, StatusBanner, VerificationView } from "./brief/SpecViews";
import { limitChips, parseConstraints } from "@/lib/constraints";
import type { CompiledSpec } from "@/lib/compiler";
import type { SensitivityReport } from "@/lib/sensitivity";
import type { SpecDiff } from "@/lib/spec-diff";
import type { Verification } from "@/lib/verify-spec";
import type { WhyAnswer, WhyNotAnswer } from "@/lib/challenge";
import type { Brief, BriefInput } from "@/lib/types";

interface Report {
  spec: CompiledSpec;
  verification: Verification;
  sensitivity?: SensitivityReport;
}
interface Proposal {
  revision: { id: string };
  diff: SpecDiff;
  verification: Verification;
  briefId: string;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

/**
 * The two-client specification challenge: generate, inspect evidence, verify, change one preference,
 * remove one cultural signal, export. About 90 seconds. Each step runs the real service; nothing is staged.
 */
export function SpecChallenge() {
  const maya = useAgentStream();
  const jordan = useAgentStream();
  const [requirement, setRequirement] = useState("Light between 2700K and 3000K, minimum CRI 90.");
  const parsed = useMemo(() => parseConstraints(requirement), [requirement]);
  const chips = limitChips(parsed.limits);
  const [reports, setReports] = useState<{ maya?: Report; jordan?: Report }>();
  const [verified, setVerified] = useState(false);
  const [proposal, setProposal] = useState<Proposal>();
  const [decision, setDecision] = useState<string>();
  const [sens, setSens] = useState<SensitivityReport>();
  const [why, setWhy] = useState<WhyAnswer>();
  const [whyNot, setWhyNot] = useState<WhyNotAnswer>();
  const [approved, setApproved] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [err, setErr] = useState<string>();

  const a = maya.brief;
  const b = jordan.brief;
  const ready = Boolean(a && b);
  const mode = a?.dataMode;
  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setErr(undefined);
    try {
      await fn();
    } catch (e) {
      setErr(`${(e as Error).message} Press the button again.`);
    } finally {
      setBusy(undefined);
    }
  };

  const withLimits = (i: BriefInput): BriefInput => ({ ...i, cctRange: parsed.limits.cct, criMin: parsed.limits.criMin, dimTo: parsed.limits.dimTo, dimmable: parsed.limits.dimmable, luxTarget: parsed.limits.luxTarget, sourceText: `Says warm, modern. ${requirement}` });
  const generate = () =>
    act("generate", async () => {
      setReports(undefined);
      setVerified(false);
      setProposal(undefined);
      setDecision(undefined);
      setSens(undefined);
      await Promise.all([maya.run(withLimits(PRESETS[0].input)), jordan.run(withLimits(PRESETS[1].input))]);
    });
  const load = async (x: Brief, y: Brief) => {
    const [r1, r2] = await Promise.all([getJson<Report>(`/api/briefs/${x.id}/spec`), getJson<Report>(`/api/briefs/${y.id}/spec`)]);
    setReports({ maya: r1, jordan: r2 });
  };
  const verify = () => act("verify", async () => { await load(a!, b!); setVerified(true); });
  const askWhy = () => act("why", async () => setWhy(await getJson<WhyAnswer>(`/api/briefs/${a!.id}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "why", lineId: "cct" }) })));
  const askWhyNot = () => act("whynot", async () => setWhyNot(await getJson<WhyNotAnswer>(`/api/briefs/${a!.id}/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "why_not", lineId: "cct", alternative: "4000K" }) })));
  const approve = () =>
    act("approve", async () => {
      const post = (body: unknown) => getJson(`/api/briefs/${a!.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const rep = await getJson<{ spec: CompiledSpec }>(`/api/briefs/${a!.id}/spec`);
      for (const l of rep.spec.lines) await post({ lineId: l.id, action: "accept" });
      await post({ approve: true, note: "Approved in the Proof Lab challenge" });
      setApproved("Approved by a human reviewer (you). This records that a person reviewed this version; it is not a professional certification. The version is now locked.");
    });
  const change = () =>
    act("change", async () => {
      setDecision(undefined);
      setProposal(await getJson<Proposal>(`/api/briefs/${a!.id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: { replaceLove: { from: a!.input.loves.at(-1), to: "Kendrick Lamar" } } }) }));
    });
  const decide = (action: "accept" | "reject") =>
    act(action, async () => {
      await getJson(`/api/revisions/${proposal!.revision.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      setDecision(action === "accept" ? "Accepted: the revised brief is now Maya’s current version." : "Rejected: Maya’s specification is unchanged.");
    });
  const stress = () =>
    act("stress", async () => {
      const r = await postBrief(`/api/briefs/${a!.id}/influence`, {});
      const rep = await getJson<Report>(`/api/briefs/${r.brief.id}/spec`);
      setSens(rep.sensitivity);
    });

  const names = Object.fromEntries((reports?.maya?.spec.lines ?? []).map((l) => [l.id, l.category]));
  const step = !ready ? 1 : !verified ? 3 : !proposal ? 4 : !sens ? 6 : 7;

  return (
    <section className="card section" id="challenge" aria-labelledby="challenge-h">
      <div className="eyebrow">The two-client specification challenge · about 90 seconds</div>
      <h2 id="challenge-h">Both say “warm, modern.” Generate, verify, challenge, revise, stress, export.</h2>
      <p className="small muted">
        {mode === "fixture" ? "DEMO mode: the evidence is a synthetic fixture world, labelled on every screen and in the export, not Qloo’s real data." : mode === "live" ? "LIVE mode: evidence from the Qloo API." : "The mode (DEMO fixtures or LIVE Qloo) shows here once you generate."}{" "}
        Runs are private to this browser. Every step below calls the real service.
      </p>
      <label className="field">
        <span>Both clients also wrote</span>
        <input type="text" value={requirement} maxLength={300} onChange={(e) => setRequirement(e.target.value)} />
      </label>
      <div className="row tight">
        {chips.map((c) => <span key={c} className="chip">{c}</span>)}
        {parsed.conflicts.map((c) => <span key={c} className="err" role="alert">{c}</span>)}
      </div>
      {err ? <div className="err" role="alert">{err}</div> : null}

      <ol className="stack" style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
        <li>
          <div className="row">
            <button type="button" className="btn primary" onClick={generate} disabled={maya.running || jordan.running || parsed.conflicts.length > 0}>
              {maya.running || jordan.running ? "Generating…" : ready ? "1 · Generate again" : "1 · Generate specifications"}
            </button>
          </div>
          {maya.error || jordan.error ? <div className="err" role="alert">{maya.error ?? jordan.error}. Press Generate again.</div> : null}
          {(maya.running || jordan.running) && !ready ? <div className="grid2"><Timeline steps={maya.steps} running={maya.running} /><Timeline steps={jordan.steps} running={jordan.running} /></div> : null}
          {ready ? (
            <div className="grid2" style={{ marginTop: 10 }}>
              {[a!, b!].map((br) => (
                <div key={br.id} className="card sunk">
                  <div className="row between"><b>{br.input.clientLabel}</b><ModeBadges brief={br} /></div>
                  <p className="tiny muted" style={{ margin: "4px 0" }}>loves: {br.input.loves.join("; ")}</p>
                  <ul className="small" style={{ margin: 0 }}>
                    {br.spec.slice(0, 4).map((l) => <li key={l.id}><b>{l.category}:</b> {l.value.slice(0, 90)}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </li>

        {ready ? (
          <li>
            <h3 style={{ margin: "0 0 6px" }}>2 · Evidence behind each line</h3>
            <div className="grid2">
              {[a!, b!].map((br) => (
                <div key={br.id} className="small">
                  <b>{br.input.clientLabel}</b>: {br.stats.qlooRequests} Qloo request(s), {br.ledger.length} ledger entries.
                  <ul style={{ margin: "4px 0" }}>
                    {[...br.dimensions].sort((x, y) => y.score - x.score).slice(0, 3).map((d) => <li key={d.id}>{d.label}: {d.crowdHits}/{d.crowdN} of their places vs {d.baseHits}/{d.baseN} typical (x{d.lift.toFixed(1)})</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </li>
        ) : null}

        {ready ? (
          <li>
            <div className="row">
              <button type="button" className="btn primary" onClick={verify} disabled={busy === "verify"}>{busy === "verify" ? "Verifying…" : "3 · Verify requirements"}</button>
            </div>
            {verified && reports?.maya && reports.jordan ? (
              <div className="grid2" style={{ marginTop: 10 }}>
                {([["Maya", reports.maya], ["Jordan", reports.jordan]] as const).map(([n, r]) => (
                  <div key={n}>
                    <b>{n}</b> <StatusBanner v={r.verification} />
                    <div style={{ marginTop: 6 }}><VerificationView v={r.verification} lineNames={names} /></div>
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        ) : null}

        {verified ? (
          <li>
            <h3 style={{ margin: "0 0 6px" }}>4 · Challenge a recommendation: “Why this colour temperature?”</h3>
            <div className="row">
              <button type="button" className="btn primary" onClick={askWhy} disabled={busy === "why"}>Why this?</button>
              <button type="button" className="btn" onClick={askWhyNot} disabled={busy === "whynot"}>Why not 4000K?</button>
            </div>
            {why ? (
              <div className="callout" aria-label="Why this" style={{ marginTop: 8 }}>
                <b>{why.value}</b>: {why.decidedBy.summary}
                <ul className="small">
                  <li>Rule {why.decidedBy.rule}; the client said {why.clientStatements.join("; ") || "nothing relevant"}.</li>
                  <li>Constraints: {why.constraints.length ? why.constraints.map((c) => `${c.text} (${c.held ? "held" : "NOT held"})`).join("; ") : "no written limit on this line"}.</li>
                  <li>Alternatives: {why.alternatives.map((x) => `${x.verdict} ${x.value.slice(0, 40)}`).join(" · ")}.</li>
                </ul>
              </div>
            ) : null}
            {whyNot ? (
              <div className="callout" aria-label="Why not that" style={{ marginTop: 8 }}>
                <b>{whyNot.verdict}</b>: {whyNot.reasons.join(" ")}
                <p className="small">{whyNot.evidenceView}</p>
              </div>
            ) : null}
          </li>
        ) : null}

        {verified ? (
          <li>
            <div className="row">
              <button type="button" className="btn primary" onClick={change} disabled={busy === "change"}>{busy === "change" ? "Running the agent…" : `5 · Change one preference (${a!.input.loves.at(-1)} → Kendrick Lamar)`}</button>
            </div>
            {proposal ? (
              <div style={{ marginTop: 10 }}>
                <DiffView diff={proposal.diff} />
                <div className="row" style={{ marginTop: 8 }}>
                  {!decision ? (
                    <>
                      <button type="button" className="btn" onClick={() => decide("accept")} disabled={Boolean(busy)}>Accept revision</button>
                      <button type="button" className="btn" onClick={() => decide("reject")} disabled={Boolean(busy)}>Reject revision</button>
                    </>
                  ) : null}
                </div>
                {decision ? <p role="status" className="small">{decision}</p> : null}
              </div>
            ) : null}
          </li>
        ) : null}

        {proposal ? (
          <li>
            <div className="row">
              <button type="button" className="btn primary" onClick={stress} disabled={busy === "stress"}>{busy === "stress" ? "Asking Qloo without each reference…" : "6 · Remove one cultural signal at a time"}</button>
            </div>
            {sens ? <div style={{ marginTop: 10 }}><SensitivityView s={sens} /></div> : null}
          </li>
        ) : null}

        {sens ? (
          <li>
            <h3 style={{ margin: "0 0 6px" }}>7 · Approve and export the professional specification</h3>
            <div className="row">
              <button type="button" className="btn" onClick={approve} disabled={busy === "approve" || Boolean(approved)}>{busy === "approve" ? "Approving…" : "Accept every line and approve"}</button>
            </div>
            {approved ? <p role="status" className="small">{approved}</p> : null}
            <div className="row" style={{ marginTop: 8 }}>
              <a className="btn primary" href={`/api/briefs/${a!.id}/spec?format=html`} target="_blank" rel="noreferrer">Open printable document</a>
              <a className="btn" href={`/api/briefs/${a!.id}/spec?format=json&download=1`}>JSON</a>
              <a className="btn" href={`/api/briefs/${a!.id}/spec?format=csv&download=1`}>CSV</a>
            </div>
            <p className="tiny muted">The document states its verification outcome, assumptions and unknowns, and that it is not a certificate. For PDF use the browser’s Print.</p>
          </li>
        ) : null}
      </ol>
      <p className="tiny muted" aria-live="polite">Step {step} of 7.</p>
    </section>
  );
}
