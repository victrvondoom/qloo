"use client";

import { useMemo, useState } from "react";
import type { DeepBrief } from "@/lib/deep/build";
import { dayClock, quantityPlan } from "@/lib/studio";
import type { Brief } from "@/lib/types";

/** 24-hour light clock: the scene, colour temperature and level on at each hour. */
export function LightClock({ brief }: { brief: Brief }) {
  const hours = useMemo(() => dayClock(brief), [brief]);
  const [hover, setHover] = useState<number>(20);
  const cx = 130;
  const cy = 130;
  const arc = (h: number, r0: number, r1: number) => {
    const a0 = ((h / 24) * 360 - 90) * (Math.PI / 180);
    const a1 = (((h + 1) / 24) * 360 - 90 - 0.8) * (Math.PI / 180);
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  const h = hours[hover];
  return (
    <section className="card">
      <div className="panel-title">
        <div>
          <div className="eyebrow">24-hour light clock</div>
          <h3 style={{ margin: 0 }}>What&apos;s on, hour by hour</h3>
        </div>
        <span className="small muted">From the dimming and colour-temperature lines</span>
      </div>
      <div className="clock-wrap">
        <svg viewBox="0 0 260 260" role="img" aria-label="A 24-hour clock of lighting scenes" className="clock">
          {hours.map((x) => (
            <path
              key={x.hour}
              d={arc(x.hour, 78, 122)}
              fill={x.hex}
              opacity={(0.25 + 0.75 * Math.min(1, x.percent / 100)).toFixed(2)}
              stroke={hover === x.hour ? "var(--ink)" : "none"}
              strokeWidth={1.5}
              onMouseEnter={() => setHover(x.hour)}
              onFocus={() => setHover(x.hour)}
              tabIndex={0}
            >
              <title>{`${String(x.hour).padStart(2, "0")}:00 · ${x.scene} · ${x.kelvin}K · ${x.percent}%`}</title>
            </path>
          ))}
          {hours.filter((x) => x.daylight).map((x) => <path key={`d${x.hour}`} d={arc(x.hour, 70, 75)} fill="#e3b341" />)}
          {[0, 6, 12, 18].map((t) => {
            const a = ((t / 24) * 360 - 90) * (Math.PI / 180);
            return (
              <text key={t} x={(cx + 54 * Math.cos(a)).toFixed(1)} y={(cy + 54 * Math.sin(a) + 4).toFixed(1)} textAnchor="middle" className="clock-tick">
                {String(t).padStart(2, "0")}
              </text>
            );
          })}
          <text x={cx} y={cy - 6} textAnchor="middle" className="clock-big">
            {String(h.hour).padStart(2, "0")}:00
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="clock-sub">
            {h.scene} · {h.kelvin}K · {h.percent}%
          </text>
        </svg>
        <ul className="clock-legend">
          {[...new Map(hours.map((x) => [x.scene, x])).values()].map((x) => (
            <li key={x.scene}>
              <i style={{ background: x.hex }} />
              <b>{x.scene}</b> {x.kelvin}K, {x.percent}%
            </li>
          ))}
          <li>
            <i style={{ background: "#e3b341" }} /> daylight hours
          </li>
        </ul>
      </div>
    </section>
  );
}

/** Lumen-method quantities for a room size. */
export function QuantityCalculator({ brief }: { brief: Brief }) {
  const [dims, setDims] = useState({ lengthM: 5.5, widthM: 4.2, heightM: 2.7 });
  const plan = useMemo(() => quantityPlan(brief, dims), [brief, dims]);
  if (brief.input.trade !== "lighting") return null;
  const field = (k: keyof typeof dims, label: string) => (
    <label className="field" style={{ margin: 0 }}>
      <span>{label}</span>
      <input type="text" inputMode="decimal" value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: Number(e.target.value.replace(",", ".")) || 0 })} />
    </label>
  );
  return (
    <section className="card">
      <div className="panel-title">
        <div>
          <div className="eyebrow">How many fittings</div>
          <h3 style={{ margin: 0 }}>Quantities for this room size</h3>
        </div>
        <span className="pill warn">estimate · lumen method</span>
      </div>
      <div className="grid3" style={{ gap: 10 }}>
        {field("lengthM", "Length (m)")}
        {field("widthM", "Width (m)")}
        {field("heightM", "Ceiling (m)")}
      </div>
      <div className="grid3 section" style={{ gap: 10, marginTop: 14 }}>
        <div className="card sunk">
          <div className="eyebrow">Target</div>
          <div className="stat" style={{ fontSize: 30 }}>{plan.targetLux} lx</div>
          <div className="tiny muted">{plan.areaM2} m²</div>
        </div>
        <div className="card sunk">
          <div className="eyebrow">Installed lumens</div>
          <div className="stat" style={{ fontSize: 30 }}>{plan.lumensInstalled.toLocaleString()}</div>
          <div className="tiny muted">{plan.lumensAtPlane.toLocaleString()} lm at the floor before losses</div>
        </div>
        <div className="card sunk">
          <div className="eyebrow">{plan.ambient.kind}</div>
          <div className="stat" style={{ fontSize: 30 }}>× {plan.ambient.count}</div>
          <div className="tiny muted">{plan.ambient.lumensEach} lm each · {plan.ambient.note}</div>
        </div>
      </div>
      {plan.extras.map((x) => (
        <p key={x.kind} className="small" style={{ margin: "10px 0 0" }}>
          + {x.kind}: <b>{x.count}</b> ({x.note})
        </p>
      ))}
      <details style={{ marginTop: 10 }}>
        <summary className="small muted">Assumptions</summary>
        <ul className="small muted">
          {plan.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** A 1200×630 share card: direction, words → meanings, palette, references and the drawn room. */
export async function moodCardPng(brief: Brief, deep: DeepBrief): Promise<Blob> {
  const roomSvg = document.querySelector(".room svg");
  const roomUri = roomSvg ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(roomSvg))))}` : "";
  const words = deep.decoded.slice(0, 3).map((w, i) => `<text x="64" y="${330 + i * 40}" font-family="Georgia,serif" font-size="24" fill="#efe7da"><tspan font-style="italic" fill="#e8a15a">“${esc(w.word)}”</tspan> → ${esc((w.means ?? "").slice(0, 46))}</text>`).join("");
  const swatches = deep.palette.map((p, i) => `<rect x="${64 + i * 82}" y="470" width="72" height="72" rx="10" fill="${p.hex}"/><text x="${64 + i * 82}" y="562" font-family="Helvetica,Arial" font-size="12" fill="#a99f90">${esc(p.name)}</text>`).join("");
  const refs = deep.references.slice(0, 4).map((r) => esc(r.name)).join(" · ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#15130f"/><rect width="1200" height="630" fill="url(#g)"/>
<defs><radialGradient id="g" cx="80%" cy="0%" r="90%"><stop offset="0" stop-color="#3a2614"/><stop offset="1" stop-color="#15130f" stop-opacity="0"/></radialGradient></defs>
<text x="64" y="86" font-family="Menlo,monospace" font-size="15" letter-spacing="3" fill="#e8a15a">FOR ${esc(brief.input.clientLabel.toUpperCase())} · ${esc(deep.subtitle.toUpperCase())}</text>
<text x="64" y="170" font-family="Georgia,serif" font-style="italic" font-size="72" fill="#efe7da">${esc(deep.title)}</text>
<text x="64" y="230" font-family="Helvetica,Arial" font-size="20" fill="#a99f90">${esc(deep.keywords.join(" · "))}</text>
${words}
${swatches}
<text x="64" y="604" font-family="Helvetica,Arial" font-size="14" fill="#a99f90">${refs ? `Rooms like this: ${refs}` : ""}${brief.dataMode === "fixture" ? "  ·  demo data" : ""}</text>
${roomUri ? `<rect x="660" y="120" width="480" height="330" rx="18" fill="#000"/><image x="660" y="120" width="480" height="330" href="${roomUri}" preserveAspectRatio="xMidYMid slice"/>` : ""}
<text x="1136" y="604" text-anchor="end" font-family="Georgia,serif" font-style="italic" font-size="20" fill="#e8a15a">Tastespec</text>
</svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("could not draw the card"))), "image/png"));
}

/** Exports and the share card. */
export function ExportBar({ brief, deep }: { brief: Brief; deep: DeepBrief }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const card = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      const blob = await moodCardPng(brief, deep);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tastespec-${brief.input.clientLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-card.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <div className="eyebrow">Take it with you</div>
      <div className="row">
        <a className="btn sm" href={`/api/briefs/${brief.id}/export?format=csv`}>
          Fixture schedule (CSV)
        </a>
        <a className="btn sm" href={`/api/briefs/${brief.id}/export?format=json`}>
          Spec (JSON)
        </a>
        <a className="btn sm" href={`/api/briefs/${brief.id}/bundle`}>
          Evidence bundle
        </a>
        <button type="button" className="btn sm primary" onClick={card} disabled={busy}>
          {busy ? "Drawing…" : "Mood card (PNG)"}
        </button>
      </div>
      {err ? <div className="err" style={{ marginTop: 8 }}>{err}</div> : null}
      <p className="tiny muted" style={{ margin: "8px 0 0" }}>The schedule carries colour temperature, rendering and control requirements per item, plus the ledger head so it can be checked against the evidence.</p>
    </section>
  );
}
