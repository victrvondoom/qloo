"use client";

import { useState } from "react";
import { postBrief } from "./api";
import { DIMENSIONS, DIMENSION_BY_ID } from "@/lib/dimensions";
import type { Brief, DimensionId } from "@/lib/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Cell({ v }: { v: number }) {
  const a = Math.min(1, Math.abs(v));
  return (
    <td className="heat-cell" title={v.toFixed(2)}>
      <span style={{ background: v >= 0 ? "var(--pos)" : "var(--neg)", opacity: a < 0.05 ? 0.06 : 0.15 + 0.85 * a }} />
      <i>{Math.abs(v) >= 0.15 ? v.toFixed(1) : ""}</i>
    </td>
  );
}

/** Taste Anatomy: the client's taste taken apart by domain and put back together, measured. */
export function AnatomyPanel({ brief, canEdit, onBrief }: { brief: Brief; canEdit: boolean; onBrief: (b: Brief) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const a = brief.anatomy;
  const used = brief.resolutions.filter((r) => r.usedAsSignal).length;
  const personal = brief.status === "COMPLETE" || brief.status === "NEEDS_CLARIFICATION";
  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      onBrief((await postBrief(`/api/briefs/${brief.id}/anatomy`, {})).brief);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const name = (id: string) => a?.facets.find((f) => f.entity_id === id)?.name ?? id;
  const short = (d: DimensionId) => DIMENSION_BY_ID[d].short;

  return (
    <div className="stack">
      <div className="panel-title">
        <div>
          <div className="eyebrow amber">Taste anatomy · cross-domain, measured</div>
          <h2 style={{ margin: 0 }}>{brief.input.clientLabel}&apos;s taste, taken apart by domain</h2>
        </div>
        {canEdit && personal && used >= 2 ? (
          <button type="button" className="btn primary sm" onClick={run} disabled={busy}>
            {busy ? "Asking Qloo about each facet…" : a ? "Run again" : `Run anatomy (~${used * 3 + 1} Qloo queries)`}
          </button>
        ) : null}
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>
        Each thing they love is sent to Qloo on its own, so music, screen and places can be compared; then the evidence is resampled to see which lines are solid. Nothing here changes
        the spec.
      </p>
      {err ? <div className="err">{err}</div> : null}
      {!personal || used < 2 ? <p className="muted">Needs at least two resolved references and usable evidence.</p> : null}
      {!a && personal && used >= 2 && !canEdit ? <p className="muted">Not run yet.</p> : null}
      {a ? (
        <>
          <div className="grid4">
            <div className="card">
              <div className="eyebrow">Coherence</div>
              <div className="stat">{a.coherence.toFixed(2)}</div>
              <div className="small muted">mean agreement between facets (1 = all point one way)</div>
            </div>
            <div className="card">
              <div className="eyebrow">Niche index</div>
              <div className="stat">{a.niche.index}</div>
              <div className="small muted">{a.niche.reading}</div>
            </div>
            <div className="card">
              <div className="eyebrow">Consensus core</div>
              <div className="stat">{a.core.n}</div>
              <div className="small muted">
                places chosen by ≥{a.core.threshold} of {a.core.of} facets independently
              </div>
            </div>
            <div className="card">
              <div className="eyebrow">Solid lines</div>
              <div className="stat">
                {a.stability.lines.filter((l) => l.stable >= 0.9).length}/{a.stability.lines.length}
              </div>
              <div className="small muted">survive ≥90% of {a.stability.samples} resamples of the evidence</div>
            </div>
          </div>

          <section className="card">
            <div className="eyebrow">1 · Facets: each love alone, against typical {brief.input.city}</div>
            <div className="scroll-x">
              <table className="table heatmap">
                <thead>
                  <tr>
                    <th>Facet</th>
                    {DIMENSIONS.map((d) => (
                      <th key={d.id} title={d.label}>
                        {d.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.facets.map((f) => (
                    <tr key={f.entity_id}>
                      <td>
                        <b className="small">{f.name}</b>
                        <div className="tiny muted">
                          {f.domain} · {f.crowdN} places{f.usable ? "" : " · too few"}
                        </div>
                      </td>
                      {DIMENSIONS.map((d) => (
                        <Cell key={d.id} v={f.vector[d.id]} />
                      ))}
                    </tr>
                  ))}
                  {a.core.vector ? (
                    <tr className="core-row">
                      <td>
                        <b className="small">Consensus core</b>
                        <div className="tiny muted">{a.core.n} shared places</div>
                      </td>
                      {DIMENSIONS.map((d) => (
                        <Cell key={d.id} v={a.core.vector![d.id]} />
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="legend">
              <span>
                <i style={{ background: "var(--pos)" }} />
                more common than typical places
              </span>
              <span>
                <i style={{ background: "var(--neg)" }} />
                less common
              </span>
            </div>
          </section>

          <div className="grid2" style={{ alignItems: "start" }}>
            <section className="card">
              <div className="eyebrow">2 · Agreement between facets</div>
              <div className="stack" style={{ gap: 6 }}>
                {[...a.agreement]
                  .sort((x, y) => y.cosine - x.cosine)
                  .map((p) => (
                    <div key={`${p.a}-${p.b}`} className="agree-row">
                      <span className="small">
                        {name(p.a)} · {name(p.b)}
                      </span>
                      <span className="agree-bar" aria-hidden="true">
                        <i style={{ left: p.cosine >= 0 ? "50%" : `${50 + p.cosine * 50}%`, width: `${Math.abs(p.cosine) * 50}%`, background: p.cosine >= 0 ? "var(--pos)" : "var(--neg)" }} />
                      </span>
                      <span className="mono tiny">{p.cosine.toFixed(2)}</span>
                    </div>
                  ))}
              </div>
            </section>
            <section className="card" style={{ borderColor: a.conflict ? "var(--amber)" : undefined }}>
              <div className="eyebrow amber">3 · Conflict · 5 · bridge rooms</div>
              {a.conflict ? (
                <>
                  <h3>
                    {name(a.conflict.a)} pulls toward {short(a.conflict.aLeans).toLowerCase()}; {name(a.conflict.b)} toward {short(a.conflict.bLeans).toLowerCase()}.
                  </h3>
                  <p className="small muted">Agreement {a.conflict.cosine.toFixed(2)}. Asked together, Qloo finds the places where both tastes meet:</p>
                  <div className="row tight">
                    {a.bridge?.places.map((p) => (
                      <span key={p.entity_id} className={`chip${p.inBoth ? " amber" : ""}`} title={p.dimensions.map(short).join(", ")}>
                        {p.name}
                        {p.inBoth ? " · in both" : ""}
                      </span>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
                    “In both” = also chosen by each facet on its own. Good rooms to show a client, or a couple, whose tastes pull apart.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0 }}>No facets pull against each other: every pair agrees above 0.5.</p>
              )}
            </section>
          </div>

          <section className="card">
            <div className="eyebrow">4 · Consensus core: rooms their whole taste agrees on</div>
            <div className="refs">
              {a.core.places.map((p) => (
                <div key={p.entity_id} className="ref">
                  <h4>{p.name}</h4>
                  <div className="meta">
                    {p.votes} of {a.core.of} facets{p.city ? ` · ${p.city}` : ""}
                    {p.popularity !== undefined ? ` · popularity ${p.popularity.toFixed(2)}` : ""}
                  </div>
                  <div className="small">{p.dimensions.map(short).join(", ") || "—"}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="eyebrow">6 · Stability · 7 · flip distance · 8 · domain agreement</div>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Survives resampling</th>
                    <th className="num">Flip distance</th>
                    <th className="num">Domains agreeing</th>
                    <th>Next most likely</th>
                  </tr>
                </thead>
                <tbody>
                  {a.stability.lines.map((l) => {
                    const f = a.flip.find((x) => x.lineId === l.lineId);
                    const d = a.lineDomains.find((x) => x.lineId === l.lineId);
                    return (
                      <tr key={l.lineId}>
                        <td>
                          <b className="small">{l.category}</b>
                          <div className="tiny muted">{l.value}</div>
                        </td>
                        <td style={{ minWidth: 150 }}>
                          <span className="stab-bar">
                            <i style={{ width: pct(l.stable), background: l.stable >= 0.9 ? "var(--good)" : l.stable >= 0.6 ? "var(--amber)" : "var(--bad)" }} />
                          </span>
                          <span className="mono tiny"> {pct(l.stable)}</span>
                        </td>
                        <td className="num small" title={f?.reason ?? (f?.toValue ? `becomes: ${f.toValue}` : "")}>
                          {f?.places ? `${f.places} place${f.places > 1 ? "s" : ""}` : f?.reason?.startsWith("held") || f?.reason?.startsWith("decided") ? "rule/words" : ">12"}
                        </td>
                        <td className="num small">
                          {d?.agree}/{d?.of}
                        </td>
                        <td className="tiny muted">{l.alternatives[0] ? `${l.alternatives[0].value} (${pct(l.alternatives[0].share)})` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              Flip distance: how many of the strongest places would have to stop reading as the line&apos;s driving atmosphere before the value changes. Domains agreeing: of the specs built
              from {a.domains.map((x) => x.domain).join(", ")} alone, how many give the same value.
            </p>
          </section>

          <div className="grid2" style={{ alignItems: "start" }}>
            <section className="card">
              <div className="eyebrow">8 · What each domain alone would build</div>
              {a.domains.map((d) => (
                <div key={d.domain} className="risk">
                  <span className="pill plain">{d.agrees}/7</span>
                  <span className="small">
                    <b>{d.domain}</b> ({d.facets.join(", ")})
                    {d.spec
                      .filter((x) => a.stability.lines.find((l) => l.lineId === x.lineId)?.value !== x.value)
                      .slice(0, 2)
                      .map((x) => (
                        <div key={x.lineId} className="tiny muted">
                          {a.stability.lines.find((l) => l.lineId === x.lineId)?.category}: {x.value}
                        </div>
                      ))}
                  </span>
                </div>
              ))}
            </section>
            <section className="card">
              <div className="eyebrow">9 · Two evidence channels · 10 · niche</div>
              <div className="row tight" style={{ marginBottom: 12 }}>
                {a.corroboration
                  .filter((c) => c.status !== "neither")
                  .map((c) => (
                    <span key={c.id} className={`pill ${c.status === "both" ? "good" : "warn"}`} title={`places ${c.place.toFixed(2)} · tags ${pct(c.tags)}`}>
                      {short(c.id)}: {c.status}
                    </span>
                  ))}
              </div>
              <p className="small" style={{ margin: 0 }}>
                Place evidence and Qloo&apos;s cross-domain taste tags are independent channels; “both” means each supports the atmosphere on its own. Niche index {a.niche.index}: the
                atmosphere mix of their taste neighbourhood diverges from the city by {a.niche.jsd.toFixed(2)} bits (Jensen–Shannon)
                {a.niche.crowdPopularity !== undefined && a.niche.basePopularity !== undefined ? `, and its places average popularity ${a.niche.crowdPopularity.toFixed(2)} vs ${a.niche.basePopularity.toFixed(2)} for typical places` : ""}.
                {a.niche.recommendDepth ? ` Suggests going deeper (level ${a.niche.recommendDepth}).` : ""}
              </p>
            </section>
          </div>
          <p className="tiny muted">
            {a.evidence.length} ledger entries · {new Date(a.computedAt).toLocaleString()}
          </p>
        </>
      ) : null}
    </div>
  );
}
