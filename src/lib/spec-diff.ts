// Semantic diff between two compiled specifications. A line is "changed" only
// when its meaning changed (its machine value, or its text once case,
// punctuation and spacing are ignored). Evidence changes, constraint changes and
// explanation-only changes are reported separately, so rewording is never
// mistaken for a revision and a revision is never missed because the words match.

import { rangeLabel, type Limits } from "./constraints";
import type { CompiledLine, CompiledSpec } from "./compiler";
import { canonicalJson } from "./ledger";

export type LineChange = "none" | "explanation_only" | "evidence" | "constraint" | "semantic_value" | "added" | "removed";
export type DisplayStatus = "UNCHANGED" | "REVISED" | "NEEDS_REVIEW";

export interface LineDiff {
  id: string;
  category: string;
  change: LineChange;
  display: DisplayStatus;
  before?: string;
  after?: string;
  /** What drove a changed value: a written limit, the evidence, or the client's words. */
  cause?: "limit" | "evidence" | "words" | "unknown";
  reason: string;
}

export interface InputChanges {
  words: { added: string[]; removed: string[] };
  loves: { added: string[]; removed: string[]; replaced: { from: string; to: string }[] };
  limits: { field: string; from: string; to: string }[];
  /** References the designer pinned to a specific entity, before and after. */
  pinned: { input: string; from?: string; to?: string }[];
  dataMode?: { from: string; to: string };
  status?: { from: string; to: string };
}

export interface SpecDiff {
  schema: "tastespec.diff/1";
  fromVersionId: string;
  toVersionId: string;
  input: InputChanges;
  lines: LineDiff[];
  counts: { unchanged: number; revised: number; needsReview: number; explanationOnly: number; evidenceOnly: number; constraintOnly: number };
  /** Lines that did not change in meaning. */
  preserved: string[];
  /** Accepted decisions that no longer match the revised line. */
  invalidatedDecisions: string[];
  /** What to re-check after this revision. */
  reverify: string[];
  /** The client's written limits are identical before and after, and still hold. */
  limitsUnchanged: boolean;
}

/** Case, punctuation and spacing do not count; the decimal point in a number does. */
const norm = (s: string) => s.toLowerCase().replace(/(?<!\d)\.|\.(?!\d)/g, " ").replace(/[^a-z0-9.%]+/g, " ").replace(/\s+/g, " ").trim();
/** A constraint note without the rulebook text it quotes, so the same constraint reads the same. */
const noteHead = (c: string) => c.replace(/:\s*the rulebook said.*$/i, "").trim();
const sameMachine = (a: CompiledLine, b: CompiledLine) => (a.machine.kind === "text" || b.machine.kind === "text" ? norm(a.requirement) === norm(b.requirement) : canonicalJson(a.machine) === canonicalJson(b.machine));
const evidenceKey = (l: CompiledLine) => canonicalJson({ basis: l.basis, e: l.evidenceSummary.map((e) => [e.atmosphere, Math.round(e.lift * 10) / 10]).sort() });
const sameSet = (a: string[], b: string[]) => canonicalJson([...a].sort()) === canonicalJson([...b].sort());

const limitFields = (l: Limits): Record<string, string> => ({
  "colour temperature": l.cct ? rangeLabel(l.cct) : "not set",
  "minimum CRI": l.criMin ? String(l.criMin) : "not set",
  "dimming floor": l.dimTo ? `${l.dimTo}%` : l.dimmable ? "must dim" : "not set",
  "lux target": l.luxTarget ? `${l.luxTarget} lx` : "not set",
});

export function diffInputs(a: CompiledSpec, b: CompiledSpec): InputChanges {
  const aw = new Set(a.brief.words.map(norm));
  const bw = new Set(b.brief.words.map(norm));
  const al = a.brief.loves.filter((l) => !b.brief.loves.some((x) => norm(x) === norm(l)));
  const bl = b.brief.loves.filter((l) => !a.brief.loves.some((x) => norm(x) === norm(l)));
  const replaced = al.length && bl.length ? al.slice(0, Math.min(al.length, bl.length)).map((from, i) => ({ from, to: bl[i] })) : [];
  const fa = limitFields(a.limits);
  const fb = limitFields(b.limits);
  return {
    words: { added: [...bw].filter((w) => !aw.has(w)), removed: [...aw].filter((w) => !bw.has(w)) },
    loves: { added: bl.slice(replaced.length), removed: al.slice(replaced.length), replaced },
    limits: Object.keys(fa).filter((k) => fa[k] !== fb[k]).map((k) => ({ field: k, from: fa[k], to: fb[k] })),
    pinned: [...new Set([...Object.keys(a.brief.pinned ?? {}), ...Object.keys(b.brief.pinned ?? {})])].filter((k) => (a.brief.pinned ?? {})[k] !== (b.brief.pinned ?? {})[k]).map((k) => ({ input: k, from: (a.brief.pinned ?? {})[k], to: (b.brief.pinned ?? {})[k] })),
    ...(a.dataMode !== b.dataMode ? { dataMode: { from: a.dataMode, to: b.dataMode } } : {}),
    ...(a.status !== b.status ? { status: { from: a.status, to: b.status } } : {}),
  };
}

export function diffSpecs(a: CompiledSpec, b: CompiledSpec): SpecDiff {
  const input = diffInputs(a, b);
  const limitsMoved = new Set(input.limits.map((x) => x.field));
  const ids = [...new Set([...a.lines.map((l) => l.id), ...b.lines.map((l) => l.id)])];
  const lines: LineDiff[] = [];
  const invalidated: string[] = [];
  for (const id of ids) {
    const x = a.lines.find((l) => l.id === id);
    const y = b.lines.find((l) => l.id === id);
    if (!x || !y) {
      lines.push({ id, category: (y ?? x)!.category, change: x ? "removed" : "added", display: "REVISED", before: x?.requirement, after: y?.requirement, reason: x ? "The revised specification has no such line." : "The revised specification adds this line." });
      continue;
    }
    const valueSame = sameMachine(x, y);
    const consSame = sameSet(x.hardConstraints.map(noteHead), y.hardConstraints.map(noteHead));
    const evSame = evidenceKey(x) === evidenceKey(y);
    const explSame = norm(x.rationale) === norm(y.rationale) && x.confidence === y.confidence;
    const lineLimitMoved = (id === "cct" && limitsMoved.has("colour temperature")) || (id === "cri" && limitsMoved.has("minimum CRI")) || (id === "dimming" && limitsMoved.has("dimming floor")) || (id === "level" && limitsMoved.has("lux target"));
    let change: LineChange = "none";
    let reason = "No change in meaning.";
    let cause: LineDiff["cause"];
    if (!valueSame) {
      change = "semantic_value";
      cause = lineLimitMoved ? "limit" : !evSame ? "evidence" : input.words.added.length || input.words.removed.length ? "words" : "unknown";
      reason = cause === "limit" ? "The client's written limit for this line changed, and the line follows it." : cause === "evidence" ? "The Qloo evidence behind this line changed, which changed what the rulebook chose." : cause === "words" ? "The client's words changed, which changed how the evidence is read." : "The value changed; no single input explains it.";
    } else if (!consSame) {
      change = "constraint";
      reason = "The same value, but the constraints bounding it changed.";
    } else if (!evSame) {
      change = "evidence";
      reason = "The same value, resting on different evidence.";
    } else if (!explSame) {
      change = "explanation_only";
      reason = "Only the explanation or confidence wording changed; the requirement is the same.";
    }
    const wasAccepted = x.review === "accepted";
    const needs = change === "semantic_value" && wasAccepted;
    if (needs) invalidated.push(id);
    lines.push({
      id,
      category: y.category,
      change,
      display: needs ? "NEEDS_REVIEW" : change === "semantic_value" || change === "constraint" ? "REVISED" : "UNCHANGED",
      before: x.requirement,
      after: y.requirement,
      ...(cause ? { cause } : {}),
      reason: needs ? `${reason} It had been accepted, so the decision must be reviewed again.` : reason,
    });
  }
  const c = (f: (l: LineDiff) => boolean) => lines.filter(f).length;
  const limitsUnchanged = input.limits.length === 0;
  const reverify = [
    ...(input.limits.length ? [`Written limits changed (${input.limits.map((l) => l.field).join(", ")}): re-check every line against them.`] : []),
    ...(input.loves.added.length || input.loves.removed.length || input.loves.replaced.length ? ["References changed: re-check each evidence-based line and any open question."] : []),
    ...(input.pinned.length ? [`A reference was pinned to a specific entity (${input.pinned.map((p) => p.input).join(", ")}): re-check what it resolved to.`] : []),
    ...invalidated.map((id) => `Accepted decision on "${lines.find((l) => l.id === id)!.category}" is invalidated.`),
    ...(input.dataMode ? [`Data mode changed from ${input.dataMode.from} to ${input.dataMode.to}: the evidence is not comparable.`] : []),
    ...(input.status ? [`Run status changed from ${input.status.from} to ${input.status.to}.`] : []),
  ];
  return {
    schema: "tastespec.diff/1",
    fromVersionId: a.versionId,
    toVersionId: b.versionId,
    input,
    lines,
    counts: { unchanged: c((l) => l.change === "none" || l.change === "explanation_only"), revised: c((l) => l.change === "semantic_value" || l.change === "added" || l.change === "removed"), needsReview: c((l) => l.display === "NEEDS_REVIEW"), explanationOnly: c((l) => l.change === "explanation_only"), evidenceOnly: c((l) => l.change === "evidence"), constraintOnly: c((l) => l.change === "constraint") },
    preserved: lines.filter((l) => l.change === "none" || l.change === "explanation_only").map((l) => l.id),
    invalidatedDecisions: invalidated,
    reverify,
    limitsUnchanged,
  };
}
