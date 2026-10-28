"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomRender } from "./RoomRender";
import type { DemoPair } from "@/lib/demo";
import { roomVisualAt } from "@/lib/render";
import type { DimensionId } from "@/lib/types";

// A 27-second film of what Tastespec does, drawn from real demo data (two
// clients on the synthetic world). Chapters: the brief → the literal reading →
// what they love → where their taste goes → two rooms → every line traced.

export const FILM_SECONDS = 27;
const CHAPTERS = [
  { at: 0, label: "The brief", caption: "Two clients. The same words." },
  { at: 4.5, label: "Taken literally", caption: "Taken literally, they get the same room." },
  { at: 8.5, label: "What they love", caption: "What they love is different." },
  { at: 12.5, label: "Where taste goes", caption: "Where people with their taste actually go, against typical Chicago." },
  { at: 17.5, label: "Two rooms", caption: "Same words. Two different rooms." },
  { at: 23, label: "Traced", caption: "Every line traced to evidence." },
];

const W = 960;
const H = 600;
const INK = "#efe7da";
const MUTED = "#a99f90";
const AMBER = "#e8a15a";
const DOT: Partial<Record<DimensionId, string>> = { low_glow: "#e8a15a", vintage_character: "#b46a45", clean_minimal: "#7fa3c8", bright_airy: "#d8c27a" };

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Opacity that fades in over [a, a+d] and out over [b-d, b]. */
const win = (t: number, a: number, b: number, d = 0.5) => Math.min(seg(t, a, a + d), 1 - seg(t, b - d, b));
const r1 = (x: number) => Math.round(x * 10) / 10;

function Bubble({ x, y, who, text, typed, o, highlight }: { x: number; y: number; who: string; text: string; typed: number; o: number; highlight: number }) {
  const shown = text.slice(0, Math.round(text.length * typed));
  const parts = shown.split(/(warm|modern)/);
  return (
    <g opacity={r1(o * 10) / 10} transform={`translate(${r1(x)} ${r1(y)})`}>
      <text x={0} y={-12} fill={MUTED} style={{ font: "500 13px var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {who}
      </text>
      <rect x={0} y={0} width={360} height={62} rx={18} fill="#24201b" stroke="#3a332b" />
      <text x={20} y={38} fill={INK} style={{ font: "400 18px var(--font-sans)" }}>
        {parts.map((p, i) =>
          p === "warm" || p === "modern" ? (
            <tspan key={i} fill={highlight > 0 ? AMBER : INK} fontStyle={highlight > 0 ? "italic" : undefined} style={{ fontFamily: highlight > 0 ? "var(--font-display)" : undefined }}>
              {p}
            </tspan>
          ) : (
            <tspan key={i}>{p}</tspan>
          ),
        )}
        {typed < 1 ? <tspan fill={AMBER}>▍</tspan> : null}
      </text>
    </g>
  );
}

export function HeroFilm({ demo, autoPlay = true, kiosk = false }: { demo: DemoPair; autoPlay?: boolean; kiosk?: boolean }) {
  const [t, setT] = useState(kiosk ? 0 : 19.2);
  const [playing, setPlaying] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const raf = useRef<number | undefined>(undefined);
  const last = useRef<number | undefined>(undefined);
  const visible = useRef(true);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (autoPlay && !reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- start the film after hydration (never on the server)
      setT(kiosk ? 0 : 0);
      setPlaying(true);
    }
  }, [autoPlay, kiosk]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const step = (now: number) => {
      const dt = last.current === undefined ? 0 : (now - last.current) / 1000;
      last.current = now;
      if (visible.current && dt < 0.25) setT((x) => (x + dt) % FILM_SECONDS);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = undefined;
    };
  }, [playing]);

  const chapter = [...CHAPTERS].reverse().find((c) => t >= c.at) ?? CHAPTERS[0];
  const seek = useCallback((x: number) => setT(clamp(x, 0, FILM_SECONDS - 0.01)), []);

  // Room positions for chapter 5: both dim from day to late together.
  const dim = 1 - ease(seg(t, 18.6, 22.4));
  const roomPos = t < 17.5 ? 1 : t > 23 ? 0.35 : dim;
  const showRooms = t >= 17 && t < FILM_SECONDS;
  const vm = useMemo(() => (showRooms ? roomVisualAt({ spec: demo.maya.spec, dims: demo.maya.dims, trade: demo.trade, room: demo.room, position: roomPos }) : undefined), [showRooms, demo, roomPos]);
  const vj = useMemo(() => (showRooms ? roomVisualAt({ spec: demo.jordan.spec, dims: demo.jordan.dims, trade: demo.trade, room: demo.room, position: roomPos }) : undefined), [showRooms, demo, roomPos]);

  const message = "We want the living room warm and modern.";
  const clients = [
    { c: demo.maya, x: 60, side: 0 },
    { c: demo.jordan, x: 540, side: 1 },
  ];
  const differing = demo.maya.spec.filter((l) => demo.jordan.spec.find((x) => x.id === l.id)?.value !== l.value).slice(0, 3);

  // chapter visibilities
  const oBubbles = win(t, 0.2, 8.9, 0.5);
  const bubbleY = 120 - 40 * ease(seg(t, 4.5, 5.5));
  const oLiteral = win(t, 5.2, 8.6, 0.6);
  const oLoves = win(t, 8.6, 13.4, 0.4);
  const oPlaces = win(t, 12.6, 17.6, 0.5);
  const collapse = ease(seg(t, 15, 16.4));
  const oRooms = win(t, 17.4, FILM_SECONDS, 0.6);
  const roomShrink = ease(seg(t, 23, 24.2));
  const oTrace = win(t, 23.2, FILM_SECONDS, 0.5);
  const oEnd = win(t, 25, FILM_SECONDS, 0.6);

  return (
    <div className="film" ref={wrap} style={kiosk ? { borderRadius: 0, border: 0, aspectRatio: "auto", width: "100vw", height: "100vh" } : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Animation, chapter ${CHAPTERS.indexOf(chapter) + 1} of 6: ${chapter.caption}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="film-glow" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#3a2614" />
            <stop offset="100%" stopColor="#15130f" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#film-glow)" />

        {/* caption */}
        <g>
          <text x={60} y={52} fill={AMBER} style={{ font: "500 12px var(--font-mono)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {`0${CHAPTERS.indexOf(chapter) + 1} · ${chapter.label}`}
          </text>
          <text x={60} y={84} fill={INK} style={{ font: "500 26px var(--font-display)", letterSpacing: "-0.01em" }} opacity={r1(seg(t - chapter.at, 0, 0.5) * 10) / 10}>
            {chapter.caption}
          </text>
        </g>

        {/* 1 · the brief */}
        {clients.map(({ c, x, side }) => (
          <Bubble key={c.name} x={x} y={bubbleY + 30} who={c.name} text={message} typed={ease(seg(t, 0.4 + side * 0.7, 2.4 + side * 0.7))} o={oBubbles} highlight={seg(t, 3.2, 3.6)} />
        ))}

        {/* 2 · taken literally */}
        {oLiteral > 0 ? (
          <g opacity={r1(oLiteral * 10) / 10}>
            <rect x={250} y={230} width={460} height={190} rx={18} fill="#1d1a16" stroke="#3a332b" />
            <text x={274} y={262} fill={MUTED} style={{ font: "500 11px var(--font-mono)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Taken literally · the same for both
            </text>
            {demo.maya.spec.slice(0, 4).map((l, i) => (
              <g key={l.id} opacity={r1(seg(t, 5.6 + i * 0.25, 6.0 + i * 0.25) * 10) / 10}>
                <text x={274} y={296 + i * 30} fill={MUTED} style={{ font: "500 12px var(--font-sans)" }}>
                  {l.category}
                </text>
                <text x={420} y={296 + i * 30} fill={INK} style={{ font: "400 13px var(--font-sans)" }}>
                  {l.literalValue.length > 40 ? `${l.literalValue.slice(0, 39)}…` : l.literalValue}
                </text>
              </g>
            ))}
            <path d="M250,325 C190,325 190,250 240,215" stroke={AMBER} strokeWidth={1.5} fill="none" strokeDasharray="4 4" opacity={0.7} />
            <path d="M710,325 C770,325 770,250 720,215" stroke={AMBER} strokeWidth={1.5} fill="none" strokeDasharray="4 4" opacity={0.7} />
          </g>
        ) : null}

        {/* 3 · what they love */}
        {oLoves > 0
          ? clients.map(({ c, x, side }) => (
              <g key={c.name} opacity={r1(oLoves * 10) / 10}>
                <text x={x} y={210} fill={MUTED} style={{ font: "500 12px var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {c.name} loves
                </text>
                {c.loves.slice(0, 5).map((l, i) => {
                  const p = ease(seg(t, 8.9 + side * 0.3 + i * 0.18, 9.5 + side * 0.3 + i * 0.18));
                  return (
                    <g key={l} opacity={r1(p * 10) / 10} transform={`translate(${r1(x + (1 - p) * (side ? 40 : -40))} ${232 + i * 44})`}>
                      <rect width={Math.min(330, 26 + l.length * 10.5)} height={34} rx={17} fill="#24201b" stroke="#3a332b" />
                      <text x={16} y={22} fill={INK} style={{ font: "400 16px var(--font-sans)" }}>
                        {l}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))
          : null}

        {/* 4 · where their taste goes: places → atmospheres */}
        {oPlaces > 0
          ? clients.map(({ c, x }) => (
              <g key={c.name} opacity={r1(oPlaces * 10) / 10}>
                <text x={x} y={150} fill={MUTED} style={{ font: "500 12px var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {c.name}&apos;s taste neighbourhood
                </text>
                {c.places.map((d, i) => {
                  const col = i % 6;
                  const row = Math.floor(i / 6);
                  const appear = ease(seg(t, 12.8 + i * 0.05, 13.4 + i * 0.05));
                  const gx = x + 30 + col * 54;
                  const gy = 200 + row * 50;
                  const target = c.top.findIndex((tp) => tp.id === d);
                  const tx = target >= 0 ? x + 10 + 8 * (i % 12) : gx;
                  const ty = target >= 0 ? 360 + target * 56 : gy;
                  const cx = gx + (tx - gx) * collapse;
                  const cy = gy + (ty - gy) * collapse;
                  return <circle key={i} cx={r1(cx)} cy={r1(cy)} r={r1(9 * appear * (target >= 0 ? 1 : 1 - collapse * 0.7))} fill={(d && DOT[d]) ?? "#5a524a"} opacity={target >= 0 ? 0.95 : 0.6 * (1 - collapse)} />;
                })}
                {c.top.map((tp, k) => {
                  const p = ease(seg(t, 15.8 + k * 0.2, 16.6 + k * 0.2));
                  const len = Math.min(300, 60 * tp.lift);
                  return (
                    <g key={tp.id} opacity={r1(p * 10) / 10}>
                      <rect x={x + 120} y={350 + k * 56} width={r1(len * p)} height={20} rx={4} fill={DOT[tp.id] ?? "#8a8178"} />
                      <text x={x + 120} y={342 + k * 56} fill={INK} style={{ font: "500 14px var(--font-sans)" }}>
                        {tp.short}
                      </text>
                      <text x={x + 128 + len * p} y={365 + k * 56} fill={INK} style={{ font: "500 13px var(--font-mono)" }}>
                        ×{tp.lift.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))
          : null}

        {/* 5 · two rooms, dimming together */}
        {oRooms > 0 && vm && vj
          ? clients.map(({ c, x, side }) => {
              const w = 380 - 120 * roomShrink;
              const h = w * (440 / 640);
              const rx = x + (side ? 0 : 0) + 120 * roomShrink * (side ? 0.5 : 0.5) - 10;
              const ry = 128 - 20 * roomShrink;
              return (
                <g key={c.name} opacity={r1(oRooms * 10) / 10}>
                  <rect x={r1(rx - 2)} y={r1(ry - 2)} width={r1(w + 4)} height={r1(h + 4)} rx={14} fill="#2b251f" />
                  <svg x={r1(rx)} y={r1(ry)} width={r1(w)} height={r1(h)} viewBox="0 0 640 440" style={{ borderRadius: 12 }}>
                    <RoomRender visual={side ? vj : vm} room={demo.room} label={`${c.name}'s living room`} />
                  </svg>
                  <text x={r1(rx)} y={r1(ry + h + 30)} fill={AMBER} style={{ font: "italic 400 24px var(--font-display)" }}>
                    {c.title}
                  </text>
                  <text x={r1(rx)} y={r1(ry + h + 52)} fill={MUTED} style={{ font: "500 12px var(--font-mono)", letterSpacing: "0.06em" }}>
                    {`${c.name.toUpperCase()} · ${(side ? vj : vm).kelvin}K · DIMMER ${(side ? vj : vm).percent}%`}
                  </text>
                </g>
              );
            })
          : null}

        {/* 6 · traced */}
        {oTrace > 0
          ? clients.map(({ c, x, side }) => (
              <g key={c.name} opacity={r1(oTrace * 10) / 10}>
                {differing.map((l, i) => {
                  const line = c.spec.find((s) => s.id === l.id)!;
                  const p = ease(seg(t, 23.4 + i * 0.3 + side * 0.15, 24 + i * 0.3 + side * 0.15));
                  const y = 420 + i * 38;
                  return (
                    <g key={l.id} opacity={r1(p * 10) / 10}>
                      <circle cx={x + 6} cy={y - 5} r={4} fill={AMBER} />
                      {i > 0 ? <line x1={x + 6} y1={y - 43} x2={x + 6} y2={y - 9} stroke={AMBER} strokeWidth={1.2} strokeDasharray="2 3" /> : null}
                      <text x={x + 20} y={y} fill={MUTED} style={{ font: "500 12px var(--font-sans)" }}>
                        {line.category}
                      </text>
                      <text x={x + 150} y={y} fill={INK} style={{ font: "400 13px var(--font-sans)" }}>
                        {line.value.length > 34 ? `${line.value.slice(0, 33)}…` : line.value}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))
          : null}
        {oEnd > 0 ? (
          <g opacity={r1(oEnd * 10) / 10}>
            <rect x={0} y={0} width={W} height={H} fill="#15130f" opacity={0.86} />
            <text x={W / 2} y={270} textAnchor="middle" fill={INK} style={{ font: "500 40px var(--font-display)", letterSpacing: "-0.02em" }}>
              Every line traced to evidence.
            </text>
            <text x={W / 2} y={318} textAnchor="middle" fill={AMBER} style={{ font: "italic 400 28px var(--font-display)" }}>
              Tastespec
            </text>
            <text x={W / 2} y={352} textAnchor="middle" fill={MUTED} style={{ font: "500 12px var(--font-mono)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Taste evidence from Qloo · demo data
            </text>
          </g>
        ) : null}
      </svg>
      {!kiosk ? (
        <div className="controls">
          <button type="button" aria-label={playing ? "Pause the film" : "Play the film"} onClick={() => setPlaying((p) => !p)}>
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z" fill="currentColor" /></svg>
            )}
          </button>
          <div
            className="scrub"
            role="slider"
            tabIndex={0}
            aria-label="Film position"
            aria-valuemin={0}
            aria-valuemax={FILM_SECONDS}
            aria-valuenow={Math.round(t)}
            aria-valuetext={chapter.label}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * FILM_SECONDS);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek(t + 2);
              if (e.key === "ArrowLeft") seek(t - 2);
            }}
          >
            <i style={{ width: `${((t / FILM_SECONDS) * 100).toFixed(2)}%` }} />
          </div>
          <span className="chapter">{chapter.label}</span>
        </div>
      ) : null}
    </div>
  );
}
