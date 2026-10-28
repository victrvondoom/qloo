"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Fingerprint } from "../Fingerprint";
import { TracePanel } from "../TracePanel";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import { verifyLedger, type VerifyResult } from "@/lib/ledger";
import { evidenceReport } from "@/lib/evidence";
import type { ReplayResult } from "@/lib/replay";
import type { Brief } from "@/lib/types";

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function Words({ brief }: { brief: Brief }) {
  return (
    <section className="card">
      <div className="eyebrow">What they said vs. what they mean</div>
      {brief.words.map((w) => (
        <div key={w.word} style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 6 }}>
            <em>“{w.word}”</em> {w.chosen && !w.chosen.isDictionaryDefault ? <span className="pill amber">not the literal sense</span> : null}
            {w.source === "llm" ? <span className="pill info" style={{ marginLeft: 6 }}>readings from Claude</span> : null}
          </h3>
          {w.known ? (
            w.readings.map((r, i) => (
              <div key={r.dimension} className={`reading${i === 0 ? " chosen" : ""}`}>
                <div>
                  {r.meaning}
                  {r.isDictionaryDefault ? <span className="muted small"> (literal)</span> : null}
                  <div className="meter" style={{ marginTop: 4 }}>
                    <div style={{ width: pct(r.weight) }} />
                  </div>
                </div>
                <div className="small num" style={{ textAlign: "right" }}>{pct(r.weight)}</div>
              </div>
            ))
          ) : (
            <p className="muted small">Not in the lexicon, so it doesn&apos;t move the spec.</p>
          )}
        </div>
      ))}
    </section>
  );
}

function CounterTest({ brief }: { brief: Brief }) {
  const audit = brief.llmBaseline.audit;
  const agree = audit?.filter((a) => a.agrees).length ?? 0;
  return (
    <section className="card">
      <div className="eyebrow">Counter-test · the same job without Qloo</div>
      {audit ? (
        <>
          <h3>
            {brief.llmBaseline.model} alone matched the evidence on {agree} of {audit.length} lines
          </h3>
          <p className="small muted">Same words, same loves, same menu of options. It never saw Qloo data. Where it differs, the right column is what the taste evidence supports.</p>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>LLM only</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.category}>
                    <td>
                      {a.category} {a.agrees ? <span className="pill good">agrees</span> : <span className="pill bad">differs</span>}
                    </td>
                    <td className={a.agrees ? "" : "strike"}>{a.llmValue}</td>
                    <td>{a.evidenceValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>{brief.llmBaseline.reason}</p>
      )}
    </section>
  );
}

function Resolutions({ brief, canEdit }: { brief: Brief; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const rerun = async (input: string, entityId: string) => {
    setBusy(true);
    setErr(undefined);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...brief.input, pinned: { ...(brief.input.pinned ?? {}), [input]: entityId } }) });
      const text = await res.text();
      const last = text.trim().split("\n").map((l) => JSON.parse(l) as { type: string; brief?: Brief; message?: string }).at(-1);
      if (last?.type === "brief" && last.brief) router.push(`/brief/${last.brief.id}`);
      else throw new Error(last?.message ?? "Re-run failed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <div className="eyebrow">What “{brief.input.clientLabel} loves” resolved to</div>
      <p className="small muted">A wrong match is the quietest way for a taste agent to fail. Weak matches are dropped, same-name collisions are flagged, and you can pin another candidate (this re-runs the brief).</p>
      {err ? <div className="err">{err}</div> : null}
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>They said</th>
              <th>Matched</th>
              <th>Status</th>
              <th>Other candidates</th>
            </tr>
          </thead>
          <tbody>
            {brief.resolutions.map((r) => (
              <tr key={r.input}>
                <td>{r.input}</td>
                <td>
                  {r.chosen ? (
                    <>
                      {r.chosen.name} <span className="muted small">({r.chosen.type.replace("urn:entity:", "")})</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span className={`pill ${r.status === "resolved" ? "good" : r.status === "ambiguous" ? "warn" : "bad"}`}>{r.status.replace("_", " ")}</span>
                  <span className="small muted"> · {Math.round(r.confidence * 100)}%</span>
                  {r.note ? <div className="small muted" style={{ marginTop: 4 }}>{r.note}</div> : null}
                </td>
                <td>
                  <div className="row tight">
                    {r.alternatives.slice(0, 3).map((a) => (
                      <button key={a.entity_id} type="button" className="btn sm" disabled={busy || !canEdit} onClick={() => rerun(r.input, a.entity_id)} title="Use this one and re-run">
                        {a.name} <span className="muted">· {a.type.replace("urn:entity:", "")}</span>
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Places({ brief }: { brief: Brief }) {
  const top = useMemo(() => [...brief.crowdVenues].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)).slice(0, 30), [brief.crowdVenues]);
  return (
    <section className="card">
      <details>
        <summary>
          <span className="eyebrow" style={{ display: "inline" }}>
            The rooms behind the fingerprint · {brief.crowdVenues.length} taste-matched, {brief.baseVenues.length} typical
          </span>
        </summary>
        <p className="small muted" style={{ marginTop: 10 }}>
          A place counts toward an atmosphere when one of its tags or keywords matches the lexicon{brief.tagMap ? ", or a term a model mapped (labelled “mapped”)" : ""}. Untagged places are excluded on both sides.
        </p>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Place</th>
                <th className="num">Affinity</th>
                <th className="num">Popularity</th>
                <th>Reads as</th>
              </tr>
            </thead>
            <tbody>
              {top.map((v) => (
                <tr key={v.entity_id}>
                  <td>
                    {v.name}
                    {v.city ? <div className="tiny muted">{v.city}</div> : null}
                  </td>
                  <td className="num">{v.affinity !== undefined ? v.affinity.toFixed(2) : "—"}</td>
                  <td className="num">{v.popularity !== undefined ? v.popularity.toFixed(2) : "—"}</td>
                  <td className="small">
                    {v.matches.length ? v.matches.map((m) => `${DIMENSION_BY_ID[m.dimension].short} (“${m.term}”${m.source === "mapped" ? ", mapped" : ""})`).join(" · ") : <span className="muted">no atmosphere terms</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Replay({ brief }: { brief: Brief }) {
  const [r, setR] = useState<ReplayResult>();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <div className="panel-title">
        <div>
          <div className="eyebrow">Deterministic replay</div>
          <h3 style={{ margin: 0 }}>Rebuild the spec from the stored evidence</h3>
        </div>
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setR((await (await fetch(`/api/briefs/${brief.id}/replay`)).json()) as ReplayResult);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Replaying…" : "Replay now"}
        </button>
      </div>
      <p className="small muted">No Qloo or model calls: the server recomputes the fingerprint from the places stored on this brief, re-applies the answer and depth, runs the rulebook, and compares every line.</p>
      {r ? (
        <div className="stack" style={{ gap: 8 }}>
          {r.checks.map((c) => (
            <div key={c.name} className={c.ok ? "okay" : "err"}>
              <b>{c.ok ? "✓" : "✗"} {c.name}.</b> {c.detail}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Ledger({ brief }: { brief: Brief }) {
  const [result, setResult] = useState<VerifyResult>();
  const counts = brief.ledger.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  return (
    <section className="card">
      <div className="panel-title">
        <div>
          <div className="eyebrow">Evidence ledger</div>
          <h3 style={{ margin: 0 }}>{brief.ledger.length} entries, hash-chained</h3>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {counts.qloo_call ?? 0} Qloo calls · {counts.decision ?? 0} decisions · {counts.computation ?? 0} computations · {counts.llm_call ?? 0} model calls · {counts.client_input ?? 0} inputs
          </p>
        </div>
        <div className="row tight">
          <button type="button" className="btn sm" onClick={async () => setResult(await verifyLedger(brief.ledger))}>
            Verify in your browser
          </button>
          <a className="btn sm" href={`/api/briefs/${brief.id}/bundle`}>
            Download bundle
          </a>
        </div>
      </div>
      {result ? (
        <div className={result.ok ? "okay" : "err"}>
          {result.ok ? `Intact: all ${result.checked} entries hash correctly and link to the one before. Head ${result.head.slice(0, 16)}…` : `Broken at entry ${result.firstBadSeq}: ${result.reason}.`}
        </div>
      ) : null}
      <details style={{ marginTop: 12 }}>
        <summary className="small">Show entries</summary>
        <div style={{ marginTop: 8 }}>
          {brief.ledger.map((e) => (
            <div key={e.seq} className="ledger-row">
              <div className="mono muted">#{e.seq}</div>
              <div className="kind small">
                <span className="chip">{e.kind.replace("_", " ")}</span>
              </div>
              <div className="body">
                <div>{e.summary}</div>
                <details>
                  <summary className="small muted">
                    detail · <span className="hash">{e.hash.slice(0, 20)}…</span>
                  </summary>
                  <pre className="json">{JSON.stringify(e.detail, null, 2)}</pre>
                  <div className="hash">prev {e.prevHash}</div>
                  <div className="hash">hash {e.hash}</div>
                </details>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export function EvidenceTab({ brief, canEdit }: { brief: Brief; canEdit: boolean }) {
  const report = evidenceReport(brief);
  return (
    <div className="stack">
      <div className="grid4">
        {(
          [
            ["evidence_supported", "Backed by Qloo evidence"],
            ["derived", "Answer or constraint"],
            ["client_stated", "Client's own words"],
            ["unsupported", "Unsupported"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="card">
            <div className="eyebrow">{label}</div>
            <div className="stat">{report.counts[k]}</div>
          </div>
        ))}
      </div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <Words brief={brief} />
        <section className="card">
          <div className="eyebrow">Atmosphere fingerprint</div>
          <p className="small muted">
            Places Qloo ranks highest for people who love what {brief.input.clientLabel} loves ({brief.crowdVenues.length}), compared with typical {brief.input.city} places ({brief.baseVenues.length}).
          </p>
          <Fingerprint dims={brief.dimensions} city={brief.input.city} />
        </section>
      </div>
      <CounterTest brief={brief} />
      <Resolutions brief={brief} canEdit={canEdit} />
      <Places brief={brief} />
      {brief.trace?.length ? <TracePanel brief={brief} /> : null}
      <Replay brief={brief} />
      <Ledger brief={brief} />
    </div>
  );
}
