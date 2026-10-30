// Clarification optimizer, explained. The agent already asks at most one question, and only when simulating
// both answers shows it would change at least MIN_EXPECTED_CHANGE specification lines and the evidence can't
// call it (see spec.ts). This module shows its working: every candidate contrast it considered, why each was
// asked or held back, and, for the question asked, exactly which lines each answer would change.
//
// The ranking metric is a decision-impact heuristic: the expected number of spec lines whose value changes,
// weighted by a prior taken from the evidence. It is not calibrated information gain.

import { limitsOf } from "./constraints";
import { applyClientAnswer } from "./fingerprint";
import { decodeWords, effectiveDimensions } from "./refine";
import { runRulebook } from "./rulebooks";
import { intentVector, MIN_ENTROPY_BITS, MIN_EXPECTED_CHANGE, rankQuestions, warmFloor } from "./spec";
import { DIMENSION_BY_ID } from "./dimensions";
import type { Brief, DimensionId } from "./types";

export interface LineEffect {
  lineId: string;
  category: string;
  from: string;
  to: string;
}

export interface CandidateReport {
  contrast: [string, string];
  expectedChange: number;
  entropyBits: number;
  decision: "asked" | "held back";
  reason: string;
}

export interface ClarificationReport {
  metric: string;
  asked?: { prompt: string; contrast: [string, string]; whyItMatters: string; ifA: LineEffect[]; ifB: LineEffect[]; affected: string[]; answered?: string };
  candidates: CandidateReport[];
  unresolved: string[];
}

export function explainClarification(brief: Brief): ClarificationReport {
  const dims = effectiveDimensions(brief, brief.appliedDepth ?? 0, undefined);
  const limits = limitsOf(brief.input);
  const rescore = (d: typeof dims) => decodeWords(brief, d);
  const specOf = (d: typeof dims) => new Map(runRulebook(brief.input.trade, intentVector(d, rescore(d)), brief.input.room, { warmFloor: warmFloor(brief.input.words), limits }).map((l) => [l.id, l]));
  const now = specOf(dims);
  const ranked = rankQuestions(brief.input.trade, brief.input.room, dims, rescore, brief.input.words, limits);
  const q = brief.question;
  const label = (id: DimensionId) => DIMENSION_BY_ID[id].short.toLowerCase();
  const candidates: CandidateReport[] = ranked.map((c) => {
    const isAsked = Boolean(q) && ((q!.dimension === c.a && q!.versus === c.b) || (q!.dimension === c.b && q!.versus === c.a));
    const reason = isAsked ? "Asked: simulating both answers changes enough lines and the evidence can't call it."
      : c.expectedChange < MIN_EXPECTED_CHANGE ? `Held back: expected to change only ${c.expectedChange.toFixed(1)} line(s) (needs ${MIN_EXPECTED_CHANGE}).`
      : c.entropyBits < MIN_ENTROPY_BITS ? `Held back: the evidence already leans one way (${c.entropyBits.toFixed(2)} bits; needs ${MIN_ENTROPY_BITS}).`
      : c.impact < 2 ? "Held back: the two answers differ on fewer than two lines."
      : q ? "Held back: a higher-ranked question was asked, and one question is the limit." : "Held back: no pair of places from their taste neighbourhood separates these two atmospheres.";
    return { contrast: [label(c.a), label(c.b)], expectedChange: +c.expectedChange.toFixed(2), entropyBits: +c.entropyBits.toFixed(2), decision: isAsked ? "asked" : "held back", reason };
  });
  const base = { metric: "Decision-impact heuristic: the expected number of specification lines whose value changes, weighted by a prior from the evidence. Not calibrated information gain.", candidates };
  const unresolved = brief.spec.filter((l) => l.confidence === "low" && l.basis !== "literal_fallback").map((l) => l.category);
  if (!q) return { ...base, unresolved };
  const effects = (chosen: DimensionId, other: DimensionId): LineEffect[] => {
    const after = specOf(applyClientAnswer(dims, chosen, other));
    return [...after].filter(([id, l]) => now.get(id)?.value !== l.value).map(([id, l]) => ({ lineId: id, category: l.category, from: now.get(id)?.value ?? "", to: l.value }));
  };
  const ifA = effects(q.dimension, q.versus);
  const ifB = effects(q.versus, q.dimension);
  const affected = [...new Set([...ifA, ...ifB].map((e) => e.category))];
  return {
    ...base,
    asked: {
      prompt: q.prompt,
      contrast: [label(q.dimension), label(q.versus)],
      whyItMatters: `The evidence can't tell ${label(q.dimension)} from ${label(q.versus)} for this client, and the answer changes ${affected.length} line(s): ${affected.join(", ") || "none"}.`,
      ifA,
      ifB,
      affected,
      ...(q.answer ? { answered: q.answer } : {}),
    },
    unresolved,
  };
}
