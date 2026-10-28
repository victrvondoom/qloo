"use client";

import { useId } from "react";
import type { LightSource, RoomVisual } from "@/lib/render";
import type { RoomType } from "@/lib/types";

// The spec, drawn. Every light here comes from a spec line: which sources
// exist (layering), what they look like (fixture character), how wide the
// beams are (optics), the colour of the light (colour temperature, warming as
// it dims), how far it dims (scenes). Palette follows the leading atmospheres.

const W = 640;
const H = 440;
const FLOOR = 300;
const CEIL = 26;

interface Spot { x: number; y: number }
interface Layout {
  window?: { x: number; y: number; w: number; h: number };
  art?: { x: number; y: number; w: number; h: number }[];
  tableLamps: Spot[];
  floorLamps: Spot[];
  pendants: Spot[];
  downlights: number[];
  wallwash: { x: number; w: number }[];
  track: { x1: number; x2: number; aims: Spot[] };
}

const LAYOUTS: Record<RoomType, Layout> = {
  living_room: {
    window: { x: 40, y: 70, w: 128, h: 170 },
    art: [{ x: 318, y: 92, w: 132, h: 92 }],
    tableLamps: [{ x: 214, y: 262 }],
    floorLamps: [{ x: 566, y: FLOOR }],
    pendants: [],
    downlights: [120, 270, 450, 600],
    wallwash: [{ x: 290, w: 190 }],
    track: { x1: 230, x2: 600, aims: [{ x: 384, y: 140 }, { x: 330, y: 320 }, { x: 470, y: 320 }] },
  },
  dining_room: {
    window: { x: 36, y: 70, w: 120, h: 170 },
    art: [{ x: 512, y: 112, w: 96, h: 74 }],
    tableLamps: [{ x: 600, y: 240 }],
    floorLamps: [],
    pendants: [{ x: 336, y: 160 }],
    downlights: [120, 336, 560],
    wallwash: [{ x: 480, w: 150 }],
    track: { x1: 200, x2: 600, aims: [{ x: 336, y: 270 }, { x: 560, y: 150 }] },
  },
  bedroom: {
    window: { x: 30, y: 70, w: 110, h: 170 },
    art: [{ x: 312, y: 96, w: 116, h: 70 }],
    tableLamps: [{ x: 206, y: 258 }, { x: 534, y: 258 }],
    floorLamps: [],
    pendants: [],
    downlights: [130, 370, 600],
    wallwash: [{ x: 250, w: 240 }],
    track: { x1: 200, x2: 600, aims: [{ x: 370, y: 130 }] },
  },
  kitchen: {
    window: { x: 40, y: 64, w: 130, h: 150 },
    tableLamps: [],
    floorLamps: [],
    pendants: [{ x: 330, y: 168 }, { x: 450, y: 168 }],
    downlights: [120, 300, 470, 600],
    wallwash: [],
    track: { x1: 200, x2: 620, aims: [{ x: 330, y: 300 }, { x: 450, y: 300 }, { x: 560, y: 210 }] },
  },
  home_office: {
    window: { x: 36, y: 70, w: 120, h: 170 },
    art: [{ x: 252, y: 96, w: 96, h: 66 }],
    tableLamps: [{ x: 430, y: 262 }],
    floorLamps: [],
    pendants: [],
    downlights: [120, 330, 540],
    wallwash: [{ x: 466, w: 150 }],
    track: { x1: 220, x2: 610, aims: [{ x: 300, y: 130 }, { x: 540, y: 160 }] },
  },
  bathroom: {
    window: { x: 56, y: 56, w: 100, h: 70 },
    tableLamps: [],
    floorLamps: [],
    pendants: [],
    downlights: [130, 420, 600],
    wallwash: [],
    track: { x1: 200, x2: 620, aims: [{ x: 420, y: 150 }] },
  },
  restaurant: {
    art: [{ x: 210, y: 110, w: 80, h: 60 }, { x: 380, y: 104, w: 90, h: 70 }],
    tableLamps: [],
    floorLamps: [],
    pendants: [{ x: 140, y: 170 }, { x: 320, y: 170 }, { x: 500, y: 170 }],
    downlights: [230, 410, 590],
    wallwash: [{ x: 0, w: 640 }],
    track: { x1: 40, x2: 600, aims: [{ x: 140, y: 300 }, { x: 320, y: 300 }, { x: 500, y: 300 }] },
  },
  bar: {
    tableLamps: [],
    floorLamps: [],
    pendants: [{ x: 180, y: 150 }, { x: 320, y: 150 }, { x: 460, y: 150 }],
    downlights: [70, 580],
    wallwash: [{ x: 120, w: 400 }],
    track: { x1: 80, x2: 560, aims: [{ x: 200, y: 160 }, { x: 320, y: 160 }, { x: 440, y: 160 }] },
  },
  retail: {
    window: { x: 20, y: 46, w: 160, h: 236 },
    tableLamps: [],
    floorLamps: [],
    pendants: [],
    downlights: [300, 500],
    wallwash: [{ x: 220, w: 400 }],
    track: { x1: 200, x2: 620, aims: [{ x: 280, y: 150 }, { x: 360, y: 315 }, { x: 440, y: 150 }, { x: 520, y: 220 }, { x: 600, y: 150 }] },
  },
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
/** Round geometry so server and browser agree exactly (Math.tan/hypot may differ in the last bit). */
const n = (x: number) => Math.round(x * 100) / 100;
/** tan(half-beam) per optics line, precomputed. */
const TAN_BEAM = { accent: 0.2, sparkle: 0.31, grid: 0.38, lowglare: 0.29 } as const;
const of = (v: RoomVisual, k: LightSource["kind"]) => v.sources.find((s) => s.kind === k)?.intensity ?? 0;

/** Darken (amt < 0) or lighten (amt > 0) a hex colour. */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function Shade({ v, x, y, s = 1 }: { v: RoomVisual; x: number; y: number; s?: number }) {
  // Lamp or pendant shade by fixture character. (x, y) is the bulb centre.
  const metal = v.palette.metal;
  switch (v.fixture) {
    case "vintage":
      return (
        <g>
          <ellipse cx={x} cy={y} rx={15 * s} ry={13 * s} fill="#f3e6cf" opacity={0.92} />
          <rect x={x - 5 * s} y={y - 16 * s} width={10 * s} height={5 * s} rx={2} fill={metal} />
        </g>
      );
    case "industrial":
      return (
        <g>
          <path d={`M${x - 20 * s},${y + 6 * s} Q${x},${y - 22 * s} ${x + 20 * s},${y + 6 * s} Z`} fill="#2a2a2a" />
          <rect x={x - 4 * s} y={y - 18 * s} width={8 * s} height={6 * s} fill="#1f1f1f" />
        </g>
      );
    case "natural":
      return (
        <g>
          <circle cx={x} cy={y} r={17 * s} fill="#eee3cc" opacity={0.95} />
          {[-9, -3, 3, 9].map((d) => (
            <ellipse key={d} cx={x} cy={n(y + d * s)} rx={n(Math.sqrt(289 - d * d) * s)} ry={1.6 * s} fill="none" stroke="#cdbb98" strokeWidth={0.8} opacity={0.8} />
          ))}
        </g>
      );
    case "luxe":
      return (
        <g>
          <rect x={x - 18 * s} y={y - 10 * s} width={36 * s} height={18 * s} rx={3 * s} fill="#efe3d3" />
          <rect x={x - 18 * s} y={y + 6 * s} width={36 * s} height={2.5 * s} fill={metal} />
        </g>
      );
    default:
      return <rect x={x - 11 * s} y={y - 12 * s} width={22 * s} height={18 * s} rx={2} fill={v.palette.metal} />;
  }
}

function Furniture({ room, v }: { room: RoomType; v: RoomVisual }) {
  const p = v.palette;
  const wood = shade(p.floor, -0.15);
  switch (room) {
    case "living_room":
      return (
        <g>
          <ellipse cx={390} cy={378} rx={220} ry={38} fill={p.accent} opacity={0.55} />
          <rect x={196} y={262} width={40} height={6} rx={2} fill={wood} />
          <rect x={200} y={268} width={4} height={32} fill={wood} />
          <rect x={228} y={268} width={4} height={32} fill={wood} />
          <rect x={256} y={232} width={270} height={52} rx={14} fill={shade(p.textile, -0.08)} />
          <rect x={244} y={268} width={294} height={40} rx={12} fill={p.textile} />
          <rect x={236} y={252} width={26} height={58} rx={10} fill={shade(p.textile, -0.15)} />
          <rect x={522} y={252} width={26} height={58} rx={10} fill={shade(p.textile, -0.15)} />
          <rect x={300} y={256} width={60} height={26} rx={8} fill={shade(p.accent, 0.1)} />
          <rect x={250} y={308} width={6} height={10} fill={wood} />
          <rect x={528} y={308} width={6} height={10} fill={wood} />
          <rect x={330} y={334} width={132} height={10} rx={3} fill={shade(p.floor, -0.3)} />
          <rect x={340} y={344} width={5} height={18} fill={shade(p.floor, -0.3)} />
          <rect x={448} y={344} width={5} height={18} fill={shade(p.floor, -0.3)} />
          <circle cx={150} cy={286} r={20} fill="#5f7a4e" opacity={0.85} />
          <rect x={138} y={286} width={24} height={16} rx={3} fill={shade(p.trim, -0.2)} />
        </g>
      );
    case "dining_room":
      return (
        <g>
          <rect x={496} y={238} width={128} height={62} rx={4} fill={wood} />
          <rect x={500} y={244} width={58} height={50} rx={2} fill={shade(wood, 0.08)} />
          <rect x={562} y={244} width={58} height={50} rx={2} fill={shade(wood, 0.08)} />
          {[230, 300, 370, 440].map((x) => (
            <rect key={x} x={x} y={232} width={34} height={44} rx={6} fill={shade(p.textile, -0.1)} />
          ))}
          <rect x={206} y={268} width={290} height={12} rx={4} fill={shade(p.floor, -0.25)} />
          <rect x={220} y={280} width={6} height={52} fill={shade(p.floor, -0.3)} />
          <rect x={476} y={280} width={6} height={52} fill={shade(p.floor, -0.3)} />
          {[226, 296, 366, 436].map((x) => (
            <g key={x}>
              <rect x={x} y={300} width={40} height={38} rx={6} fill={p.textile} />
              <rect x={x + 4} y={338} width={4} height={14} fill={wood} />
              <rect x={x + 32} y={338} width={4} height={14} fill={wood} />
            </g>
          ))}
        </g>
      );
    case "bedroom":
      return (
        <g>
          <rect x={244} y={196} width={252} height={84} rx={10} fill={shade(p.textile, -0.12)} />
          <rect x={232} y={262} width={276} height={30} rx={8} fill={shade(p.trim, -0.04)} />
          <rect x={262} y={250} width={80} height={24} rx={10} fill="#f2ede4" />
          <rect x={398} y={250} width={80} height={24} rx={10} fill="#f2ede4" />
          <path d={`M222,286 L518,286 L548,356 L192,356 Z`} fill={p.textile} />
          <path d={`M192,356 L548,356 L548,364 L192,364 Z`} fill={shade(p.textile, -0.2)} />
          <rect x={186} y={258} width={42} height={42} rx={4} fill={wood} />
          <rect x={512} y={258} width={42} height={42} rx={4} fill={wood} />
        </g>
      );
    case "kitchen":
      return (
        <g>
          <rect x={220} y={46} width={400} height={82} fill={shade(p.trim, -0.05)} />
          {[220, 300, 380, 460, 540].map((x) => (
            <rect key={x} x={x + 4} y={50} width={72} height={74} rx={2} fill="none" stroke={shade(p.trim, -0.2)} strokeWidth={1.2} />
          ))}
          <rect x={220} y={206} width={400} height={9} fill={shade(p.metal, 0.35)} />
          <rect x={220} y={215} width={400} height={85} fill={shade(p.trim, -0.12)} />
          {[220, 300, 380, 460, 540].map((x) => (
            <rect key={x} x={x + 4} y={219} width={72} height={77} rx={2} fill="none" stroke={shade(p.trim, -0.28)} strokeWidth={1.2} />
          ))}
          <rect x={250} y={292} width={280} height={10} fill={shade(p.metal, 0.35)} />
          <rect x={258} y={302} width={264} height={72} fill={shade(p.floor, -0.35)} />
          {[290, 390, 490].map((x) => (
            <g key={x}>
              <rect x={x - 12} y={340} width={24} height={6} rx={2} fill={p.metal} />
              <rect x={x - 2} y={346} width={4} height={40} fill={p.metal} />
            </g>
          ))}
        </g>
      );
    case "home_office":
      return (
        <g>
          <rect x={470} y={74} width={140} height={190} fill="none" stroke={wood} strokeWidth={5} />
          {[120, 170, 220].map((y) => (
            <rect key={y} x={470} y={y} width={140} height={5} fill={wood} />
          ))}
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={478 + (i % 8) * 16} y={i < 8 ? 86 : 186} width={11} height={i % 3 === 0 ? 34 : 30} fill={[p.accent, p.textile, shade(p.trim, -0.3), p.metal][i % 4]} opacity={0.9} />
          ))}
          <rect x={228} y={258} width={232} height={10} rx={2} fill={wood} />
          <rect x={236} y={268} width={6} height={64} fill={wood} />
          <rect x={446} y={268} width={6} height={64} fill={wood} />
          <rect x={290} y={196} width={110} height={56} rx={4} fill="#1c1c1c" />
          <rect x={295} y={201} width={100} height={46} rx={2} fill="#2c3440" />
          <rect x={340} y={252} width={10} height={8} fill="#1c1c1c" />
          <path d="M300,300 h70 v40 h-70 z" fill={shade(p.textile, -0.2)} />
          <rect x={312} y={262} width={46} height={42} rx={8} fill={p.textile} />
        </g>
      );
    case "bathroom":
      return (
        <g>
          <rect x={26} y={246} width={200} height={56} rx={22} fill="#f4f1ea" />
          <rect x={26} y={246} width={200} height={10} rx={5} fill="#ffffff" />
          <rect x={352} y={88} width={136} height={124} rx={6} fill={p.metal} />
          <rect x={358} y={94} width={124} height={112} rx={4} fill="#c9d3d6" />
          <path d="M370,104 l40,0 l-40,40 z" fill="#e3eaec" opacity={0.6} />
          <rect x={320} y={224} width={200} height={9} rx={2} fill="#f4f1ea" />
          <rect x={326} y={233} width={188} height={67} rx={3} fill={wood} />
          <rect x={336} y={110} width={8} height={84} rx={4} fill="#efe6d8" />
          <rect x={496} y={110} width={8} height={84} rx={4} fill="#efe6d8" />
        </g>
      );
    case "restaurant":
      return (
        <g>
          <rect x={0} y={238} width={W} height={62} fill={shade(p.textile, -0.1)} />
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={i * 64 + 4} y={242} width={56} height={44} rx={8} fill={p.textile} />
          ))}
          {[140, 320, 500].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={300} rx={56} ry={10} fill={shade(p.floor, -0.3)} />
              <rect x={x - 3} y={304} width={6} height={50} fill={shade(p.metal, -0.2)} />
              <rect x={x - 46} y={318} width={32} height={34} rx={6} fill={shade(p.textile, 0.1)} />
              <rect x={x + 14} y={318} width={32} height={34} rx={6} fill={shade(p.textile, 0.1)} />
            </g>
          ))}
        </g>
      );
    case "bar":
      return (
        <g>
          <rect x={110} y={70} width={420} height={160} fill={shade(p.wall, -0.35)} />
          {[110, 160, 205].map((y) => (
            <rect key={y} x={110} y={y} width={420} height={5} fill={shade(p.metal, -0.1)} />
          ))}
          {Array.from({ length: 30 }, (_, i) => {
            const row = Math.floor(i / 10);
            const x = 124 + (i % 10) * 40;
            const y = [76, 126, 171][row];
            const h = 28 + ((i * 7) % 9);
            return <rect key={i} x={x} y={y + (34 - h)} width={10} height={h} rx={3} fill={["#6d8a5a", "#b8742e", "#d8c7a0", "#8a3b2f", "#3e5c74"][i % 5]} opacity={0.9} />;
          })}
          <rect x={50} y={276} width={540} height={12} rx={3} fill={shade(p.metal, 0.1)} />
          <rect x={60} y={288} width={520} height={86} fill={shade(p.floor, -0.45)} />
          {[120, 230, 340, 450, 540].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={380} rx={20} ry={6} fill={shade(p.textile, -0.1)} />
              <rect x={x - 2} y={384} width={4} height={40} fill={p.metal} />
            </g>
          ))}
        </g>
      );
    case "retail":
      return (
        <g>
          {[90, 150, 210].map((y) => (
            <rect key={y} x={220} y={y} width={400} height={6} fill={shade(p.trim, -0.2)} />
          ))}
          {Array.from({ length: 24 }, (_, i) => {
            const row = Math.floor(i / 8);
            return <rect key={i} x={232 + (i % 8) * 48} y={[60, 120, 180][row]} width={30} height={30} rx={3} fill={[p.accent, p.textile, shade(p.trim, -0.15), p.metal][i % 4]} opacity={0.9} />;
          })}
          <rect x={256} y={300} width={200} height={12} rx={2} fill={shade(p.floor, -0.3)} />
          <rect x={268} y={312} width={176} height={54} fill={shade(p.floor, -0.4)} />
          {[276, 320, 364, 408].map((x) => (
            <rect key={x} x={x} y={282} width={26} height={18} rx={3} fill={p.accent} opacity={0.85} />
          ))}
        </g>
      );
  }
}

export function RoomRender({ visual: v, room, label }: { visual: RoomVisual; room: RoomType; label?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (s: string) => `${uid}-${s}`;
  const L = LAYOUTS[room];
  const p = v.palette;
  const light = v.lightRgb;
  const ambient = clamp(v.daylight * 0.85 + v.level * 0.75);
  const darkness = 0.8 * (1 - ambient);
  const tanBeam = TAN_BEAM[v.optics];
  const t = { transition: "opacity .55s ease, fill .55s ease" } as const;
  const tl = of(v, "table_lamp");
  const fl = of(v, "floor_lamp");
  const pe = of(v, "pendant");
  const dl = of(v, "downlight");
  const co = of(v, "cove");
  const ww = of(v, "wallwash");
  const tr = of(v, "track");
  const night = v.daylight < 0.05;
  const showLamps = v.layering !== "concealed";
  const desc = label ?? `${room.replace("_", " ")} drawn from the spec: ${v.caption}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={id("glow")}>
          <stop offset="0%" stopColor={light} stopOpacity={1} />
          <stop offset="35%" stopColor={light} stopOpacity={0.55} />
          <stop offset="100%" stopColor={light} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id("cone")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} stopOpacity={v.optics === "lowglare" ? 0.35 : 0.7} />
          <stop offset="100%" stopColor={light} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={id("wash")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} stopOpacity={0.75} />
          <stop offset="100%" stopColor={light} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={night ? "#141c28" : "#9cc3e6"} />
          <stop offset="100%" stopColor={night ? "#0b0f15" : "#e6eff6"} />
        </linearGradient>
        <linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(p.floor, -0.12)} />
          <stop offset="100%" stopColor={p.floor} />
        </linearGradient>
        <filter id={id("blur")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* architecture */}
      <rect x={0} y={0} width={W} height={FLOOR} fill={p.wall} style={t} />
      <rect x={0} y={0} width={W} height={CEIL} fill={shade(p.wall, -0.12)} style={t} />
      <rect x={0} y={FLOOR} width={W} height={H - FLOOR} fill={`url(#${id("floor")})`} />
      {Array.from({ length: 7 }, (_, i) => (
        <line key={i} x1={0} y1={FLOOR + 6 + i * i * 2.8} x2={W} y2={FLOOR + 6 + i * i * 2.8} stroke={shade(p.floor, -0.3)} strokeWidth={0.8} opacity={0.35} />
      ))}
      <rect x={0} y={FLOOR - 8} width={W} height={8} fill={p.trim} opacity={0.9} />

      {L.window ? (
        <g>
          <rect x={L.window.x - 6} y={L.window.y - 6} width={L.window.w + 12} height={L.window.h + 12} rx={3} fill={p.trim} />
          <rect x={L.window.x} y={L.window.y} width={L.window.w} height={L.window.h} fill={`url(#${id("sky")})`} />
          {night ? [0.22, 0.5, 0.71].map((f, i) => <rect key={i} x={L.window!.x + f * L.window!.w} y={L.window!.y + L.window!.h * (0.6 + i * 0.1)} width={4} height={3} fill="#f2c27a" opacity={0.8} />) : null}
          <line x1={L.window.x + L.window.w / 2} y1={L.window.y} x2={L.window.x + L.window.w / 2} y2={L.window.y + L.window.h} stroke={p.trim} strokeWidth={4} />
          <line x1={L.window.x} y1={L.window.y + L.window.h * 0.45} x2={L.window.x + L.window.w} y2={L.window.y + L.window.h * 0.45} stroke={p.trim} strokeWidth={4} />
        </g>
      ) : null}

      {(L.art ?? []).map((a, i) => (
        <g key={i}>
          <rect x={a.x - 5} y={a.y - 5} width={a.w + 10} height={a.h + 10} fill={v.fixture === "luxe" || v.fixture === "vintage" ? p.metal : shade(p.trim, -0.6)} />
          <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={shade(p.wall, 0.55)} />
          <circle cx={a.x + a.w * 0.36} cy={a.y + a.h * 0.46} r={Math.min(a.w, a.h) * 0.24} fill={p.accent} opacity={0.9} />
          <rect x={a.x + a.w * 0.5} y={a.y + a.h * 0.2} width={a.w * 0.32} height={a.h * 0.6} fill={p.textile} opacity={0.85} />
        </g>
      ))}

      <Furniture room={room} v={v} />

      {/* fixtures (drawn before the darkness so unlit hardware sinks into the night) */}
      {L.downlights.map((x) => (
        <ellipse key={x} cx={x} cy={CEIL + 1} rx={9} ry={2.5} fill={v.optics === "lowglare" ? shade(p.wall, -0.4) : "#d9d4cb"} />
      ))}
      {tr > 0.01 || v.layering === "track" ? (
        <g>
          <rect x={L.track.x1} y={CEIL + 2} width={L.track.x2 - L.track.x1} height={5} rx={2} fill="#1e1e1e" />
          {L.track.aims.map((a, i) => {
            const hx = L.track.x1 + ((i + 0.5) * (L.track.x2 - L.track.x1)) / L.track.aims.length;
            return <rect key={i} x={n(hx - 5)} y={CEIL + 6} width={10} height={14} rx={3} fill="#2a2a2a" transform={`rotate(${n(clamp((a.x - hx) / 4, -35, 35))} ${n(hx)} ${CEIL + 7})`} />;
          })}
        </g>
      ) : null}
      {showLamps
        ? L.pendants.map((pd, i) => (
            <g key={i}>
              <line x1={pd.x} y1={CEIL} x2={pd.x} y2={pd.y - 12} stroke="#1f1b17" strokeWidth={1.4} />
              <Shade v={v} x={pd.x} y={pd.y} s={1.1} />
            </g>
          ))
        : null}
      {showLamps
        ? L.tableLamps.map((lp, i) => (
            <g key={i}>
              <path d={`M${lp.x - 8},${lp.y} q8,-26 16,0 z`} fill={v.fixture === "natural" ? "#d8c9ad" : p.metal} />
              <rect x={lp.x - 1.5} y={lp.y - 34} width={3} height={22} fill={p.metal} />
              <Shade v={v} x={lp.x} y={lp.y - 40} s={0.95} />
            </g>
          ))
        : null}
      {showLamps
        ? L.floorLamps.map((lp, i) => (
            <g key={i}>
              <rect x={lp.x - 14} y={lp.y - 4} width={28} height={5} rx={2} fill={p.metal} />
              <rect x={lp.x - 1.5} y={lp.y - 150} width={3} height={148} fill={p.metal} />
              <Shade v={v} x={lp.x} y={lp.y - 156} s={1.15} />
            </g>
          ))
        : null}

      {/* the room after dark, tinted by the light's colour */}
      <rect x={0} y={0} width={W} height={H} fill="#07060a" opacity={darkness} style={t} />
      <rect x={0} y={0} width={W} height={H} fill={light} opacity={0.1 + 0.12 * (1 - v.daylight)} style={{ ...t, mixBlendMode: "multiply" }} />

      {/* light */}
      <g style={{ mixBlendMode: "screen" }}>
        {L.window && v.daylight > 0.02 ? (
          <path
            d={`M${L.window.x},${FLOOR + 4} L${L.window.x + L.window.w},${FLOOR + 4} L${L.window.x + L.window.w + 160},${H} L${L.window.x + 40},${H} Z`}
            fill="#fff4e0"
            opacity={0.35 * v.daylight}
            style={t}
          />
        ) : null}
        {co > 0.01 ? (
          <g style={t} opacity={co}>
            <rect x={0} y={CEIL - 2} width={W} height={6} fill={light} filter={`url(#${id("blur")})`} />
            <rect x={0} y={CEIL} width={W} height={90} fill={`url(#${id("wash")})`} opacity={0.5} />
          </g>
        ) : null}
        {ww > 0.01
          ? L.wallwash.map((w, i) => (
              <g key={i} style={t} opacity={ww}>
                <rect x={w.x} y={CEIL} width={w.w} height={FLOOR - CEIL - 10} fill={`url(#${id("wash")})`} opacity={0.55} />
                {Array.from({ length: Math.max(1, Math.round(w.w / 70)) }, (_, k) => (
                  <ellipse key={k} cx={w.x + (k + 0.5) * (w.w / Math.max(1, Math.round(w.w / 70)))} cy={CEIL + 30} rx={34} ry={46} fill={`url(#${id("glow")})`} opacity={0.5} />
                ))}
              </g>
            ))
          : null}
        {dl > 0.01
          ? L.downlights.map((x) => {
              const spread = n((FLOOR + 40 - CEIL) * tanBeam);
              return (
                <g key={x} style={t} opacity={dl}>
                  <path d={`M${x - 6},${CEIL + 2} L${x + 6},${CEIL + 2} L${x + spread},${FLOOR + 40} L${x - spread},${FLOOR + 40} Z`} fill={`url(#${id("cone")})`} opacity={0.55} />
                  <ellipse cx={x} cy={FLOOR + 40} rx={spread * 0.9} ry={10} fill={`url(#${id("glow")})`} opacity={0.6} />
                  {v.optics !== "lowglare" ? <ellipse cx={x} cy={CEIL + 2} rx={6} ry={2} fill="#fffaf0" opacity={0.9} /> : null}
                </g>
              );
            })
          : null}
        {tr > 0.01
          ? L.track.aims.map((a, i) => {
              const hx = L.track.x1 + ((i + 0.5) * (L.track.x2 - L.track.x1)) / L.track.aims.length;
              const dx = a.x - hx;
              const dy = a.y - (CEIL + 14);
              const len = Math.sqrt(dx * dx + dy * dy);
              const nx = -dy / len, ny = dx / len;
              const wdt = len * tanBeam * 0.7;
              return (
                <g key={i} style={t} opacity={tr}>
                  <path d={`M${n(hx - 3 * nx)},${n(CEIL + 14 - 3 * ny)} L${n(hx + 3 * nx)},${n(CEIL + 14 + 3 * ny)} L${n(a.x + wdt * nx)},${n(a.y + wdt * ny)} L${n(a.x - wdt * nx)},${n(a.y - wdt * ny)} Z`} fill={light} opacity={0.18} />
                  <circle cx={a.x} cy={a.y} r={n(wdt * 1.4 + 10)} fill={`url(#${id("glow")})`} opacity={0.6} />
                </g>
              );
            })
          : null}
        {showLamps && pe > 0.01
          ? L.pendants.map((pd, i) => (
              <g key={i} style={t} opacity={pe}>
                <circle cx={pd.x} cy={pd.y + 4} r={70} fill={`url(#${id("glow")})`} opacity={0.75} />
                <ellipse cx={pd.x} cy={Math.min(FLOOR + 10, pd.y + 120)} rx={90} ry={16} fill={`url(#${id("glow")})`} opacity={0.4} />
              </g>
            ))
          : null}
        {showLamps && tl > 0.01
          ? L.tableLamps.map((lp, i) => (
              <g key={i} style={t} opacity={tl}>
                <circle cx={lp.x} cy={lp.y - 40} r={84} fill={`url(#${id("glow")})`} opacity={0.85} />
                <circle cx={lp.x} cy={lp.y - 40} r={16} fill={light} opacity={0.75} />
              </g>
            ))
          : null}
        {showLamps && fl > 0.01
          ? L.floorLamps.map((lp, i) => (
              <g key={i} style={t} opacity={fl}>
                <circle cx={lp.x} cy={lp.y - 156} r={96} fill={`url(#${id("glow")})`} opacity={0.8} />
                <circle cx={lp.x} cy={lp.y - 156} r={16} fill={light} opacity={0.7} />
              </g>
            ))
          : null}
        {room === "bathroom" ? (
          <g style={t} opacity={clamp(v.level * 1.2)}>
            <rect x={330} y={104} width={20} height={96} rx={8} fill={`url(#${id("glow")})`} />
            <rect x={490} y={104} width={20} height={96} rx={8} fill={`url(#${id("glow")})`} />
            <ellipse cx={420} cy={160} rx={110} ry={90} fill={`url(#${id("glow")})`} opacity={0.35} />
          </g>
        ) : null}
        {room === "kitchen" ? (
          <g style={t} opacity={clamp(v.level * 1.1)}>
            <rect x={222} y={128} width={396} height={4} fill={light} filter={`url(#${id("blur")})`} />
            <rect x={222} y={130} width={396} height={78} fill={`url(#${id("wash")})`} opacity={0.5} />
          </g>
        ) : null}
        {room === "bar" ? (
          <g style={t} opacity={clamp(0.5 + v.level)}>
            <rect x={112} y={72} width={416} height={156} fill={`url(#${id("wash")})`} opacity={0.35} />
            <rect x={60} y={286} width={520} height={4} fill={light} filter={`url(#${id("blur")})`} opacity={0.7} />
          </g>
        ) : null}
        {room === "restaurant" && v.scene !== "day" ? [140, 320, 500].map((x) => <circle key={x} cx={x} cy={292} r={18} fill={`url(#${id("glow")})`} opacity={0.9} />) : null}
      </g>
    </svg>
  );
}
