"use client";

import { DIMENSION_BY_ID } from "@/lib/dimensions";
import type { DimensionScore } from "@/lib/types";

/** Diverging bars: blue = over-represented in the client's taste neighbourhood vs. the city, red = under. */
export function Fingerprint({ dims, city }: { dims: DimensionScore[]; city: string }) {
  const sorted = [...dims].sort((a, b) => b.score - a.score);
  return (
    <div>
      <div className="fp" role="img" aria-label="Atmosphere fingerprint: how much more or less often each kind of room appears among taste-matched places than among typical city places">
        {sorted.map((d) => {
          const pct = Math.abs(d.score) * 50;
          const tip = `${d.label}: ${d.crowdHits} of ${d.crowdN} taste-matched places vs ${d.baseHits} of ${d.baseN} typical ${city} places. Lift ×${d.lift.toFixed(2)}, P(higher) ${(d.pGreater * 100).toFixed(0)}%.${d.tasteTags.length ? ` Taste tags: ${d.tasteTags.map((t) => t.name).join(", ")}.` : ""}${d.clientAdjusted ? " Adjusted by the client's answer." : ""}`;
          return (
            <div className="row-hit" key={d.id} title={tip}>
              <div className="lbl">
                {DIMENSION_BY_ID[d.id].short}
                {d.clientAdjusted ? <span className="muted"> · client</span> : null}
              </div>
              <div className="track">
                {d.score !== 0 ? <div className={`bar ${d.score > 0 ? "pos" : "neg"}`} style={{ width: `${Math.max(pct, 1)}%` }} /> : null}
              </div>
              <div className="val">×{d.lift.toFixed(1)}</div>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--pos)" }} />More common in their taste neighbourhood</span>
        <span><i style={{ background: "var(--neg)" }} />Less common than typical {city}</span>
        <span>×lift = ratio of rates. Hover a row for counts.</span>
      </div>
      <details style={{ marginTop: 12 }}>
        <summary className="small muted">Table view</summary>
        <div className="scroll-x">
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Atmosphere</th>
                <th>Taste-matched</th>
                <th>Typical {city}</th>
                <th>Lift</th>
                <th>P(higher)</th>
                <th>Score</th>
                <th>Examples</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id}>
                  <td>{d.label}</td>
                  <td>{d.crowdHits}/{d.crowdN}</td>
                  <td>{d.baseHits}/{d.baseN}</td>
                  <td>×{d.lift.toFixed(2)}</td>
                  <td>{(d.pGreater * 100).toFixed(0)}%</td>
                  <td>{d.score.toFixed(2)}</td>
                  <td className="small">{d.exemplars.map((e) => e.name).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
