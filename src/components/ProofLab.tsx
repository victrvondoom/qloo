"use client";

import Link from "next/link";
import { useState } from "react";
import { GuidedTour } from "./GuidedTour";
import { PRESETS } from "./presets";
import { Timeline } from "./Timeline";
import { useAgentStream } from "./useAgentStream";
import { BasisPill, ModeBadges } from "./Badges";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import { verifyLedger, type VerifyResult } from "@/lib/ledger";
import { evidenceReport } from "@/lib/evidence";
import type { Brief, BriefInput } from "@/lib/types";

type Literal = { id: string; category: string; value: string; constraints: string[] }[];

async function fetchLiteral(input: BriefInput): Promise<Literal> {
  const res = await fetch("/api/literal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const j = (await res.json()) as { lines?: Literal; error?: string };
  if (!res.ok || !j.lines) throw new Error(j.error ?? "Literal baseline failed");
  return j.lines;
}

function Outcome({ brief }: { brief: Brief }) {
  const r = evidenceReport(brief);
  return (
    <div className="small" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <ModeBadges brief={brief} />
      </div>
      <p style={{ margin: "8px 0 4px" }}>
        {r.counts.evidence_supported} evidence-backed · {r.counts.derived} derived · {r.counts.client_stated} from the client&apos;s words
        {r.counts.unsupported ? ` · ${r.counts.unsupported} unsupported` : ""}
      </p>
      {brief.warnings.slice(0, 2).map((w) => (
        <div key={w} className="muted">⚠ {w}</div>
      ))}
      <Link href={`/brief/${brief.id}`}>Open brief, trace and ledger →</Link>
    </div>
  );
}

// ---------------------------------------------------------------- Experience 1 + 2

function SameWords() {
  const a = useAgentStream();
  const b = useAgentStream();
  const [literal, setLiteral] = useState<Literal>();
  const [withoutQloo, setWithoutQloo] = useState(false);
  const [err, setErr] = useState<string>();
  const run = async () => {
    setLiteral(undefined);
    setWithoutQloo(false);
    await Promise.all([a.run(PRESETS[0].input), b.run(PRESETS[1].input)]);
  };
  const toggle = async () => {
    setErr(undefined);
    if (!withoutQloo && !literal) {
      try {
        setLiteral(await fetchLiteral(PRESETS[0].input));
      } catch (e) {
        setErr((e as Error).message);
        return;
      }
    }
    setWithoutQloo((x) => !x);
  };
  const both = a.brief && b.brief;
  const ids = a.brief?.spec.map((l) => l.id) ?? [];
  const valueOf = (br: Brief | undefined, id: string) => (withoutQloo ? literal?.find((l) => l.id === id)?.value : br?.spec.find((l) => l.id === id)?.value);
  const differing = both ? ids.filter((id) => valueOf(a.brief, id) !== valueOf(b.brief, id)) : [];
  return (
    <section className="card section">
      <div className="eyebrow">Experience 1 + 2 · Same words, different taste · Remove Qloo</div>
      <h2>Maya and Jordan both ask for “warm, modern”.</h2>
      <p className="small muted">
        Runs both briefs for real. Then press <b>Without Qloo</b>: the spec is recomputed from the words alone (same rulebook, same constraints, zero Qloo calls) and the
        comparison updates.
      </p>
      <div className="row">
        <button className="btn primary" onClick={run} disabled={a.running || b.running}>
          {a.running || b.running ? "Running both…" : "Run both briefs"}
        </button>
        {both ? (
          <button className="btn" onClick={toggle} aria-pressed={withoutQloo}>
            {withoutQloo ? "With Qloo" : "Without Qloo"}
          </button>
        ) : null}
        {a.running || b.running ? <button className="btn" onClick={() => { a.cancel(); b.cancel(); }}>Cancel</button> : null}
      </div>
      {err ? <div className="err" style={{ marginTop: 8 }}>{err}</div> : null}
      {(a.running || b.running) && !both ? (
        <div className="grid2" style={{ marginTop: 12 }}>
          <Timeline steps={a.steps} running={a.running} />
          <Timeline steps={b.steps} running={b.running} />
        </div>
      ) : null}
      {a.error || b.error ? <div className="err" style={{ marginTop: 8 }}>{a.error ?? b.error}</div> : null}
      {both ? (
        <>
          <h3 style={{ marginTop: 16 }}>
            {withoutQloo
              ? `Without Qloo: ${differing.length} of ${ids.length} lines differ. Same words, same room.`
              : `With Qloo: ${differing.length} of ${ids.length} lines differ between them.`}
          </h3>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Maya</th>
                  <th>Jordan</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id) => {
                  const la = a.brief!.spec.find((l) => l.id === id)!;
                  const lb = b.brief!.spec.find((l) => l.id === id)!;
                  return (
                    <tr key={id} className={differing.includes(id) ? "changed" : undefined}>
                      <td><b className="small">{la.category}</b></td>
                      <td className="small">
                        {valueOf(a.brief, id)}
                        {!withoutQloo ? <div style={{ marginTop: 4 }}><BasisPill basis={la.basis} /></div> : null}
                      </td>
                      <td className="small">
                        {valueOf(b.brief, id)}
                        {!withoutQloo ? <div style={{ marginTop: 4 }}><BasisPill basis={lb.basis} /></div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid2" style={{ marginTop: 8 }}>
            {[a.brief!, b.brief!].map((br) => (
              <div key={br.id} className="small">
                <b>{br.input.clientLabel}</b>: {br.words.map((w) => `“${w.word}” → ${w.chosen?.meaning ?? "unmapped"}`).join("; ")}.{" "}
                Strongest: {[...br.dimensions].sort((x, y) => y.score - x.score).slice(0, 2).map((d) => `${DIMENSION_BY_ID[d.id].short} ×${d.lift.toFixed(1)} (${d.crowdHits}/${d.crowdN} vs ${d.baseHits}/${d.baseN})`).join(", ")}
                <Outcome brief={br} />
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            A difference is only justified if the evidence supports it: lines marked “Qloo evidence” cite measured lift over the city baseline and the requests that
            produced it. Lines marked “Client&apos;s words” would be the same without Qloo. The benchmark (reports/benchmark-summary.md) measures how often differences
            like these are justified on synthetic clients with known taste.
          </p>
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Experience 3

function ChangeOne() {
  const base = useAgentStream();
  const variant = useAgentStream();
  const [loves, setLoves] = useState(PRESETS[0].input.loves);
  const [idx, setIdx] = useState(0);
  const [replacement, setReplacement] = useState("Fred again..");
  const run = async () => {
    const changed = loves.map((l, i) => (i === idx ? replacement : l));
    await Promise.all([base.brief ? Promise.resolve(base.brief) : base.run({ ...PRESETS[0].input, loves }), variant.run({ ...PRESETS[0].input, clientLabel: "Maya (one change)", loves: changed })]);
  };
  const A = base.brief;
  const B = variant.brief;
  const changedLines = A && B ? B.spec.filter((l) => A.spec.find((x) => x.id === l.id)?.value !== l.value) : [];
  const dimShift = A && B ? B.dimensions.map((d) => ({ d, before: A.dimensions.find((x) => x.id === d.id)!.score })).filter((x) => Math.abs(x.d.score - x.before) >= 0.15) : [];
  return (
    <section className="card section">
      <div className="eyebrow">Experience 3 · Change one favourite</div>
      <h2>Swap one of Maya&apos;s loves and see what moves, and why.</h2>
      <div className="row">
        <label className="field" style={{ margin: 0 }}>
          <span>Replace</span>
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {loves.map((l, i) => (
              <option key={l} value={i}>{l}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0, flex: "1 1 220px" }}>
          <span>with</span>
          <input type="text" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        </label>
        <button className="btn primary" onClick={run} disabled={base.running || variant.running || !replacement.trim()}>
          {base.running || variant.running ? "Running…" : "Re-run"}
        </button>
      </div>
      {variant.running ? <Timeline steps={variant.steps} running /> : null}
      {variant.error ? <div className="err">{variant.error}</div> : null}
      {A && B ? (
        <div style={{ marginTop: 12 }}>
          <h3>{changedLines.length} line{changedLines.length === 1 ? "" : "s"} changed.</h3>
          <p className="small">
            {dimShift.length
              ? `The evidence moved: ${dimShift.map((x) => `${DIMENSION_BY_ID[x.d.id].short} ${x.before.toFixed(2)} → ${x.d.score.toFixed(2)}`).join(", ")}.`
              : "No atmosphere moved by more than 0.15, so any change is small."}{" "}
            {changedLines.length && !dimShift.length ? "Changes without a matching evidence shift deserve scepticism." : ""}
          </p>
          <table className="table">
            <tbody>
              {changedLines.map((l) => (
                <tr key={l.id}>
                  <td><b className="small">{l.category}</b></td>
                  <td className="small strike">{A.spec.find((x) => x.id === l.id)?.value}</td>
                  <td className="small">{l.value} <BasisPill basis={l.basis} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Outcome brief={B} />
        </div>
      ) : null}
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setLoves([...PRESETS[0].input.loves])}>Reset loves</button>
    </section>
  );
}

// ---------------------------------------------------------------- Experience 4

const CHALLENGES: { key: string; title: string; expect: string; input: BriefInput }[] = [
  {
    key: "ambiguous",
    title: "Ambiguous favourite",
    expect: "Flags the same-name collision or abstains on a weak match; the decision is visible and the pro can pin another candidate.",
    input: { ...PRESETS[0].input, clientLabel: "Ambiguous", loves: ["The Bear", "Heat", "Khruangbin", "Zzqx Imaginary Band"] },
  },
  {
    key: "conflict",
    title: "Conflicting taste",
    expect: "Mixed signals: lower confidence on contested lines, and a question only if its answer would change the spec.",
    input: { ...PRESETS[0].input, clientLabel: "Conflicted", loves: ["Norah Jones", "Fred again..", "MUJI (brand)", "Ace Hotel (hotel)"] },
  },
  {
    key: "noevidence",
    title: "No evidence",
    expect: "INSUFFICIENT_EVIDENCE: abstains from personalisation and returns the literal spec, all low confidence.",
    input: { ...PRESETS[0].input, clientLabel: "Unknown refs", loves: ["Zzqx Imaginary Band", "Qwvx Fictional Show"] },
  },
  {
    key: "constraint",
    title: "Strong functional requirement",
    expect: "Says “warm” for a kitchen while loving bright, minimal things: never cooler than 3000K ambient; the line is marked as a hard constraint.",
    input: { ...PRESETS[1].input, clientLabel: "Warm kitchen", room: "kitchen", words: ["warm"] },
  },
  {
    key: "outage",
    title: "Qloo unavailable (simulated)",
    expect: "UPSTREAM_UNAVAILABLE: the outage is visible, nothing is personalised, the ledger records a SIMULATED OUTAGE.",
    input: { ...PRESETS[0].input, clientLabel: "Outage test", challenge: "upstream_down" },
  },
];

function Challenge({ c }: { c: (typeof CHALLENGES)[number] }) {
  const s = useAgentStream();
  return (
    <div className="card">
      <h3>{c.title}</h3>
      <p className="small muted">Correct behaviour: {c.expect}</p>
      <button className="btn sm" onClick={() => s.run(c.input)} disabled={s.running}>
        {s.running ? "Running…" : "Run challenge"}
      </button>
      {s.running ? <Timeline steps={s.steps} running /> : null}
      {s.error ? <div className="err small" style={{ marginTop: 8 }}>Stopped: {s.error}</div> : null}
      {s.brief ? (
        <>
          <p className="small" style={{ marginTop: 8 }}>
            <b>Agent chose:</b>{" "}
            {s.brief.status === "UPSTREAM_UNAVAILABLE"
              ? "degrade (Qloo unavailable)"
              : s.brief.status === "INSUFFICIENT_EVIDENCE"
                ? "abstain (not enough evidence)"
                : s.brief.status === "NEEDS_CLARIFICATION"
                  ? "answer, and ask one question"
                  : "answer"}
          </p>
          {s.steps.filter((x) => x.status === "decision").slice(0, 3).map((d) => (
            <div key={d.id} className="small">◆ {d.label}{d.detail ? `: ${d.detail}` : ""}</div>
          ))}
          {c.key === "constraint" ? (
            <div className="small" style={{ marginTop: 6 }}>
              Colour temperature: <b>{s.brief.spec.find((l) => l.id === "cct")?.value}</b> <BasisPill basis={s.brief.spec.find((l) => l.id === "cct")!.basis} />
            </div>
          ) : null}
          <Outcome brief={s.brief} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Experience 5

function Inspect() {
  const [id, setId] = useState("");
  const [res, setRes] = useState<{ v: VerifyResult; b: Brief }>();
  const [err, setErr] = useState<string>();
  const check = async () => {
    setErr(undefined);
    try {
      const r = await fetch(`/api/briefs/${encodeURIComponent(id.trim())}`);
      const j = (await r.json()) as { brief?: Brief; error?: string };
      if (!j.brief) throw new Error(j.error ?? "Not found");
      setRes({ v: await verifyLedger(j.brief.ledger), b: j.brief });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const report = res ? evidenceReport(res.b) : undefined;
  return (
    <section className="card section">
      <div className="eyebrow">Experience 5 · Inspect and verify</div>
      <h2>Where did each line come from?</h2>
      <p className="small muted">Paste a brief id (from any brief above). The chain is re-hashed in your browser and every line is classified against its cited sources.</p>
      <div className="row">
        <input type="text" placeholder="b-…" value={id} onChange={(e) => setId(e.target.value)} style={{ flex: "1 1 240px" }} />
        <button className="btn" onClick={check} disabled={!id.trim()}>Inspect</button>
      </div>
      {err ? <div className="err" style={{ marginTop: 8 }}>{err}</div> : null}
      {res && report ? (
        <div style={{ marginTop: 12 }}>
          <p className="small">
            Chain {res.v.ok ? `intact (${res.v.checked} entries)` : `broken at #${res.v.firstBadSeq}: ${res.v.reason}`} ·{" "}
            {report.counts.evidence_supported} evidence-supported · {report.counts.derived} derived · {report.counts.client_stated} client-stated ·{" "}
            {report.counts.unsupported} unsupported
          </p>
          <table className="table">
            <tbody>
              {report.lines.map((l) => (
                <tr key={l.lineId}>
                  <td><b className="small">{l.category}</b></td>
                  <td className="small">{l.class.replace("_", " ")}</td>
                  <td className="small muted">{l.sources.filter((s) => s.type !== "app_mapping").slice(0, 4).map((s) => `${s.type}:${s.ref}`).join(" · ") || "rulebook only"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href={`/brief/${res.b.id}`}>Open the full trace and ledger →</Link>
        </div>
      ) : null}
    </section>
  );
}

export function ProofLab() {
  return (
    <div>
      <div className="eyebrow">Proof Lab</div>
      <h1>Don&apos;t take our word for it.</h1>
      <p className="lede">
        Every control on this page runs the real pipeline. Nothing is pre-recorded. Watch the agent answer, ask, abstain or degrade, then
        check where each line came from.
      </p>
      <GuidedTour />
      <SameWords />
      <ChangeOne />
      <section className="section">
        <div className="eyebrow">Experience 4 · Challenge the agent</div>
        <h2>Five ways to make it fail. It should choose correctly between answering, asking, abstaining and degrading.</h2>
        <div className="grid2" style={{ alignItems: "start" }}>
          {CHALLENGES.map((c) => (
            <Challenge key={c.key} c={c} />
          ))}
        </div>
      </section>
      <Inspect />
    </div>
  );
}
