// Influence map: which of the client's loves actually moved each spec line.
//
// Leave-one-out against Qloo. For each reference used as a signal, ask Qloo for
// the taste-matched places again with that reference removed (same geography,
// same city baseline, same taste tags, same answer), rebuild the spec, and
// compare. A reference "decides" a line when removing it changes the line's
// value; it "pushes" an atmosphere by how much the score drops without it.
// This is measured, not attributed by a model: every query is ledgered.
//
// It also yields a robustness figure: lines that survive dropping any single
// reference don't hang on one band or one show the client happened to mention.

import { applyClientAnswer, classifyVenue, computeDimensions, hasText } from "./fingerprint";
import { Ledger } from "./ledger";
import { QlooClient, type Params, type Transport } from "./qloo/client";
import { decodeWords, signalIds } from "./refine";
import { buildSpec } from "./spec";
import type { Brief, DimensionId, DimensionScore, InfluenceMap } from "./types";

const PLACE = "urn:entity:place";
const WANT = 40;
const MIN_USABLE = 6;

function withAnswer(brief: Brief, dims: DimensionScore[]): DimensionScore[] {
  const q = brief.question;
  if (!q?.answer || q.answer === "neither") return dims;
  const chosen = q.answer === "A" ? q.optionA : q.optionB;
  const rejected = q.answer === "A" ? q.optionB : q.optionA;
  return applyClientAnswer(dims, chosen.carries, rejected.carries);
}

function specFor(brief: Brief, dims: DimensionScore[]) {
  const effective = withAnswer(brief, dims);
  const words = decodeWords(brief, effective);
  return buildSpec(brief.input.trade, brief.input.room, effective, words, brief.input.words, undefined, { evidenceUsable: true, evidenceLedger: [], signalEntityIds: [] });
}

function scopeParams(brief: Brief): Params {
  const city = brief.input.city;
  if (!brief.scope || brief.scope === "city") return { "filter.location.query": city };
  if (brief.scope === "weighted") return { "signal.location.query": city };
  return {};
}

export async function computeInfluence(brief: Brief, transport: Transport, opts: { signal?: AbortSignal; budgetMs?: number } = {}): Promise<{ brief: Brief; influence: InfluenceMap }> {
  if (brief.status !== "COMPLETE" && brief.status !== "NEEDS_CLARIFICATION") throw new Error("This brief has no usable evidence to attribute.");
  const ids = signalIds(brief);
  if (ids.length < 2) throw new Error("Influence needs at least two references the agent could use.");
  const names = new Map(brief.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => [r.chosen!.entity_id, r.chosen!.name] as const));
  const tags = brief.tasteTags ?? [];
  const mapped = brief.tagMap?.mapped;
  const full = computeDimensions(brief.crowdVenues, brief.baseVenues, tags, { evidenceUsable: true });
  const fullSpec = specFor(brief, full);

  const ledger = new Ledger(brief.ledger);
  const qloo = new QlooClient(transport, ledger, { deadline: Date.now() + (opts.budgetMs ?? 45_000), signal: opts.signal, maxCalls: ids.length * 3 + 2 });
  const evidence: number[] = [];
  const refs: InfluenceMap["references"] = [];

  for (const id of ids) {
    const rest = ids.filter((x) => x !== id);
    const r = await qloo.insightsEntities({ "filter.type": PLACE, "signal.interests.entities": rest, ...scopeParams(brief) }, `Leave-one-out: taste-matched places without "${names.get(id) ?? id}"`, WANT);
    evidence.push(...r.evidence);
    const crowd = r.value.filter((e) => hasText(e) && !ids.includes(e.entity_id)).map((e) => classifyVenue(e, mapped));
    const usable = crowd.length >= MIN_USABLE;
    const dims = usable ? computeDimensions(crowd, brief.baseVenues, tags, { evidenceUsable: true }) : full;
    const spec = specFor(brief, dims);
    const push = {} as Record<DimensionId, number>;
    for (const d of full) push[d.id] = +(d.score - (dims.find((x) => x.id === d.id)?.score ?? 0)).toFixed(3);
    refs.push({
      entity_id: id,
      name: names.get(id) ?? id,
      usable,
      crowdN: crowd.length,
      push,
      decides: usable ? fullSpec.filter((l) => spec.find((x) => x.id === l.id)?.value !== l.value).map((l) => ({ lineId: l.id, without: spec.find((x) => x.id === l.id)?.value ?? "" })) : [],
    });
  }

  const lines = fullSpec.map((l) => {
    const deciders = refs.filter((r) => r.decides.some((d) => d.lineId === l.id)).map((r) => r.entity_id);
    return { lineId: l.id, category: l.category, value: l.value, deciders, robust: deciders.length === 0 };
  });
  const influence: InfluenceMap = {
    computedAt: new Date().toISOString(),
    method: "leave-one-out",
    references: refs,
    lines,
    robustLines: lines.filter((l) => l.robust).length,
    evidence,
  };
  const e = await ledger.append("computation", `Influence map: ${influence.robustLines} of ${lines.length} lines survive dropping any one reference`, {
    method: "leave-one-out over resolved references; same scope, baseline, taste tags and answer",
    references: refs.map((r) => ({ id: r.entity_id, crowdN: r.crowdN, usable: r.usable, decides: r.decides.map((d) => d.lineId) })),
  });
  influence.evidence.push(e.seq);
  return {
    brief: {
      ...brief,
      updatedAt: new Date().toISOString(),
      influence,
      ledger: ledger.entries,
      stats: { ...brief.stats, qlooRequests: brief.stats.qlooRequests + qloo.stats.requests, qlooAttempts: brief.stats.qlooAttempts + qloo.stats.attempts, qlooMs: brief.stats.qlooMs + qloo.stats.ms },
    },
    influence,
  };
}
