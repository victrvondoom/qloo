// Changing a finished brief without re-running the agent. Two things can move
// a spec after the run: the client's answer to the clarifying question, and
// the depth level (Mainstream / Curated / Deep cut) the designer applies.
// Both go through one path:
//
//   raw evidence for the applied depth  →  client answer (minimum change)  →
//   word decoding  →  rulebook  →  spec (pro decisions kept where values hold)
//
// The raw, unanswered scores live on each depth layer; `brief.dimensions` is
// always the effective vector the current spec was built from.

import { limitsOf } from "./constraints";
import { applyClientAnswer } from "./fingerprint";
import { Ledger } from "./ledger";
import { buildSpec } from "./spec";
import { decodeWord, normaliseWord } from "./words";
import type { Brief, ClarifyingQuestion, DecodedWord, DimensionScore, LlmBaseline, SpecLine } from "./types";

export type DepthLevel = 0 | 1 | 2;

/** The atmosphere vector a spec at `level` uses, with the client's answer applied. */
export function effectiveDimensions(brief: Brief, level: DepthLevel = brief.appliedDepth ?? 0, answer = brief.question?.answer): DimensionScore[] {
  const layer = brief.depth?.find((d) => d.level === level && d.usable);
  // Briefs from before depth layers existed: their stored vector is the base (re-applying an answer is a no-op).
  let dims = layer ? layer.dimensions : brief.dimensions;
  const q = brief.question;
  if (q && answer && answer !== "neither") {
    const chosen = answer === "A" ? q.optionA : q.optionB;
    const rejected = answer === "A" ? q.optionB : q.optionA;
    dims = applyClientAnswer(dims, chosen.carries, rejected.carries);
  }
  return dims;
}

/** Re-decode the client's words against a vector, reusing any model readings recorded in the run. */
export function decodeWords(brief: Brief, dims: DimensionScore[]): DecodedWord[] {
  const cache = new Map<string, DecodedWord["readings"]>();
  for (const w of brief.words) if (w.source === "llm") cache.set(normaliseWord(w.word), w.readings);
  return brief.input.words.map((w) => {
    const cached = cache.get(normaliseWord(w));
    return cached?.length
      ? decodeWord(w, dims, cached.map((r) => ({ dimension: r.dimension, meaning: r.meaning, isDictionaryDefault: r.isDictionaryDefault })), "llm")
      : decodeWord(w, dims);
  });
}

export function signalIds(brief: Brief): string[] {
  return [...new Set(brief.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => r.chosen!.entity_id))].sort();
}

/** The Qloo requests behind a depth level (falls back to what the current spec cites). */
export function layerEvidence(brief: Brief, level: DepthLevel): number[] {
  const layer = brief.depth?.find((d) => d.level === level);
  if (layer?.evidence.length) return layer.evidence;
  return brief.spec.find((l) => l.evidenceLedger.length)?.evidenceLedger ?? [];
}

export function auditBaseline(baseline: LlmBaseline, spec: SpecLine[]): LlmBaseline {
  if (!baseline.lines) return baseline;
  return {
    ...baseline,
    audit: baseline.lines.map((l) => {
      const line = spec.find((s) => s.category === l.category);
      return { category: l.category, llmValue: l.value, evidenceValue: line?.value ?? "", agrees: line?.value === l.value };
    }),
  };
}

export function rebuild(brief: Brief, level: DepthLevel, answer: ClarifyingQuestion["answer"], extraEvidence: number[] = []) {
  const dims = effectiveDimensions(brief, level, answer);
  const words = decodeWords(brief, dims);
  const spec = buildSpec(brief.input.trade, brief.input.room, dims, words, brief.input.words, brief.spec, {
    evidenceUsable: true,
    evidenceLedger: [...layerEvidence(brief, level), ...extraEvidence],
    signalEntityIds: signalIds(brief),
    limits: limitsOf(brief.input),
  });
  const changed = spec.filter((l) => brief.spec.find((p) => p.id === l.id)?.value !== l.value);
  return { dims, words, spec, changed };
}

/** Apply a depth level's evidence to the spec. No Qloo calls: the layer must already be computed. */
export async function applyDepth(brief: Brief, level: DepthLevel): Promise<{ brief: Brief; changed: string[] }> {
  if ((brief.appliedDepth ?? 0) === level) return { brief, changed: [] };
  const layer = brief.depth?.find((d) => d.level === level);
  if (!layer) throw new Error("That depth hasn't been explored yet.");
  if (!layer.usable) throw new Error(layer.note ?? "That depth has too little evidence to build a spec from.");
  if (brief.status === "INSUFFICIENT_EVIDENCE" || brief.status === "UPSTREAM_UNAVAILABLE") throw new Error("This brief has no usable evidence to personalise from.");
  const ledger = new Ledger(brief.ledger);
  const { dims, words, spec, changed } = rebuild(brief, level, brief.question?.answer);
  await ledger.append("decision", `Spec switched to depth "${layer.label}"`, {
    from: brief.appliedDepth ?? 0,
    to: level,
    popularityMax: layer.popularityMax ?? null,
    method: layer.method,
    changedLines: changed.map((l) => ({ id: l.id, value: l.value })),
  });
  return {
    brief: {
      ...brief,
      updatedAt: new Date().toISOString(),
      appliedDepth: level,
      dimensions: dims,
      words,
      spec,
      llmBaseline: auditBaseline(brief.llmBaseline, spec),
      ledger: ledger.entries,
    },
    changed: changed.map((l) => l.category),
  };
}
