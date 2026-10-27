// Spec assembly, the literal-reading counterfactual, and the clarifying-question
// planner.
//
// intent vector  = taste evidence score + the reading of each client word that
//                  the evidence favours
// literal vector = the dictionary reading of each client word, no evidence
//
// With no evidence the two are identical, so every difference between the
// spec and its literal column is attributable to Qloo data.

import { DIMENSIONS, DIMENSION_BY_ID } from "./dimensions";
import { applyClientAnswer } from "./fingerprint";
import { runRulebook, type Vector } from "./rulebooks";
import { lexiconFor, literalReading } from "./words";
import type {
  ClarifyingQuestion,
  DecodedWord,
  DimensionId,
  DimensionScore,
  EvidenceRef,
  RoomType,
  SpecLine,
  Trade,
  VenueEvidence,
} from "./types";

const WORD_WEIGHT = 0.6;

export function zeroVector(): Vector {
  return Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0])) as Vector;
}

export function intentVector(dims: DimensionScore[], words: DecodedWord[]): Vector {
  const v = zeroVector();
  for (const d of dims) v[d.id] = d.score;
  for (const w of words) if (w.chosen) v[w.chosen.dimension] += WORD_WEIGHT;
  return v;
}

export function literalVector(words: string[]): Vector {
  const v = zeroVector();
  for (const w of words) {
    const r = literalReading(w);
    if (r) v[r.dimension] += WORD_WEIGHT;
  }
  return v;
}

function evidenceFor(dim: DimensionScore): EvidenceRef {
  return {
    dimension: dim.id,
    lift: dim.lift,
    pGreater: dim.pGreater,
    crowdHits: dim.crowdHits,
    crowdN: dim.crowdN,
    baseHits: dim.baseHits,
    baseN: dim.baseN,
    exemplars: dim.exemplars.map((e) => e.name),
  };
}

function confidenceOf(drivers: DimensionScore[], margin: number): SpecLine["confidence"] {
  if (drivers.some((d) => d.clientAdjusted)) return "high";
  const certainty = drivers.length ? Math.max(...drivers.map((d) => Math.abs(2 * d.pGreater - 1))) : 0;
  if (certainty >= 0.8 && margin >= 0.3) return "high";
  if (certainty >= 0.5 || margin >= 0.5) return "medium";
  return "low";
}

/** A word like "warm" or "cozy" can mean warm light; respect that as a floor. */
export function warmFloor(clientWords: string[]): boolean {
  return clientWords.some((w) => lexiconFor(w)?.some((r) => r.dimension === "low_glow"));
}

export function buildSpec(
  trade: Trade,
  room: RoomType,
  dims: DimensionScore[],
  words: DecodedWord[],
  clientWords: string[],
  previous?: SpecLine[],
): SpecLine[] {
  const opts = { warmFloor: warmFloor(clientWords) };
  const lines = runRulebook(trade, intentVector(dims, words), room, opts);
  const literal = runRulebook(trade, literalVector(clientWords), room, opts);
  return lines.map((l) => {
    const drivers = l.drivers.map((id) => dims.find((d) => d.id === id)).filter((d): d is DimensionScore => Boolean(d));
    const prev = previous?.find((p) => p.id === l.id);
    // A pro's decision survives a re-score only if the line's value didn't change.
    const keep = prev && prev.value === l.value;
    return {
      id: l.id,
      category: l.category,
      value: l.value,
      why: l.why,
      evidence: drivers.map(evidenceFor),
      confidence: confidenceOf(drivers, l.margin),
      literalValue: literal.find((x) => x.id === l.id)?.value ?? "",
      status: keep ? prev.status : "proposed",
      revisedTo: keep ? prev.revisedTo : undefined,
      note: keep ? prev.note : undefined,
    };
  });
}

/** Every value each rulebook line can take, found by sweeping extreme vectors. */
export function specMenu(trade: Trade, room: RoomType): Record<string, { category: string; values: string[] }> {
  const vectors: Vector[] = [zeroVector()];
  for (const d of DIMENSIONS) {
    for (const s of [1, 0.5, -0.5, -1]) {
      const v = zeroVector();
      v[d.id] = s;
      vectors.push(v);
    }
  }
  const menu: Record<string, { category: string; values: string[] }> = {};
  for (const v of vectors) {
    for (const l of runRulebook(trade, v, room)) {
      menu[l.id] ??= { category: l.category, values: [] };
      if (!menu[l.id].values.includes(l.value)) menu[l.id].values.push(l.value);
    }
  }
  return menu;
}

function specValues(trade: Trade, room: RoomType, dims: DimensionScore[], words: DecodedWord[], clientWords: string[]): Map<string, string> {
  const opts = { warmFloor: warmFloor(clientWords) };
  return new Map(runRulebook(trade, intentVector(dims, words), room, opts).map((l) => [l.id, l.value]));
}

/**
 * Value-of-information question planning. For each contrast pair (a dimension
 * and its opposite) simulate both possible client answers, rebuild the spec
 * under each, and count lines that differ. Ask about the pair whose answer
 * moves the most lines, using two real places from the client's own taste
 * neighbourhood, one carrying each side of the contrast.
 */
export function planQuestion(
  trade: Trade,
  room: RoomType,
  dims: DimensionScore[],
  crowd: VenueEvidence[],
  rescore: (dims: DimensionScore[]) => DecodedWord[],
  clientLabel: string,
  clientWords: string[],
): ClarifyingQuestion | undefined {
  const seen = new Set<string>();
  const candidates: { a: DimensionId; b: DimensionId; impact: number; closeness: number }[] = [];
  for (const d of DIMENSIONS) {
    const key = [d.id, d.opposite].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const ifA = applyClientAnswer(dims, d.id, d.opposite);
    const ifB = applyClientAnswer(dims, d.opposite, d.id);
    const valuesA = specValues(trade, room, ifA, rescore(ifA), clientWords);
    const valuesB = specValues(trade, room, ifB, rescore(ifB), clientWords);
    let impact = 0;
    for (const [id, value] of valuesA) if (valuesB.get(id) !== value) impact++;
    const sa = dims.find((x) => x.id === d.id)?.score ?? 0;
    const sb = dims.find((x) => x.id === d.opposite)?.score ?? 0;
    candidates.push({ a: d.id, b: d.opposite, impact, closeness: Math.abs(sa - sb) });
  }
  candidates.sort((x, y) => y.impact - x.impact || x.closeness - y.closeness);

  const byAffinity = [...crowd].sort((x, y) => (y.affinity ?? 0) - (x.affinity ?? 0));
  for (const c of candidates) {
    if (c.impact < 2) break;
    const venueA = byAffinity.find((v) => v.dimensions.includes(c.a) && !v.dimensions.includes(c.b));
    const venueB = byAffinity.find((v) => v.dimensions.includes(c.b) && !v.dimensions.includes(c.a));
    if (!venueA || !venueB) continue;
    return {
      dimension: c.a,
      versus: c.b,
      prompt: `It's Friday, 8pm, and someone else is paying. Where would ${clientLabel} rather spend the evening?`,
      optionA: { entity_id: venueA.entity_id, name: venueA.name, carries: c.a },
      optionB: { entity_id: venueB.entity_id, name: venueB.name, carries: c.b },
      expectedImpact: c.impact,
    };
  }
  return undefined;
}

export function dimensionLabel(id: DimensionId) {
  return DIMENSION_BY_ID[id].label;
}
