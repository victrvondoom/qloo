"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RoomRender } from "../RoomRender";
import { cctRange, kelvinToRgb, roomVisualAt, scenePosition, scenesOf, type SceneId } from "@/lib/render";
import type { DimensionId, RoomType, SpecLine, Trade } from "@/lib/types";

const K_MIN = 1800;
const K_MAX = 5000;
const kPct = (k: number) => `${(((Math.max(K_MIN, Math.min(K_MAX, k)) - K_MIN) / (K_MAX - K_MIN)) * 100).toFixed(2)}%`;
const LAYER_TEXT = { lamps: "lamps and wall-washers", even: "even ambient wash", concealed: "concealed sources", track: "surface track" } as const;
const FIXTURE_TEXT = { vintage: "opal glass, aged brass", minimal: "flush, trimless", industrial: "steel and enamel", natural: "paper, rattan, linen", luxe: "alabaster and brass" } as const;
const OPTICS_TEXT = { accent: "narrow accent beams", sparkle: "mixed beams, some sparkle", grid: "regular 36° grid", lowglare: "deep low-glare optics" } as const;
const GRADIENT = `linear-gradient(90deg, ${[1800, 2200, 2700, 3000, 3500, 4000, 5000].map((k) => `${kelvinToRgb(k)} ${kPct(k)}`).join(", ")})`;

/** The room drawn from the spec, with the spec's own scenes and a continuous dimmer between them. */
export function RoomStage({
  spec,
  dims,
  trade,
  room,
  scene = "evening",
  showControls = true,
  label,
}: {
  spec: Pick<SpecLine, "id" | "value">[];
  dims?: { id: DimensionId; score: number }[];
  trade: Trade;
  room: RoomType;
  scene?: SceneId;
  showControls?: boolean;
  label?: string;
}) {
  const scenes = useMemo(() => scenesOf(spec), [spec]);
  const start = scenes.some((s) => s.id === scene) ? scene : scenes[0].id;
  const [pos, setPos] = useState(() => scenePosition(spec, start));
  const raf = useRef<number | undefined>(undefined);
  const visual = useMemo(() => roomVisualAt({ spec, dims, trade, room, position: pos }), [spec, dims, trade, room, pos]);
  const cct = cctRange(spec);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  const glideTo = (target: number) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const from = pos;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let t0: number | undefined;
    const step = (t: number) => {
      t0 ??= t;
      const k = reduce ? 1 : Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setPos(from + (target - from) * e);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const active = scenes.reduce((best, s) => (Math.abs(scenePosition(spec, s.id) - pos) < Math.abs(scenePosition(spec, best.id) - pos) ? s : best), scenes[0]);

  return (
    <div>
      <div className="room">
        <RoomRender visual={visual} room={room} label={label} />
        <span className="cap">{visual.caption}</span>
      </div>
      {showControls ? (
        <div className="dimmer">
          <div className="row between">
            <div className="segmented" role="group" aria-label="Scenes from the dimming line">
              {scenes.map((s) => (
                <button key={s.id} type="button" aria-pressed={active.id === s.id} onClick={() => glideTo(scenePosition(spec, s.id))}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="small muted num">
              {visual.kelvin}K · dimmer {visual.percent}%
            </span>
          </div>
          <label className="sr-only" htmlFor={`dim-${room}`}>
            Dimmer
          </label>
          <input id={`dim-${room}`} type="range" min={0} max={1000} value={Math.round(pos * 1000)} onChange={(e) => setPos(Number(e.target.value) / 1000)} />
          <div>
            <div className="kelvin" style={{ background: GRADIENT }} role="img" aria-label={`Colour temperature scale; the spec runs ${cct.dimmed}K to ${cct.day}K${cct.task ? `, task ${cct.task}K` : ""}; now ${visual.kelvin}K`}>
              <span className="range" style={{ left: kPct(Math.min(cct.day, cct.dimmed)), width: `calc(${kPct(Math.max(cct.day, cct.dimmed))} - ${kPct(Math.min(cct.day, cct.dimmed))} + 4px)` }} />
              {cct.task ? <span className="mark" data-k={`task ${cct.task}K`} style={{ left: kPct(cct.task), background: "var(--muted)" }} /> : null}
              <span className="mark" data-k={`${visual.kelvin}K`} style={{ left: kPct(visual.kelvin) }} />
            </div>
            <div className="kelvin-scale" aria-hidden="true">
              <span>1800K candle</span>
              <span>2700K warm</span>
              <span>3500K neutral</span>
              <span>5000K daylight</span>
            </div>
          </div>
          <div className="row tight" style={{ marginTop: 4 }} aria-label="What the drawing is built from">
            <span className="tiny muted">Drawn from the spec:</span>
            <span className="chip" style={{ fontSize: 12 }}>{LAYER_TEXT[visual.layering]}</span>
            {trade === "lighting" ? <span className="chip" style={{ fontSize: 12 }}>{FIXTURE_TEXT[visual.fixture]}</span> : null}
            {trade === "lighting" ? <span className="chip" style={{ fontSize: 12 }}>{OPTICS_TEXT[visual.optics]}</span> : null}
            <span className="chip" style={{ fontSize: 12 }}>{cct.dimmed === cct.day ? `${cct.day}K` : `${cct.dimmed}–${cct.day}K dim-to-warm`}</span>
            <span className="chip" style={{ fontSize: 12 }}>{scenes.length} scenes</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
