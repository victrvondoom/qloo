"use client";

import { useEffect, useMemo, useState } from "react";
import { readNdjson } from "./api";
import { buildDeepBrief, type DeepBrief } from "@/lib/deep/build";
import { applyProse, type DeepProse, type ProseField } from "@/lib/deep/prose";
import { ROOM_LABEL } from "@/lib/rulebooks";
import { ExportBar, LightClock, QuantityCalculator } from "./StudioTools";
import type { Brief } from "@/lib/types";

const BASIS: Record<string, string> = { spec: "spec", evidence: "evidence", client: "client", rule_of_thumb: "rule of thumb" };
const ROLE: Record<string, string> = { ambient: "Ambient", task: "Task", accent: "Accent", decorative: "Decorative", night: "Night" };

export function HandOver({ deep, roomLabel }: { deep: DeepBrief & { prose?: { model: string; stale: boolean; fields: ProseField[] } }; roomLabel: string }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card pad-lg">
        <div className="eyebrow amber">Direction · {deep.subtitle}</div>
        <h2 className="serif" style={{ fontSize: "clamp(30px, 4vw, 44px)", fontStyle: "italic", fontWeight: 450, margin: "4px 0 12px" }}>
          {deep.title}
        </h2>
        <p className="lede" style={{ maxWidth: 820 }}>{deep.summary}</p>
        <div className="row tight">
          {deep.keywords.map((k) => (
            <span key={k} className="chip amber">{k}</span>
          ))}
          <span className="chip">{deep.depthLabel} references</span>
        </div>
      </section>

      {deep.decoded.length ? (
        <section className="card">
          <div className="eyebrow">What their words mean here</div>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>They said</th>
                  <th>Dictionary sense</th>
                  <th>For this client</th>
                </tr>
              </thead>
              <tbody>
                {deep.decoded.map((w) => (
                  <tr key={w.word} className={w.changed ? "changed" : undefined}>
                    <td className="serif" style={{ fontStyle: "italic", fontSize: 17 }}>“{w.word}”</td>
                    <td className="muted">{w.literal ?? "—"}</td>
                    <td>
                      {w.means ?? "not mapped"} {w.changed ? <span className="pill amber">not the literal sense</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="panel-title">
          <div>
            <div className="eyebrow">Scenes</div>
            <h3 style={{ margin: 0 }}>How the {roomLabel.toLowerCase()} changes through the day</h3>
          </div>
          <span className="small muted">From the colour-temperature and dimming lines</span>
        </div>
        <div className="scenes">
          {deep.scenes.map((s) => (
            <div key={s.id} className="scene">
              <span className="glow" style={{ background: s.hex }} aria-hidden="true" />
              <div className="row between">
                <b className="serif" style={{ fontSize: 19 }}>{s.label}</b>
                <span className="k">
                  {s.percent}% · {s.kelvin}K
                </span>
              </div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>{s.use}</p>
            </div>
          ))}
        </div>
        {deep.sceneTable.length ? (
          <div className="scroll-x" style={{ marginTop: 16 }}>
            <table className="table heat">
              <thead>
                <tr>
                  <th>Zone</th>
                  {deep.scenes.map((s) => (
                    <th key={s.id} className="num">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deep.sceneTable.map((r) => (
                  <tr key={r.zone}>
                    <td>{r.zone}</td>
                    {r.levels.map((lv, i) => (
                      <td key={i} className="lvl" style={{ minWidth: 130 }}>
                        <i aria-hidden="true">
                          <b style={{ width: `${lv}%` }} />
                        </i>
                        {lv}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted" style={{ marginTop: 6 }}>Scene programming: output per zone in each scene, from the drawn room model. Night lights sit outside the scenes.</p>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="panel-title">
          <div>
            <div className="eyebrow">{deep.fixtureFamily ? "Zones" : "Surfaces"}</div>
            <h3 style={{ margin: 0 }}>{deep.fixtureFamily ? "Where the light goes" : "What goes where"}</h3>
          </div>
          {deep.fixtureFamily ? <span className="small muted" style={{ maxWidth: 420 }}>Fixture family: {deep.fixtureFamily}</span> : null}
        </div>
        <div className="zones">
          {deep.zones.map((z) => (
            <div key={z.name} className="zone">
              {deep.fixtureFamily ? <div className="role">{ROLE[z.role]}</div> : <div className="role">from the {z.uses.join(", ")} line</div>}
              <h4>{z.name}</h4>
              {z.purpose ? <p className="small muted" style={{ margin: "0 0 6px" }}>{z.purpose}</p> : null}
              <div className="plan">{z.plan}</div>
              {z.guidance ? <div className="guide">Rule of thumb: {z.guidance}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="panel-title">
          <div>
            <div className="eyebrow">Palette</div>
            <h3 style={{ margin: 0 }}>Surfaces and light</h3>
          </div>
          <span className="small muted">Drawn from the leading atmospheres; confirm with physical samples</span>
        </div>
        <div className="swatches">
          {deep.palette.map((p) => (
            <div key={p.role} className="swatch">
              <div className="c" style={{ background: p.hex }} />
              <div className="l">
                <b>{p.name}</b>
                <span>
                  {p.role} · {p.hex}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="row tight" style={{ marginTop: 12 }}>
          {deep.scenes.map((s) => (
            <span key={s.id} className="chip">
              <i style={{ width: 12, height: 12, borderRadius: 3, background: s.hex, display: "inline-block", border: "1px solid var(--line)" }} />
              {s.label} light {s.kelvin}K
            </span>
          ))}
        </div>
      </section>

      {deep.references.length ? (
        <section className="card">
          <div className="panel-title">
            <div>
              <div className="eyebrow">Reference places · {deep.depthLabel}</div>
              <h3 style={{ margin: 0 }}>Rooms their taste already chooses</h3>
            </div>
            <span className="small muted">Visit one together; it settles more than a mood board</span>
          </div>
          <div className="refs">
            {deep.references.map((r) => (
              <div key={r.entity_id} className="ref">
                <h4>{r.name}</h4>
                <div className="meta">
                  {r.city ?? ""}
                  {r.popularity !== undefined ? ` · popularity ${r.popularity.toFixed(2)}` : ""}
                </div>
                <div className="small">{r.why}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid2" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="eyebrow">What to buy · categories, no brands</div>
          <div className="scroll-x">
            <table className="table" style={{ minWidth: 0 }}>
              <tbody>
                {deep.shopping.map((s, i) => (
                  <tr key={i}>
                    <td style={{ width: "38%" }}>
                      <b className="small">{s.item}</b>
                      <div className="tiny muted">{s.qty}</div>
                    </td>
                    <td className="small">
                      {s.spec}
                      <div className="tiny muted">{BASIS[s.basis]}{s.ref ? ` · ${s.ref}` : ""}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <div className="eyebrow">For the installer</div>
          <ul className="check-list">
            {deep.checklist.map((c, i) => (
              <li key={i}>
                <span>
                  {c.item} <span className="tiny muted">({BASIS[c.basis]})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** The hand-over: built in the browser from the brief (no calls), optionally with Claude prose checked against the facts. */
export function DeepBriefView({ brief, canEdit, llm }: { brief: Brief; canEdit: boolean; llm: string | null }) {
  const deep = useMemo(() => buildDeepBrief(brief), [brief]);
  const [prose, setProse] = useState<DeepProse | null>(null);
  const [fields, setFields] = useState<ProseField[]>([]);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState<string>();
  const merged = applyProse(deep, prose);

  useEffect(() => {
    let live = true;
    fetch(`/api/briefs/${brief.id}/deep`)
      .then((r) => r.json())
      .then((j: { prose?: DeepProse | null }) => {
        if (live && j.prose) setProse(j.prose);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [brief.id]);

  const write = async () => {
    setWriting(true);
    setErr(undefined);
    setFields([]);
    try {
      const res = await fetch(`/api/briefs/${brief.id}/deep`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Failed (${res.status})`);
      await readNdjson(res, (e) => {
        if (e.type === "field") setFields((f) => [...f, e as unknown as ProseField]);
        if (e.type === "prose") setProse(e.prose as DeepProse);
        if (e.type === "error") setErr(String(e.message));
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  };

  const shown = writing ? fields : (merged.prose?.fields ?? []);
  return (
    <div>
      <div className="panel-title no-print">
        <div>
          <div className="eyebrow">Hand-over</div>
          <h2 style={{ margin: 0 }}>Everything after the spec</h2>
        </div>
        <div className="row">
          {canEdit && llm ? (
            <button type="button" className="btn sm" onClick={write} disabled={writing}>
              {writing ? "Writing in parallel…" : prose && !merged.prose?.stale ? "Rewrite prose with Claude" : "Write prose with Claude"}
            </button>
          ) : null}
          <button type="button" className="btn sm primary" onClick={() => window.print()}>
            Print / save PDF
          </button>
        </div>
      </div>
      <p className="small muted no-print" style={{ marginTop: -6 }}>
        Built from the brief itself: no extra calls. {llm ? `Claude (${llm}) can rewrite the direction, the client note and the reference lines; any number or name not in the brief's facts is rejected.` : "Add ANTHROPIC_API_KEY on the server for Claude-written prose (checked against the brief's facts)."}
        {merged.prose?.stale ? " Saved prose was written for an earlier version of this brief, so the template text is shown." : ""}
      </p>
      {shown.length ? (
        <div className="row tight no-print" style={{ marginBottom: 14 }}>
          {shown.map((f, i) => (
            <span key={i} className={`pill ${f.status === "model" ? "good" : f.status === "rejected" ? "warn" : "bad"}`} title={f.reason}>
              {f.field}: {f.status === "model" ? "written" : f.status}
              {f.reason ? ` · ${f.reason.slice(0, 60)}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {err ? <div className="err no-print" style={{ marginBottom: 12 }}>{err}</div> : null}
      <HandOver deep={merged} roomLabel={ROOM_LABEL[brief.input.room]} />
      <div className="stack section">
        <LightClock brief={brief} />
        <QuantityCalculator brief={brief} />
        <div className="no-print">
          <ExportBar brief={brief} deep={merged} />
        </div>
      </div>
      <section className="card section">
        <div className="panel-title">
          <div className="eyebrow">Note to {brief.input.clientLabel}</div>
          <span className="pill plain">{merged.clientNoteSource === "model" ? "written by Claude from the facts" : "template"}</span>
        </div>
        <p className="quote">{merged.clientNote}</p>
        <button type="button" className="btn sm no-print" onClick={() => navigator.clipboard?.writeText(merged.clientNote)}>
          Copy note
        </button>
      </section>
      {merged.risks.length ? (
        <section className="card section">
          <div className="eyebrow">Open questions and risks</div>
          {merged.risks.map((r, i) => (
            <div key={i} className="risk">
              <span className={`pill ${r.level === "warn" ? "bad" : r.level === "check" ? "warn" : "info"}`}>{r.level === "warn" ? "warning" : r.level}</span>
              <span>{r.text}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
