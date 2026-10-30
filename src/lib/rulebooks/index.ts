// Trade rulebooks: deterministic translation from an atmosphere vector to spec
// lines a pro can build. The model never sets a spec value — these tables do —
// so the same evidence always yields the same spec, and every line can name the
// dimensions that drove it.

import { applyCctRange, rangeLabel, type CctRange } from "../constraints";
import type { DimensionId, RoomType, Trade } from "../types";

export type Vector = Record<DimensionId, number>;

/** Bump when any mapping below changes; stored on every brief and spec line. */
export const RULEBOOK_VERSION = "rulebook-2026.10.28";

export interface RuleLine {
  id: string;
  category: string;
  value: string;
  why: string;
  drivers: DimensionId[];
  /** Gap between the winning option and the runner-up, 0..~2. Small = contestable. */
  margin: number;
  /** Hard rules that bound this line's value. */
  constraints?: string[];
}

interface Option {
  dim: DimensionId;
  value: string;
  why: string;
}

function pick(options: Option[], v: Vector): { best: Option; margin: number } {
  const ranked = [...options].sort((a, b) => v[b.dim] - v[a.dim]);
  return { best: ranked[0], margin: ranked.length > 1 ? v[ranked[0].dim] - v[ranked[1].dim] : 1 };
}

const ROOM_LUX: Record<RoomType, [number, number]> = {
  living_room: [100, 200],
  bedroom: [50, 150],
  kitchen: [300, 500],
  dining_room: [100, 200],
  home_office: [300, 500],
  bathroom: [200, 300],
  restaurant: [50, 150],
  bar: [30, 100],
  retail: [300, 750],
};

const TASK_ROOMS: RoomType[] = ["kitchen", "home_office", "retail", "bathroom"];

export interface RuleOptions {
  /** The client used a word that can mean warm light; never spec cooler than 3000K. */
  warmFloor?: boolean;
  /** The client's own written colour-temperature range; outranks the evidence and the warm floor. */
  cctRange?: CctRange;
}

function lighting(v: Vector, room: RoomType, opts: RuleOptions): RuleLine[] {
  const lines: RuleLine[] = [];

  // 1. Colour temperature
  const warm = v.low_glow + 0.5 * v.vintage_character + 0.4 * v.natural_organic + 0.3 * v.refined_luxe;
  const cool = v.bright_airy + 0.6 * v.clean_minimal + 0.3 * v.industrial_raw;
  let net = warm - cool;
  if (TASK_ROOMS.includes(room)) net -= 0.3;
  const floored = Boolean(opts.warmFloor) && net <= -0.15;
  if (floored) net = -0.14;
  const cct =
    net > 0.6
      ? "2200–2700K with dim-to-warm (glows amber as it dims)"
      : net > 0.15
        ? "2700K throughout"
        : net > -0.15
          ? "3000K throughout"
          : net > -0.6
            ? "3000K ambient, 3500K on task surfaces"
            : "3500K ambient, 4000K on task surfaces";
  const bounded = opts.cctRange ? applyCctRange(cct, opts.cctRange) : undefined;
  lines.push({
    id: "cct",
    category: "Colour temperature",
    value: bounded?.value ?? cct,
    why: bounded && bounded.value !== cct
      ? `They wrote down ${rangeLabel(opts.cctRange!)}, which outranks what their rooms suggest.`
      : floored
      ? "Their rooms run bright and crisp, but they asked for warm, so it stops at 3000K."
      : net > 0.15
        ? "Their rooms run warm and low."
        : net < -0.15
          ? "Their rooms run bright and crisp."
          : "Their rooms sit in the neutral middle.",
    drivers: (["low_glow", "bright_airy", "clean_minimal", "vintage_character", "natural_organic"] as DimensionId[])
      .sort((a, b) => Math.abs(v[b]) - Math.abs(v[a]))
      .slice(0, 2),
    margin: Math.abs(net),
    constraints: [
      ...(opts.warmFloor ? ["warm-floor: client used a word that can mean warm light, so never cooler than 3000K ambient"] : []),
      ...(TASK_ROOMS.includes(room) ? ["task-room: cooler task lighting allowed on work surfaces"] : []),
      ...(floored ? ["warm-floor applied: evidence pointed cooler"] : []),
      ...(bounded ? [bounded.note] : []),
    ],
  });

  // 2. Layering / distribution
  const layer = pick(
    [
      { dim: "low_glow", value: "Lamps and wall-washers first; downlights only over task zones. At least 4 sources at different heights.", why: "Pools of light, not an even wash." },
      { dim: "bright_airy", value: "Even ambient: perimeter cove or linear plus daylight-matched downlights.", why: "Shadow-free, daylight feel." },
      { dim: "clean_minimal", value: "Concealed sources: trimless recessed, LED tape in coves and shelving.", why: "Light without visible fixtures." },
      { dim: "industrial_raw", value: "Surface track or rail on exposed runs, adjustable heads.", why: "Visible, flexible, utilitarian." },
    ],
    v,
  );
  lines.push({ id: "layers", category: "Layering", value: layer.best.value, why: layer.best.why, drivers: [layer.best.dim], margin: layer.margin });

  // 3. Fixture character & finish
  const finish = pick(
    [
      { dim: "vintage_character", value: "Opal or ribbed glass, aged brass, fabric cord, warm filament-style LED lamps.", why: "Pieces that look collected, not bought as a set." },
      { dim: "clean_minimal", value: "Matte white or black, flush and trimless profiles, no exposed lamps.", why: "Fixtures that disappear." },
      { dim: "industrial_raw", value: "Black or raw steel, enamel and cage shades, conduit-style runs.", why: "Honest, workshop materials." },
      { dim: "natural_organic", value: "Paper, rattan, linen and timber shades; ceramic lamp bases.", why: "Soft, natural, diffused." },
      { dim: "refined_luxe", value: "Alabaster, brushed brass, one sculptural statement pendant.", why: "Polished, hotel-grade objects." },
    ],
    v,
  );
  lines.push({ id: "fixtures", category: "Fixture character", value: finish.best.value, why: finish.best.why, drivers: [finish.best.dim], margin: finish.margin });

  // 4. Dimming & scenes
  const dimDrivers: DimensionId[] = [];
  let dimming = "Standard 0–10V or phase dimming on ambient circuits.";
  if (v.low_glow > 0.3 || v.energetic_social > 0.3) {
    dimming = "Full-range dimming to 1% and three scenes (day / dinner / late).";
    dimDrivers.push(v.low_glow >= v.energetic_social ? "low_glow" : "energetic_social");
  } else if (v.calm_quiet > 0.3) {
    dimming = "Smooth, flicker-free dimming with warm-dim; two scenes (day / wind-down).";
    dimDrivers.push("calm_quiet");
  } else {
    dimDrivers.push("low_glow");
  }
  lines.push({
    id: "dimming",
    category: "Dimming & scenes",
    value: dimming,
    why: "How far the room needs to travel between its day and night self.",
    drivers: dimDrivers,
    margin: Math.max(v.low_glow, v.energetic_social, v.calm_quiet) - 0.3,
  });

  // 5. Light level
  const [lo, hi] = ROOM_LUX[room];
  const brightLean = v.bright_airy - v.low_glow;
  const level =
    brightLean > 0.3
      ? `Ambient at the upper end: ~${hi} lux.`
      : brightLean < -0.3
        ? `Ambient at the low end: ~${lo} lux; let accent and lamps carry the room.`
        : `Ambient mid-range: ~${Math.round((lo + hi) / 2)} lux.`;
  lines.push({
    id: "level",
    category: "Light level",
    value: `${level} (Typical ${lo}–${hi} lux for this room; confirm with a lighting calculation.)`,
    constraints: [`room-range: ${lo}–${hi} lux for ${room.replace("_", " ")}`],
    why: "Starting target, not a calculation.",
    drivers: brightLean >= 0 ? ["bright_airy"] : ["low_glow"],
    margin: Math.abs(brightLean),
  });

  // 6. Optics & glare
  const optics = pick(
    [
      { dim: "calm_quiet", value: "Deep-regressed, low-glare optics (UGR < 19); no bare lamps in sightlines.", why: "Restful, nothing to squint at." },
      { dim: "low_glow", value: "Narrow 15–25° accent beams on art and tables; glare shielding on every downlight.", why: "Contrast and drama, not glare." },
      { dim: "energetic_social", value: "Mixed 24–36° beams with a few visible decorative sources for sparkle.", why: "Some sparkle and movement." },
      { dim: "clean_minimal", value: "Trimless regressed downlights, consistent 36° beams, aligned on a grid.", why: "Order and rhythm." },
    ],
    v,
  );
  lines.push({ id: "optics", category: "Optics & glare", value: optics.best.value, why: optics.best.why, drivers: [optics.best.dim], margin: optics.margin });

  // 7. Colour rendering
  const cri = Math.max(v.refined_luxe, v.natural_organic) > 0.3;
  lines.push({
    id: "cri",
    category: "Colour rendering",
    value: cri ? "CRI 95+ with R9 > 50, so wood, skin and food read true." : "CRI 90+.",
    why: cri ? "Their rooms lean on materials that look cheap under poor light." : "Good baseline quality.",
    drivers: [v.refined_luxe >= v.natural_organic ? "refined_luxe" : "natural_organic"],
    margin: Math.abs(Math.max(v.refined_luxe, v.natural_organic) - 0.3),
  });

  return lines;
}

function finishes(v: Vector): RuleLine[] {
  const lines: RuleLine[] = [];
  const walls = pick(
    [
      { dim: "low_glow", value: "Deep, warm mid-tones: olive, oxblood, tobacco. Matte.", why: "Walls that hold the evening." },
      { dim: "bright_airy", value: "Warm whites and pale neutrals, LRV 70+.", why: "Bounce the daylight." },
      { dim: "clean_minimal", value: "One crisp white or soft grey across walls and ceiling.", why: "A single quiet field." },
      { dim: "natural_organic", value: "Earth tones: clay, sage, ochre; limewash where possible.", why: "Colours from materials." },
      { dim: "refined_luxe", value: "Greige and taupe in eggshell, with one lacquered accent.", why: "Polish without shouting." },
      { dim: "industrial_raw", value: "Charcoal and concrete greys; leave brick or block exposed.", why: "Let the structure show." },
      { dim: "vintage_character", value: "Heritage colours: deep green, mustard, dusty pink.", why: "A room with a past." },
    ],
    v,
  );
  lines.push({ id: "walls", category: "Wall palette", value: walls.best.value, why: walls.best.why, drivers: [walls.best.dim], margin: walls.margin });

  const material = pick(
    [
      { dim: "natural_organic", value: "Oiled oak or walnut, jute, linen, terracotta.", why: "Touchable natural materials." },
      { dim: "clean_minimal", value: "Pale ash, microcement, matte lacquer.", why: "Smooth and seamless." },
      { dim: "industrial_raw", value: "Blackened steel, reclaimed timber, polished concrete.", why: "Raw and durable." },
      { dim: "refined_luxe", value: "Marble or travertine, velvet, smoked glass.", why: "Weight and sheen." },
      { dim: "vintage_character", value: "Mixed vintage woods, cane, leather with patina.", why: "Collected over time." },
    ],
    v,
  );
  lines.push({ id: "material", category: "Primary materials", value: material.best.value, why: material.best.why, drivers: [material.best.dim], margin: material.margin });

  const metal = pick(
    [
      { dim: "vintage_character", value: "Unlacquered brass that will patina.", why: "Ages with the room." },
      { dim: "clean_minimal", value: "Matte black or brushed stainless, used sparingly.", why: "Graphic, quiet." },
      { dim: "industrial_raw", value: "Blackened or raw steel.", why: "Honest metal." },
      { dim: "refined_luxe", value: "Brushed or polished brass and nickel.", why: "Jewellery for the room." },
      { dim: "natural_organic", value: "Bronze and aged copper.", why: "Earthy metals." },
    ],
    v,
  );
  lines.push({ id: "metal", category: "Metal finish", value: metal.best.value, why: metal.best.why, drivers: [metal.best.dim], margin: metal.margin });

  const textiles = pick(
    [
      { dim: "low_glow", value: "Velvet, wool bouclé, heavy curtains that close fully.", why: "Soft and enclosing." },
      { dim: "bright_airy", value: "Sheer linen, light cotton, minimal window dressing.", why: "Let light through." },
      { dim: "natural_organic", value: "Linen, jute, wool in undyed tones.", why: "Natural fibres." },
      { dim: "energetic_social", value: "Pattern and saturated colour: one bold rug or textile.", why: "Personality and play." },
      { dim: "calm_quiet", value: "Tonal wool and linen, acoustic panels disguised as textile.", why: "Quiet to the eye and ear." },
    ],
    v,
  );
  lines.push({ id: "textiles", category: "Textiles", value: textiles.best.value, why: textiles.best.why, drivers: [textiles.best.dim], margin: textiles.margin });

  const sheen = v.low_glow + v.natural_organic - v.refined_luxe - v.clean_minimal;
  lines.push({
    id: "sheen",
    category: "Sheen",
    value: sheen > 0.2 ? "Mostly matte; sheen only on small accents." : sheen < -0.2 ? "Satin and eggshell; one high-gloss accent." : "Matte walls, satin trim.",
    why: "How much the surfaces reflect back.",
    drivers: sheen >= 0 ? ["low_glow", "natural_organic"] : ["refined_luxe", "clean_minimal"],
    margin: Math.abs(sheen),
  });

  return lines;
}

export function runRulebook(trade: Trade, v: Vector, room: RoomType, opts: RuleOptions = {}): RuleLine[] {
  return trade === "lighting" ? lighting(v, room, opts) : finishes(v);
}

export const TRADE_LABEL: Record<Trade, string> = {
  lighting: "Lighting",
  finishes: "Finishes & palette",
};

export const ROOM_LABEL: Record<RoomType, string> = {
  living_room: "Living room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  dining_room: "Dining room",
  home_office: "Home office",
  bathroom: "Bathroom",
  restaurant: "Restaurant dining room",
  bar: "Bar",
  retail: "Retail floor",
};
