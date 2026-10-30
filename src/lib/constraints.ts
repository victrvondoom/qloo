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
