// Explicit client constraints: numbers the client wrote down. They bound the
// rulebook's output and outrank both the evidence and the warm-word floor.
// Parsed from the message text by fixed patterns, never by a model.

export interface CctRange {
  min: number;
  max: number;
}

const LO = 1800;
const HI = 6500;
const ok = (n: number) => Number.isInteger(n) && n >= LO && n <= HI;

/** "2700K–3000K", "between 2700 and 3000K", "no cooler than 3000K", "at least 2700K". */
export function parseCctRange(text: string): CctRange | undefined {
  const t = text.replace(/[‒-―]/g, "-");
  let min = LO;
  let max = HI;
  let found = false;
  const both = /(\d{4})\s*k?\s*(?:-|to|and)\s*(\d{4})\s*k\b/i.exec(t);
  if (both) {
    const a = Number(both[1]);
    const b = Number(both[2]);
    if (ok(a) && ok(b)) {
      min = Math.min(a, b);
      max = Math.max(a, b);
      found = true;
    }
  }
  if (!found) {
    const cap = /(?:no\s+(?:cooler|higher)\s+than|not\s+(?:cooler|above|higher)\s+than|under|below|at\s+most|max(?:imum)?(?:\s+of)?)\s*(\d{4})\s*k\b/i.exec(t);
    const floor = /(?:no\s+(?:warmer|lower)\s+than|not\s+(?:warmer|below|lower)\s+than|at\s+least|min(?:imum)?(?:\s+of)?)\s*(\d{4})\s*k\b/i.exec(t);
    if (cap && ok(Number(cap[1]))) {
      max = Number(cap[1]);
      found = true;
    }
    if (floor && ok(Number(floor[1]))) {
      min = Number(floor[1]);
      found = true;
    }
  }
  return found && min <= max ? { min, max } : undefined;
}

/** Validates a range that came from outside (a request body, a stored brief). */
export function cleanCctRange(r: unknown): CctRange | undefined {
  if (!r || typeof r !== "object") return undefined;
  const { min, max } = r as Record<string, unknown>;
  return typeof min === "number" && typeof max === "number" && ok(min) && ok(max) && min <= max ? { min, max } : undefined;
}

export const rangeLabel = (r: CctRange) => (r.min <= LO ? `no cooler than ${r.max}K` : r.max >= HI ? `no warmer than ${r.min}K` : `${r.min}–${r.max}K`);

const clamp = (n: number, r: CctRange) => Math.min(r.max, Math.max(r.min, n));

/**
 * Bring a colour-temperature line inside the client's range. Returns the new
 * value and a note saying what happened, so the spec line can show it.
 */
export function applyCctRange(value: string, r: CctRange): { value: string; note: string } {
  const label = `client range (${rangeLabel(r)})`;
  const nums = (value.match(/\d{4}/g) ?? []).map(Number);
  if (!nums.length) return { value, note: `${label}: could not read the value, left unchanged` };
  let out: string;
  if (/^\d{4}–\d{4}K with dim-to-warm/.test(value)) {
    const lo = Math.max(nums[0], r.min);
    const hi = Math.min(nums[1], r.max);
    out = lo < hi ? `${lo}–${hi}K with dim-to-warm (glows amber as it dims)` : `${clamp(nums[1], r)}K throughout`;
  } else if (/ambient/.test(value) && nums.length > 1) {
    const ambient = clamp(nums[0], r);
    const task = clamp(nums[1], r);
    out = task > ambient ? `${ambient}K ambient, ${task}K on task surfaces` : `${ambient}K throughout`;
  } else {
    out = `${clamp(nums[0], r)}K throughout`;
  }
  return { value: out, note: out === value ? `${label}: honoured` : `${label} applied: the rulebook said "${value}"` };
}

// ------------------------------------------------------------------ more limits
//
// Other numbers a client can write down. Each is a different quantity and is
// never converted into another: CCT is kelvin, CRI is an index, dimming is a
// percentage of full output, illuminance is lux, and lumens (total light from a
// fitting) are noted but never turned into a spec without the room and fitting.
// Precedence: safety and hard functional limits, then what the client wrote,
// then the evidence-based interpretation, then optional taste.

/** The hard limits the rulebook respects. All optional. */
export interface Limits {
  cct?: CctRange;
  /** Lowest acceptable CRI (Ra). One colour-fidelity index; not a full account of colour quality. */
  criMin?: number;
  /** The dimming range must reach at least this low, as a percentage of full output. */
  dimTo?: number;
  /** The client needs dimming at all (no level implied). */
  dimmable?: boolean;
  /** An illuminance target the client stated, in lux. */
  luxTarget?: number;
}

export interface ParsedConstraints {
  limits: Limits;
  /** Requirements that cannot hold together or are impossible. The brief is not built until the client resolves them. */
  conflicts: string[];
  /** Things the client wrote that were understood but deliberately not applied, and why. */
  notes: string[];
}

export const CRI_MIN = 60;

/** Pulls every supported numeric requirement out of a message, by fixed patterns. */
export function parseConstraints(text: string): ParsedConstraints {
  const t = text.replace(/[‒-―]/g, "-").replace(/\s+/g, " ");
  const limits: Limits = {};
  const conflicts: string[] = [];
  const notes: string[] = [];

  // Colour temperature: a range, or a cap and/or a floor. A cap below a floor cannot hold.
  const cct = parseCctRange(t);
  if (cct) limits.cct = cct;
  else {
    const cap = /(?:no\s+(?:cooler|higher)\s+than|not\s+(?:cooler|above|higher)\s+than|under|below|at\s+most|max(?:imum)?(?:\s+of)?)\s*(\d{4})\s*k\b/i.exec(t);
    const floor = /(?:no\s+(?:warmer|lower)\s+than|not\s+(?:warmer|below|lower)\s+than|at\s+least|min(?:imum)?(?:\s+of)?)\s*(\d{4})\s*k\b/i.exec(t);
    if (cap && floor && Number(floor[1]) > Number(cap[1])) conflicts.push(`Colour temperature: a minimum of ${floor[1]}K and a maximum of ${cap[1]}K cannot both hold.`);
  }

  // CRI / Ra: "CRI of at least 90", "minimum CRI 95", "Ra 90 or above", "CRI 90+".
  const criHits = new Set<number>();
  for (const re of [
    /\b(?:cri|ra)\s*(?:of\s*)?(?:at\s+least|minimum(?:\s+of)?|min\.?|>=|≥)?\s*(\d{2,3})\b\s*(?:\+|or\s+(?:above|higher|more|better))?/gi,
    /\b(?:minimum|min\.?|at\s+least)\s+(?:cri|ra)\s*(?:of\s*)?(\d{2,3})\b/gi,
  ]) {
    for (const m of t.matchAll(re)) criHits.add(Number(m[1]));
  }
  if (criHits.size) {
    const vals = [...criHits];
    const bad = vals.filter((n) => n > 100 || n < CRI_MIN);
    if (bad.length) conflicts.push(`Colour rendering: CRI ${bad[0]} is not possible (the index runs to 100; below ${CRI_MIN} is not usable for living spaces).`);
    else if (vals.length > 1) conflicts.push(`Colour rendering: two different CRI minimums (${vals.join(" and ")}).`);
    else limits.criMin = vals[0];
  }

  // Dimming: a floor ("dim to 10%", "5% to 100%") or just the capability.
  const dimRange = /\bdimm?(?:ing|able)?\s*(?:range\s*)?(?:of|from)?\s*(\d{1,3})\s*%\s*(?:-|to)\s*(\d{1,3})\s*%/i.exec(t);
  const dimTo = /\b(?:must\s+|should\s+|needs?\s+to\s+|to\s+)?dim\s+(?:down\s+)?to\s+(?:at\s+least\s+)?(\d{1,3})\s*%/i.exec(t);
  const floorPct = dimRange ? Math.min(Number(dimRange[1]), Number(dimRange[2])) : dimTo ? Number(dimTo[1]) : undefined;
  if (floorPct !== undefined) {
    if (floorPct < 1) conflicts.push("Dimming: 0% is off, not a dimming level. Give the lowest level the lights should hold (for example 5%).");
    else if (floorPct > 100) conflicts.push(`Dimming: ${floorPct}% is above full output.`);
    else limits.dimTo = floorPct;
  }
  const noDim = /\b(?:no|without|don'?t\s+(?:need|want)|do\s+not\s+(?:need|want))\s+dimm(?:ing|ers?)\b/i.test(t);
  const mustDim = /\b(?:must|need|needs|should|require[sd]?)\s+(?:to\s+)?(?:support\s+|have\s+)?dimm?(?:ing|able)?\b|\bdimmable\b|\bsupport\s+dimming\b/i.test(t) || floorPct !== undefined;
  if (noDim && mustDim) conflicts.push("Dimming: the message asks for dimming and says dimming is not needed.");
  else if (mustDim) limits.dimmable = true;

  // Illuminance in lux (not lumens, not percent). Two different targets cannot both hold.
  const luxHits = [...t.matchAll(/(\d{2,4})\s*(?:lux|lx)\b/gi)].map((m) => Number(m[1]));
  const uniqueLux = [...new Set(luxHits)];
  if (uniqueLux.length > 1) conflicts.push(`Light level: two different lux targets (${uniqueLux.join(" and ")}).`);
  else if (uniqueLux.length === 1) {
    if (uniqueLux[0] < 5 || uniqueLux[0] > 2000) conflicts.push(`Light level: ${uniqueLux[0]} lux is outside what a room target can sensibly be (5–2000).`);
    else limits.luxTarget = uniqueLux[0];
  }

  // Lumens describe a fitting, not a room. Understood, but no spec is invented from them.
  if (/\b\d[\d,]*\s*(?:lumens?|lm)\b/i.test(t)) notes.push("You mentioned lumens. Lumens are a fitting's output, so they can't become a room target without the room size and fitting data; give a lux target or use the quantity calculator on the hand-over.");
  return { limits, conflicts, notes };
}

/** The limits carried on a brief's input. */
export function limitsOf(i: { cctRange?: CctRange; criMin?: number; dimTo?: number; dimmable?: boolean; luxTarget?: number }): Limits | undefined {
  const l: Limits = { cct: i.cctRange, criMin: i.criMin, dimTo: i.dimTo, dimmable: i.dimmable, luxTarget: i.luxTarget };
  return Object.values(l).some((v) => v !== undefined) ? l : undefined;
}

const int = (n: unknown, lo: number, hi: number) => (typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi ? n : undefined);

/** Validates limits that came from outside (a request body, a stored brief). */
export function cleanLimits(raw: Record<string, unknown>) {
  return {
    cctRange: cleanCctRange(raw.cctRange),
    criMin: int(raw.criMin, CRI_MIN, 100),
    dimTo: int(raw.dimTo, 1, 100),
    dimmable: raw.dimmable === true ? true : undefined,
    luxTarget: int(raw.luxTarget, 5, 2000),
  };
}

export function limitChips(l: Limits): string[] {
  return [
    ...(l.cct ? [`Light ${rangeLabel(l.cct)}`] : []),
    ...(l.criMin ? [`CRI ${l.criMin}+`] : []),
    ...(l.dimTo ? [`Dim to ${l.dimTo}% or lower`] : l.dimmable ? ["Must dim"] : []),
    ...(l.luxTarget ? [`${l.luxTarget} lux`] : []),
  ];
}

/** Applies CRI, dimming and lux limits to rulebook lines' values. Returns the new value and a note, or undefined if untouched. */
export function applyCriLimit(value: string, min: number): { value: string; note: string } {
  const have = Number(/CRI (\d{2,3})\+/.exec(value)?.[1] ?? 0);
  if (have >= min) return { value, note: `client minimum CRI ${min}: honoured` };
  const keepR9 = /R9/.test(value);
  const out = `CRI ${min}+${keepR9 || min >= 95 ? " with R9 > 50" : ""}. Ask for the manufacturer's R9 and TM-30 values too: CRI alone is a limited measure of colour quality.`;
  return { value: out, note: `client minimum CRI ${min} applied: the rulebook said "${value}"` };
}

export function applyDimLimit(value: string, dimTo: number): { value: string; note: string } {
  const floors = [...value.matchAll(/(\d{1,3})%/g)].map((m) => Number(m[1]));
  const have = floors.length ? Math.min(...floors) : undefined;
  if (have !== undefined && have <= dimTo) return { value, note: `client dimming floor ${dimTo}%: honoured` };
  return {
    value: `Dimming to ${dimTo}% of full output or lower on the ambient circuits, with scenes. Confirm driver and dimmer compatibility with the manufacturer; no protocol is assumed here.`,
    note: `client dimming floor ${dimTo}% applied: the rulebook said "${value}"`,
  };
}

export function applyLuxLimit(value: string, lux: number, typical: string): { value: string; note: string } {
  return {
    value: `Ambient target ${lux} lux, as stated by the client (${typical}). Confirm with a lighting calculation for this room.`,
    note: `client lux target ${lux} applied: the rulebook said "${value.slice(0, 80)}"`,
  };
}

/** Does a specification line's value respect the client's written limits? Returns what's wrong, or undefined. Shared by validation, verification and sensitivity. */
export function limitProblem(lineId: string, value: string, l: Limits | undefined): string | undefined {
  if (!l) return undefined;
  if (lineId === "cct" && l.cct) {
    const bad = (value.match(/\d{4}/g) ?? []).map(Number).filter((k) => k < l.cct!.min || k > l.cct!.max);
    if (bad.length) return `${bad[0]}K is outside the client's range ${rangeLabel(l.cct)}`;
  }
  if (lineId === "cri" && l.criMin) {
    const have = Number(/CRI (\d{2,3})\+/.exec(value)?.[1] ?? 0);
    if (have < l.criMin) return `CRI ${have || "unstated"} is below the client's minimum of ${l.criMin}`;
  }
  if (lineId === "dimming" && l.dimTo) {
    const floors = [...value.matchAll(/(\d{1,3})%/g)].map((m) => Number(m[1]));
    if (floors.length && Math.min(...floors) > l.dimTo) return `the dimming floor ${Math.min(...floors)}% is above the client's ${l.dimTo}%`;
    if (!floors.length) return `the dimming line states no floor, but the client needs ${l.dimTo}% or lower`;
  }
  if (lineId === "level" && l.luxTarget && !new RegExp(`\\b${l.luxTarget} lux`).test(value)) return `it is not the client's ${l.luxTarget} lux target`;
  return undefined;
}
