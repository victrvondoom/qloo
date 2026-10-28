"use client";

import { useState } from "react";
import { postBrief } from "./api";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import { popularityCaps } from "@/lib/depth";
import type { Brief, DepthLayer } from "@/lib/types";

const LEVELS: { level: 0 | 1 | 2; name: string; desc: string }[] = [
  { level: 0, name: "Mainstream", desc: "Where their taste neighbourhood goes most" },
  { level: 1, name: "Curated", desc: "Same taste, below-median popularity" },
  { level: 2, name: "Deep cut", desc: "Same taste, the least-known quarter" },
];

function topOf(layer?: DepthLayer) {
  return layer?.usable ? [...layer.dimensions].sort((a, b) => b.score - a.score).filter((d) => d.score > 0.15).slice(0, 2) : [];
}

/**
 * Progressively niche. Each level asks Qloo the same taste question restricted
 * to less popular places, crowd and city baseline alike, so the comparison
 * stays fair. Exploring costs a few Qloo calls; using a level rebuilds the spec.
 */
export function DepthLadder({ brief, canEdit, onBrief }: { brief: Brief; canEdit: boolean; onBrief: (b: Brief, changed: string[], note: string) => void }) {
  const [view, setView] = useState<0 | 1 | 2>(brief.appliedDepth ?? 0);
  const [busy, setBusy] = useState<number>();
  const [err, setErr] = useState<string>();
  const caps = popularityCaps(brief.crowdVenues);
  const usable = brief.status === "COMPLETE" || brief.status === "NEEDS_CLARIFICATION";
  const layer = brief.depth?.find((d) => d.level === view);
  const applied = brief.appliedDepth ?? 0;

  const explore = async (level: 0 | 1 | 2, apply: boolean) => {
    setBusy(level);
    setErr(undefined);
    try {
      const r = await postBrief(`/api/briefs/${brief.id}/depth`, { level, apply });
      onBrief(r.brief, r.changed ?? [], apply ? (r.changed?.length ? `${r.changed.length} line${r.changed.length > 1 ? "s" : ""} changed at ${LEVELS[level].name}` : `Spec unchanged at ${LEVELS[level].name}`) : `${LEVELS[level].name} explored`);
      setView(level);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  if (!usable) return null;
  return (
    <div className="card">
      <div className="panel-title">
        <div>
          <div className="eyebrow">Go deeper</div>
          <h3 style={{ margin: 0 }}>Same taste, less obvious places</h3>
        </div>
        <span className="pill plain">spec uses: {LEVELS[applied].name}</span>
      </div>
      <div className="depth" role="group" aria-label="Depth levels">
        {LEVELS.map((l) => {
          const lay = brief.depth?.find((d) => d.level === l.level);
          const cap = l.level === 0 ? undefined : caps[l.level];
          const top = topOf(lay);
          return (
            <button
              key={l.level}
              type="button"
              aria-pressed={view === l.level}
              disabled={busy !== undefined || (l.level > 0 && cap === undefined)}
              onClick={() => (lay || l.level === 0 ? setView(l.level) : canEdit ? explore(l.level, false) : undefined)}
              title={l.desc}
            >
              <span className="lv">
                Level {l.level}
                {applied === l.level ? " · in spec" : ""}
              </span>
              <span className="nm">{l.name}</span>
              <span className="ds">{busy === l.level ? "Asking Qloo…" : lay ? (top.length ? top.map((d) => DIMENSION_BY_ID[d.id].short).join(" + ") : lay.usable ? "no clear lean" : "too few places") : cap !== undefined ? `popularity ≤ ${cap.toFixed(2)} · ${canEdit ? "explore" : "not explored"}` : "no popularity data"}</span>
              <span className="meter" aria-hidden="true">
                <i style={{ width: `${l.level === 0 ? 100 : Math.round((cap ?? 0) * 100)}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      {layer ? (
        <div style={{ marginTop: 14 }}>
          <div className="small muted">
            {layer.level === 0 ? "The main run." : `Popularity ≤ ${layer.popularityMax?.toFixed(2)} on both sides (${layer.method === "api_filter" ? "Qloo filter" : "filtered locally"}).`}{" "}
            {layer.crowdN} taste-matched vs {layer.baseN} typical places.
            {layer.note ? ` ${layer.note}` : ""}
          </div>
          {layer.references.length ? (
            <div className="row tight" style={{ marginTop: 10 }}>
              {layer.references.slice(0, 6).map((r) => (
                <span key={r.entity_id} className="chip" title={r.terms.join(", ")}>
                  {r.name}
                  {r.popularity !== undefined ? <span className="faint num">{r.popularity.toFixed(2)}</span> : null}
                </span>
              ))}
            </div>
          ) : null}
          {canEdit && layer.usable && applied !== layer.level ? (
            <button type="button" className="btn sm primary" style={{ marginTop: 12 }} disabled={busy !== undefined} onClick={() => explore(layer.level, true)}>
              Use {LEVELS[layer.level].name} for the spec
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
