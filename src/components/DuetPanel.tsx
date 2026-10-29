"use client";

import { useEffect, useState } from "react";
import { RoomStage } from "./brief/RoomStage";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import type { Duet } from "@/lib/studio";

const VERDICT: Record<Duet["lines"][number]["verdict"], string> = { agree: "agree", "leans A": "leans", "leans B": "leans", "middle ground": "middle ground" };

/** Two people, one room: merge two briefs into one spec and show where they agree, clash and meet. */
export function DuetPanel({ a, b }: { a: string; b: string }) {
  const [duet, setDuet] = useState<Duet>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    let live = true;
    fetch("/api/duet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b }) })
      .then(async (r) => {
        const j = (await r.json()) as { duet?: Duet; error?: string };
        if (!live) return;
        if (j.duet) setDuet(j.duet);
        else setErr(j.error ?? "Couldn't merge these briefs.");
      })
      .catch((e) => live && setErr(String(e)));
    return () => {
      live = false;
    };
  }, [a, b]);
  if (err) return <div className="note section">{err}</div>;
  if (!duet) return <div className="skeleton section" style={{ height: 120 }} />;
  const short = (ids: string[]) => ids.map((id) => DIMENSION_BY_ID[id as keyof typeof DIMENSION_BY_ID].short.toLowerCase()).join(", ");
  return (
    <section className="card section" style={{ borderColor: "var(--amber)" }}>
      <div className="panel-title">
        <div>
          <div className="eyebrow amber">Duet · two people, one room</div>
          <h2 style={{ margin: 0 }}>
            {duet.a.name} and {duet.b.name}, together
          </h2>
        </div>
        <span className="pill plain">taste similarity {duet.agreement.toFixed(2)}</span>
      </div>
      <p className="small muted">
        Both people&apos;s measured atmospheres, weighted equally; both people&apos;s words and hard constraints kept. No new Qloo calls.
        {duet.shared.length ? ` Shared ground: ${short(duet.shared)}.` : " No atmosphere both lean toward strongly."}
        {duet.pulls.filter((p) => p.toward.length).map((p) => ` ${p.name} pulls toward ${short(p.toward)}.`)}
      </p>
      <div className="brief-hero">
        <RoomStage spec={duet.lines.map((l) => ({ id: l.lineId, value: l.together }))} dims={duet.dims} trade={duet.trade} room={duet.room} label="The shared room, drawn from the merged spec" />
        <div className="scroll-x">
          <table className="table" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Line</th>
                <th>Together</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {duet.lines.map((l) => (
                <tr key={l.lineId}>
                  <td className="small">
                    <b>{l.category}</b>
                  </td>
                  <td className="small">
                    {l.together}
                    {l.verdict !== "agree" ? (
                      <div className="tiny muted">
                        {duet.a.name}: {clip(l.a)} · {duet.b.name}: {clip(l.b)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`pill ${l.verdict === "agree" ? "good" : l.verdict === "middle ground" ? "amber" : "warn"}`}>
                      {VERDICT[l.verdict]}
                      {l.verdict === "leans A" ? ` ${duet.a.name}` : l.verdict === "leans B" ? ` ${duet.b.name}` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function clip(s: string, n = 44) {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}
