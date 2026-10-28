// Spec → 2D room illustration parameters. Pure and deterministic: the picture is
// the spec drawn, not decoration. Every rulebook value maps to a visual (tested
// against the whole option menu), and the dimmer scenes come from the spec's own
// colour-temperature and dimming lines.

import { DIMENSION_BY_ID } from "./dimensions";
import type { DimensionId, DimensionScore, RoomType, SpecLine, Trade } from "./types";

/** Only the line ids and values matter for drawing, so client views can pass a slim spec. */
type Lines = Pick<SpecLine, "id" | "value">[];
type Dims = Pick<DimensionScore, "id" | "score">[];

export type SceneId = "day" | "evening" | "late";

export interface LightSource {
  kind: "table_lamp" | "floor_lamp" | "pendant" | "cove" | "downlight" | "track" | "wallwash" | "window";
  /** 0..1 at this scene. */
  intensity: number;
}

export interface RoomVisual {
  scene: SceneId;
  sceneLabel: string;
  /** Colour temperature of the electric light at this scene, in kelvin. */
  kelvin: number;
  lightRgb: string;
  /** 0..1 overall electric light level at this scene. */
  level: number;
  /** 0..1 daylight through the window at this scene. */
  daylight: number;
  /** The dimmer setting for this scene, 0..100 (what a keypad would show). */
  percent: number;
  layering: "lamps" | "even" | "concealed" | "track";
  fixture: "vintage" | "minimal" | "industrial" | "natural" | "luxe";
  optics: "lowglare" | "accent" | "sparkle" | "grid";
  palette: { wall: string; floor: string; trim: string; textile: string; metal: string; accent: string };
  sources: LightSource[];
  caption: string;
}

// ---------------------------------------------------------------- colour

/** Kelvin → sRGB (Tanner Helland's fit), returned as #rrggbb. */
export function kelvinToRgb(k: number): string {
  const t = Math.max(1000, Math.min(12000, k)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Palette per atmosphere: wall, floor, trim, textile, metal, accent. */
const PALETTES: Record<DimensionId, RoomVisual["palette"]> = {
  low_glow: { wall: "#5b5a3e", floor: "#5a3d2b", trim: "#3f3a2c", textile: "#7d3b2f", metal: "#b08d57", accent: "#c2742f" },
  bright_airy: { wall: "#f3efe6", floor: "#d9c4a5", trim: "#ffffff", textile: "#e9e2d4", metal: "#c9c5bd", accent: "#8fb3c9" },
  clean_minimal: { wall: "#ecebe7", floor: "#cfc8bd", trim: "#f7f7f5", textile: "#b9b6ae", metal: "#2b2b2b", accent: "#4a4a48" },
  vintage_character: { wall: "#2f4a3c", floor: "#6b4a2f", trim: "#e6d8bd", textile: "#b8862f", metal: "#b5893a", accent: "#a6452d" },
  industrial_raw: { wall: "#7a7672", floor: "#8d8a85", trim: "#3a3836", textile: "#5c4a3d", metal: "#232323", accent: "#a5582c" },
  natural_organic: { wall: "#d8cdb6", floor: "#a07a52", trim: "#efe7d6", textile: "#9c8f6c", metal: "#8a6a4a", accent: "#6f7d55" },
  refined_luxe: { wall: "#cbbfae", floor: "#e7e1d8", trim: "#f2ede4", textile: "#4a3f5c", metal: "#c9a45c", accent: "#7d5c3a" },
  energetic_social: { wall: "#b6452f", floor: "#4b3a2f", trim: "#f2e3c6", textile: "#2f5d74", metal: "#c49a3c", accent: "#e0a83a" },
  calm_quiet: { wall: "#dfe2db", floor: "#bfae96", trim: "#f4f4ef", textile: "#a8b3a4", metal: "#9a9a94", accent: "#7f9488" },
};

// ---------------------------------------------------------------- spec parsing

function line(spec: Lines, id: string) {
  return spec.find((l) => l.id === id)?.value ?? "";
}

/** Colour temperature range from the CCT line: [ambient day, warmest when dimmed]. */
export function cctRange(spec: Lines): { day: number; dimmed: number; task?: number } {
  const v = line(spec, "cct");
  if (/2200–2700K/.test(v)) return { day: 2700, dimmed: 2200 };
  if (/^2700K/.test(v)) return { day: 2700, dimmed: 2700 };
  if (/^3000K throughout/.test(v)) return { day: 3000, dimmed: 3000 };
  if (/^3000K ambient, 3500K/.test(v)) return { day: 3000, dimmed: 3000, task: 3500 };
  if (/^3500K ambient, 4000K/.test(v)) return { day: 3500, dimmed: 3500, task: 4000 };
  return { day: 2700, dimmed: 2700 };
}

export function layeringOf(spec: Lines): RoomVisual["layering"] {
  const v = line(spec, "layers");
  if (v.startsWith("Lamps and wall-washers")) return "lamps";
  if (v.startsWith("Even ambient")) return "even";
  if (v.startsWith("Concealed sources")) return "concealed";
  if (v.startsWith("Surface track")) return "track";
  return "lamps";
}

export function fixtureOf(spec: Lines): RoomVisual["fixture"] {
  const v = line(spec, "fixtures");
  if (v.startsWith("Opal or ribbed")) return "vintage";
  if (v.startsWith("Matte white or black")) return "minimal";
  if (v.startsWith("Black or raw steel")) return "industrial";
  if (v.startsWith("Paper, rattan")) return "natural";
  if (v.startsWith("Alabaster")) return "luxe";
  return "minimal";
}

export function opticsOf(spec: Lines): RoomVisual["optics"] {
  const v = line(spec, "optics");
  if (v.startsWith("Deep-regressed")) return "lowglare";
  if (v.startsWith("Narrow 15–25°")) return "accent";
  if (v.startsWith("Mixed 24–36°")) return "sparkle";
  if (v.startsWith("Trimless regressed")) return "grid";
  return "lowglare";
}

/** Scenes the spec supports, from its dimming line. */
export function scenesOf(spec: Lines): { id: SceneId; label: string; level: number }[] {
  const v = line(spec, "dimming");
  if (v.startsWith("Full-range dimming")) return [{ id: "day", label: "Day", level: 1 }, { id: "evening", label: "Dinner", level: 0.45 }, { id: "late", label: "Late", level: 0.12 }];
  if (v.startsWith("Smooth, flicker-free")) return [{ id: "day", label: "Day", level: 1 }, { id: "evening", label: "Wind-down", level: 0.3 }];
  return [{ id: "day", label: "Day", level: 1 }, { id: "evening", label: "Evening", level: 0.6 }];
}

/** Light level from the level line: low / mid / upper end of the room's range. */
function baseLevel(spec: Lines): number {
  const v = line(spec, "level");
  if (v.startsWith("Ambient at the low end")) return 0.62;
  if (v.startsWith("Ambient at the upper end")) return 1;
  return 0.8;
}

function paletteFor(dims: Dims | undefined, spec: Lines, trade: Trade): RoomVisual["palette"] {
  const ranked = [...(dims ?? [])].sort((a, b) => b.score - a.score);
  const first = PALETTES[ranked[0]?.id ?? (layeringOf(spec) === "lamps" ? "low_glow" : "clean_minimal")];
  const second = PALETTES[ranked[1]?.id ?? "natural_organic"];
  const p = { ...first, textile: second.textile, accent: second.accent };
  if (trade === "finishes") {
    // Finishes specs name the palette directly; let the walls follow the wall line.
    const walls = line(spec, "walls");
    if (walls.startsWith("Deep, warm mid-tones")) p.wall = PALETTES.low_glow.wall;
    else if (walls.startsWith("Warm whites")) p.wall = PALETTES.bright_airy.wall;
    else if (walls.startsWith("One crisp white")) p.wall = PALETTES.clean_minimal.wall;
    else if (walls.startsWith("Earth tones")) p.wall = PALETTES.natural_organic.wall;
    else if (walls.startsWith("Greige and taupe")) p.wall = PALETTES.refined_luxe.wall;
    else if (walls.startsWith("Charcoal and concrete")) p.wall = PALETTES.industrial_raw.wall;
    else if (walls.startsWith("Heritage colours")) p.wall = PALETTES.vintage_character.wall;
    const metal = line(spec, "metal");
    if (metal.startsWith("Unlacquered brass")) p.metal = "#b5893a";
    else if (metal.startsWith("Matte black")) p.metal = "#2b2b2b";
    else if (metal.startsWith("Blackened or raw steel")) p.metal = "#333333";
    else if (metal.startsWith("Brushed or polished brass")) p.metal = "#c9a45c";
    else if (metal.startsWith("Bronze")) p.metal = "#8a6a4a";
  }
  return p;
}

export function roomVisual(args: { spec: Lines; dims?: Dims; trade: Trade; room: RoomType; scene: SceneId }): RoomVisual {
  const { spec, dims, trade, scene } = args;
  const scenes = scenesOf(spec);
  const s = scenes.find((x) => x.id === scene) ?? scenes[0];
  const cct = cctRange(spec);
  const t = scenes.length > 1 ? 1 - (s.level - Math.min(...scenes.map((x) => x.level))) / (1 - Math.min(...scenes.map((x) => x.level)) || 1) : 0;
  // Dim-to-warm: colour temperature slides from day to dimmed as the level drops.
  const kelvin = Math.round(cct.day + (cct.dimmed - cct.day) * t);
  const layering = trade === "finishes" ? "lamps" : layeringOf(spec);
  const fixture = trade === "finishes" ? "natural" : fixtureOf(spec);
  const optics = trade === "finishes" ? "lowglare" : opticsOf(spec);
  const level = Math.max(0.08, s.level * baseLevel(spec));
  const daylight = s.id === "day" ? Math.min(1, 0.45 + Math.max(0, (dims?.find((d) => d.id === "bright_airy")?.score ?? 0) * 0.55)) : 0;

  const sources: LightSource[] = [];
  const on = (kind: LightSource["kind"], i: number) => sources.push({ kind, intensity: Math.max(0, Math.min(1, i)) });
  on("window", daylight);
  if (layering === "lamps") {
    on("table_lamp", 0.55 + 0.45 * s.level);
    on("floor_lamp", s.id === "late" ? 0.25 : 0.7 * s.level + 0.2);
    on("wallwash", 0.35 + 0.5 * s.level);
    on("pendant", s.id === "late" ? 0.1 : 0.5 * s.level + 0.2);
    on("downlight", s.id === "day" ? 0.35 : 0);
  } else if (layering === "even") {
    on("cove", 0.9 * s.level + 0.1);
    on("downlight", s.level);
    on("pendant", 0.6 * s.level);
    on("table_lamp", s.id === "day" ? 0 : 0.4);
  } else if (layering === "concealed") {
    on("cove", 0.6 + 0.4 * s.level);
    on("downlight", s.id === "late" ? 0 : 0.8 * s.level);
    on("wallwash", 0.3 + 0.4 * s.level);
    on("pendant", 0.4 * s.level);
  } else {
    on("track", 0.4 + 0.6 * s.level);
    on("pendant", 0.6 * s.level + 0.2);
    on("table_lamp", s.id === "day" ? 0 : 0.5);
  }
  if (optics === "accent" && !sources.some((x) => x.kind === "wallwash")) on("wallwash", 0.6);

  const top = [...(dims ?? [])].sort((a, b) => b.score - a.score)[0];
  return {
    scene: s.id,
    sceneLabel: s.label,
    kelvin,
    lightRgb: kelvinToRgb(kelvin),
    level,
    daylight,
    percent: Math.round(s.level * 100),
    layering,
    fixture,
    optics,
    palette: paletteFor(dims, spec, trade),
    sources,
    caption: `${s.label} · ${kelvin}K · ${Math.round(s.level * 100)}%${top && top.score > 0.1 ? ` · ${DIMENSION_BY_ID[top.id].short}` : ""}`,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A continuous dimmer between the spec's scenes: position 1 = the brightest
 * scene, 0 = the dimmest. Levels, daylight, colour temperature and every
 * source's output are interpolated between the two neighbouring scenes.
 */
export function roomVisualAt(args: { spec: Lines; dims?: Dims; trade: Trade; room: RoomType; position: number }): RoomVisual {
  const scenes = scenesOf(args.spec);
  const ordered = [...scenes].sort((a, b) => a.level - b.level); // dimmest first
  const p = Math.max(0, Math.min(1, args.position)) * (ordered.length - 1);
  const i = Math.min(ordered.length - 2, Math.floor(p));
  const t = ordered.length > 1 ? p - i : 0;
  const a = roomVisual({ ...args, scene: ordered[Math.max(0, i)].id });
  if (ordered.length < 2) return a;
  const b = roomVisual({ ...args, scene: ordered[i + 1].id });
  const kelvin = Math.round(lerp(a.kelvin, b.kelvin, t));
  const kinds = [...new Set([...a.sources, ...b.sources].map((s) => s.kind))];
  const sources = kinds.map((kind) => ({
    kind,
    intensity: lerp(a.sources.find((s) => s.kind === kind)?.intensity ?? 0, b.sources.find((s) => s.kind === kind)?.intensity ?? 0, t),
  }));
  const near = t < 0.5 ? a : b;
  const level = lerp(a.level, b.level, t);
  const percent = Math.round(lerp(a.percent, b.percent, t));
  return {
    ...near,
    kelvin,
    lightRgb: kelvinToRgb(kelvin),
    level,
    percent,
    daylight: lerp(a.daylight, b.daylight, t),
    sources,
    caption: `${near.sceneLabel} · ${kelvin}K · ${percent}%`,
  };
}

/** Where a scene sits on the dimmer (1 = brightest scene). */
export function scenePosition(spec: Lines, scene: SceneId): number {
  const ordered = [...scenesOf(spec)].sort((a, b) => a.level - b.level);
  const i = ordered.findIndex((s) => s.id === scene);
  return ordered.length > 1 ? Math.max(0, i) / (ordered.length - 1) : 1;
}
