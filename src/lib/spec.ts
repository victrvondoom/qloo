// Spec assembly, the literal-reading counterfactual, provenance per line, and
// the clarifying-question planner.
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
  LineBasis,
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

/** A word like "warm" or "cozy" can mean warm light; respect that as a floor. */
export function warmFloor(clientWords: string[]): boolean {
  return clientWords.some((w) => lexiconFor(w)?.some((r) => r.dimension === "low_glow"));
}

/** B0: the spec from the client's words alone, with the same hard constraints. */
export function literalSpec(trade: Trade, room: RoomType, clientWords: string[]) {
  return runRulebook(trade, literalVector(clientWords), room, { warmFloor: warmFloor(clientWords) });
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
    exemplarIds: dim.exemplars.map((e) => e.entity_id),
  };
}

const certainty = (d: DimensionScore) => Math.abs(2 * d.pGreater - 1);

export interface SpecContext {
  /** False when evidence was unavailable or insufficient: every line falls back to literal. */
  evidenceUsable: boolean;
  evidenceLedger: number[];
  signalEntityIds: string[];
}

export function buildSpec(
  trade: Trade,
  room: RoomType,
  dims: DimensionScore[],
  words: DecodedWord[],
  clientWords: string[],
  previous?: SpecLine[],
  ctx: SpecContext = { evidenceUsable: true, evidenceLedger: [], signalEntityIds: [] },
): SpecLine[] {
  const opts = { warmFloor: warmFloor(clientWords) };
  const lines = ctx.evidenceUsable ? runRulebook(trade, intentVector(dims, words), room, opts) : literalSpec(trade, room, clientWords);
  const literal = literalSpec(trade, room, clientWords);
  return lines.map((l) => {
    const drivers = l.drivers.map((id) => dims.find((d) => d.id === id)).filter((d): d is DimensionScore => Boolean(d));
    const literalValue = literal.find((x) => x.id === l.id)?.value ?? "";
    const strongest = drivers.length ? Math.max(...drivers.map(certainty)) : 0;
    const evidenceAgrees = drivers.some((d) => d.score > 0 && certainty(d) >= 0.5);

    let basis: LineBasis;
    if (!ctx.evidenceUsable) basis = "literal_fallback";
    else if (l.constraints?.some((c) => c.startsWith("warm-floor applied"))) basis = "constraint";
    else if (drivers.some((d) => d.clientAdjusted)) basis = "client_answer";
    else if (l.value !== literalValue || evidenceAgrees) basis = "qloo_evidence";
    else basis = "client_words";

    // Confidence comes from evidence, never from the client's words alone.
    let confidence: SpecLine["confidence"] = "low";
    if (basis === "client_answer" || basis === "constraint") confidence = "high";
    else if (basis === "qloo_evidence") confidence = strongest >= 0.8 && l.margin >= 0.3 ? "high" : strongest >= 0.5 ? "medium" : "low";

    const prev = previous?.find((p) => p.id === l.id);
    // A pro's decision survives a re-score only if the line's value didn't change.
    const keep = prev && prev.value === l.value;
    return {
      id: l.id,
      category: l.category,
      value: l.value,
      why: basis === "literal_fallback" ? "No usable Qloo evidence: this is the literal reading of the client's words." : l.why,
      basis,
      evidence: ctx.evidenceUsable ? drivers.map(evidenceFor) : [],
      evidenceLedger: ctx.evidenceUsable ? ctx.evidenceLedger : [],
      signalEntityIds: ctx.evidenceUsable ? ctx.signalEntityIds : [],
      constraints: l.constraints ?? [],
      confidence,
      literalValue,
      status: keep ? prev.status : "proposed",
      revisedTo: keep ? prev.revisedTo : undefined,
      note: keep ? prev.note : undefined,
      // History is append-only: carried across re-scores even when the value changes.
      history: prev?.history ?? [],
    };
  });
}

/** Every value each rulebook line can take, found by sweeping extreme vectors. */
export function specMenu(trade: Trade, room: RoomType, clientWords: string[] = []): Record<string, { category: string; values: string[] }> {
  const vectors: Vector[] = [zeroVector()];
  for (const d of DIMENSIONS) {
    for (const s of [1, 0.5, -0.5, -1]) {
      const v = zeroVector();
      v[d.id] = s;
      vectors.push(v);
    }
  }
  const menu: Record<string, { category: string; values: string[] }> = {};
  const opts = { warmFloor: warmFloor(clientWords) };
  for (const v of vectors) {
    for (const l of runRulebook(trade, v, room, opts)) {
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

function diffCount(a: Map<string, string>, b: Map<string, string>) {
  let n = 0;
  for (const [id, v] of a) if (b.get(id) !== v) n++;
  return n;
}

/** P(client prefers a over b) from the evidence: logistic in the score gap. */
export function answerPrior(dims: DimensionScore[], a: DimensionId, b: DimensionId): number {
  const sa = dims.find((x) => x.id === a)?.score ?? 0;
  const sb = dims.find((x) => x.id === b)?.score ?? 0;
  return 1 / (1 + Math.exp(-3 * (sa - sb)));
}

function entropy(p: number) {
  const h = (x: number) => (x <= 0 || x >= 1 ? 0 : -x * Math.log2(x));
  return h(p) + h(1 - p);
}

export interface QuestionCandidate {
  a: DimensionId;
  b: DimensionId;
  pA: number;
  impact: number;
  expectedChange: number;
  entropyBits: number;
}

/**
 * Expected-decision-change question planning. For each contrast pair (a
 * dimension and its opposite) simulate both answers, rebuild the spec under
 * each, and compute:
 *   impact          = lines that differ between the two answers
 *   expectedChange  = P(A)·|spec_A − spec_now| + P(B)·|spec_B − spec_now|
 * where P(A) comes from the evidence. A question is only worth asking when the
 * answer is genuinely uncertain AND is expected to change at least one line;
 * a contrast the evidence has already settled has low expected change because
 * the likely answer leaves the spec where it is.
 */
export function rankQuestions(
  trade: Trade,
  room: RoomType,
  dims: DimensionScore[],
  rescore: (dims: DimensionScore[]) => DecodedWord[],
  clientWords: string[],
): QuestionCandidate[] {
  const now = specValues(trade, room, dims, rescore(dims), clientWords);
  const seen = new Set<string>();
  const out: QuestionCandidate[] = [];
  for (const d of DIMENSIONS) {
    const key = [d.id, d.opposite].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const ifA = applyClientAnswer(dims, d.id, d.opposite);
    const ifB = applyClientAnswer(dims, d.opposite, d.id);
    const valuesA = specValues(trade, room, ifA, rescore(ifA), clientWords);
    const valuesB = specValues(trade, room, ifB, rescore(ifB), clientWords);
    const pA = answerPrior(dims, d.id, d.opposite);
    out.push({
      a: d.id,
      b: d.opposite,
      pA,
      impact: diffCount(valuesA, valuesB),
      expectedChange: pA * diffCount(valuesA, now) + (1 - pA) * diffCount(valuesB, now),
      entropyBits: entropy(pA),
    });
  }
  return out.sort((x, y) => y.expectedChange - x.expectedChange || y.entropyBits - x.entropyBits);
}

export const MIN_EXPECTED_CHANGE = 1;
export const MIN_ENTROPY_BITS = 0.5;

export function planQuestion(
  trade: Trade,
  room: RoomType,
  dims: DimensionScore[],
  crowd: VenueEvidence[],
  rescore: (dims: DimensionScore[]) => DecodedWord[],
  clientLabel: string,
  clientWords: string[],
): ClarifyingQuestion | undefined {
  const byAffinity = [...crowd].sort((x, y) => (y.affinity ?? 0) - (x.affinity ?? 0));
  for (const c of rankQuestions(trade, room, dims, rescore, clientWords)) {
    if (c.expectedChange < MIN_EXPECTED_CHANGE || c.entropyBits < MIN_ENTROPY_BITS || c.impact < 2) continue;
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
      pA: c.pA,
      expectedChange: c.expectedChange,
      entropyBits: c.entropyBits,
    };
  }
  return undefined;
}

export function dimensionLabel(id: DimensionId) {
  return DIMENSION_BY_ID[id].label;
}
