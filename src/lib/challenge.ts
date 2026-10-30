// The decision challenge engine: question any specification line and get answers
// computed from the actual decision record (the brief's evidence, the rulebook's
// choice and margin, the client's written limits) and from the real verifier.
// Nothing here writes an explanation after the fact; it recomputes the decision.
//
//   why       what decided this value: client statements, Qloo evidence, rule, limits, alternatives
//   why_not   evaluate a proposed alternative against the same limits and rules, with consequences
//   prove     run the verifier and show this line's findings
//   repair    the smallest valid correction for a failing line, with consequences; applying it
//             is a separate, explicit, ledgered step
//
// "what if" is the revision engine (revise.ts): it changes the brief and reruns the agent.

import { applyCctRange, applyCriLimit, applyDimLimit, applyLuxLimit, limitsOf, limitProblem, type Limits } from "./constraints";
import { compileSpec, machineValue, type CompiledLine, type CompiledSpec } from "./compiler";
import { decodeWords, effectiveDimensions } from "./refine";
import { runRulebook } from "./rulebooks";
import { intentVector, specMenu, warmFloor } from "./spec";
import { verifySpec, type Diagnostic, type Verification } from "./verify-spec";
import type { Brief } from "./types";

export type ChallengeOp = "why" | "why_not" | "prove" | "repair";
export type Verdict = "ALLOWED" | "BLOCKED" | "UNSUPPORTED" | "SAME";

export interface Alternative {
  value: string;
  verdict: Verdict;
  reasons: string[];
}

export interface WhyAnswer {
  op: "why";
  lineId: string;
  category: string;
  value: string;
  decidedBy: { basis: string; rule: string; margin?: number; drivers: string[]; summary: string };
  clientStatements: string[];
  evidence: CompiledLine["evidenceSummary"];
  evidenceIds: number[];
  constraints: { text: string; held: boolean }[];
  literalValue: string;
  alternatives: Alternative[];
  needsInfo: string[];
}

export interface Consequences {
  newFindings: Diagnostic[];
  resolvedFindings: Diagnostic[];
}

export interface WhyNotAnswer {
  op: "why_not";
  lineId: string;
  category: string;
  proposed: string;
  verdict: Verdict;
  /** The value that would be recorded if applied. */
  normalised?: string;
  reasons: string[];
  evidenceView: string;
  consequences?: Consequences;
  needsInfo: string[];
}

export interface ProveAnswer {
  op: "prove";
  lineId: string;
  category: string;
  findings: Diagnostic[];
  passes: Diagnostic[];
  overall: Verification["documentStatus"];
  errors: number;
}

export interface RepairAnswer {
  op: "repair";
  lineId: string;
  category: string;
  problems: string[];
  proposal?: { value: string; because: string };
  consequences?: Consequences;
  requiresApproval: true;
  note: string;
}

export type ChallengeAnswer = WhyAnswer | WhyNotAnswer | ProveAnswer | RepairAnswer;

export class ChallengeError extends Error {}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").trim();
const key = (d: Diagnostic) => `${d.lineId}|${d.code}|${d.severity}`;

/** Turn what a person typed into the value the rulebook would record for that line, or say why it can't be. */
export function normaliseAlternative(lineId: string, text: string, limits: Limits | undefined, lineMenu: string[]): { value?: string; unsupported?: string; impossible?: string } {
  const t = text.trim();
  if (!t) return { unsupported: "Say what you would choose instead." };
  const exact = lineMenu.find((v) => clean(v) === clean(t));
  if (exact) return { value: exact };
  if (lineId === "cct") {
    const m = /(\d{4})\s*k?(?:\s*(?:-|–|to)\s*(\d{4}))?/i.exec(t);
    if (!m) return { unsupported: "A colour temperature is written like 2700K, or 2200–2700K." };
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : undefined;
    for (const k of [a, b].filter((x): x is number => x !== undefined)) if (k < 1800 || k > 6500) return { impossible: `${k}K is outside what a room specification can use (1800–6500K).` };
    if (b !== undefined && b < a) return { impossible: `${a}–${b}K runs backwards.` };
    return { value: b ? `${a}–${b}K` : `${a}K throughout` };
  }
  if (lineId === "cri") {
    const m = /(\d{2,3})/.exec(t);
    if (!m) return { unsupported: "A colour rendering target is written like CRI 95." };
    const n = Number(m[1]);
    if (n > 100 || n < 60) return { impossible: `CRI ${n} is not possible: the index runs to 100, and below 60 isn't usable for living spaces.` };
    return { value: `CRI ${n}+.` };
  }
  if (lineId === "dimming") {
    const m = /(\d{1,3})\s*%/.exec(t);
    if (!m) return { unsupported: "A dimming floor is written like 5%." };
    const n = Number(m[1]);
    if (n < 1 || n > 100) return { impossible: n < 1 ? "0% is off, not a dimming level." : `${n}% is above full output.` };
    return { value: applyDimLimit("", n).value };
  }
  if (lineId === "level") {
    if (/lumen|\blm\b/i.test(t)) return { unsupported: "Lumens describe a fitting, not a room. Give a lux target; lumen totals need the room's size and the fittings." };
    const m = /(\d{2,4})\s*(?:lux|lx)\b/i.exec(t);
    if (!m) return { unsupported: "A light-level target is written like 250 lux." };
    const n = Number(m[1]);
    if (n < 5 || n > 2000) return { impossible: `${n} lux is outside what a room target can sensibly be (5–2000).` };
    return { value: applyLuxLimit("", n, "stated by the client or designer").value };
  }
  const hit = lineMenu.find((v) => clean(v).includes(clean(t)) && clean(t).length >= 6);
  if (hit) return { value: hit };
  return { unsupported: `The rulebook has no rule for "${t}". Adopting it would be an unsupported assumption: nothing from Qloo or the client's brief supports it. Choose one of the rulebook's options, or record it as a designer note.` };
}

function withLine(spec: CompiledSpec, lineId: string, value: string): CompiledSpec {
  return { ...spec, lines: spec.lines.map((l) => (l.id === lineId ? { ...l, requirement: value, machine: machineValue(lineId, value) } : l)) };
}

async function consequencesOf(spec: CompiledSpec, lineId: string, value: string): Promise<Consequences> {
  const before = await verifySpec(spec);
  const after = await verifySpec(withLine(spec, lineId, value));
  const b = new Set(before.diagnostics.filter((d) => d.severity !== "PASS").map(key));
  const a = new Set(after.diagnostics.filter((d) => d.severity !== "PASS").map(key));
  return { newFindings: after.diagnostics.filter((d) => d.severity !== "PASS" && !b.has(key(d))), resolvedFindings: before.diagnostics.filter((d) => d.severity !== "PASS" && !a.has(key(d))) };
}

/** What the rulebook chose, how close the runner-up was, and which atmospheres drove it. */
function decisionRecord(brief: Brief, lineId: string) {
  const dims = effectiveDimensions(brief);
  const words = decodeWords(brief, dims);
  const lines = runRulebook(brief.input.trade, intentVector(dims, words), brief.input.room, { warmFloor: warmFloor(brief.input.words), limits: limitsOf(brief.input) });
  const r = lines.find((l) => l.id === lineId);
  return { margin: r ? +r.margin.toFixed(2) : undefined, drivers: r?.drivers.map((d) => d.replace(/_/g, " ")) ?? [] };
}

function problemsFor(line: Pick<CompiledLine, "id">, value: string, limits: Limits | undefined, words: string[]): string[] {
  const out: string[] = [];
  const p = limitProblem(line.id, value, limits);
  if (p) out.push(`It breaks the client's written limit: ${p}.`);
  if (line.id === "cct" && /warm|cozy|cosy|inviting|snug/i.test(words.join(" "))) {
    const ks = (value.match(/\d{4}/g) ?? []).map(Number);
    if (ks.length && Math.min(...ks) > 3000) out.push(`The client used a warm word, so ambient light shouldn't be cooler than 3000K (this is ${Math.min(...ks)}K).`);
  }
  return out;
}

export async function challengeWhy(brief: Brief, spec: CompiledSpec, lineId: string): Promise<WhyAnswer> {
  const line = spec.lines.find((l) => l.id === lineId);
  if (!line) throw new ChallengeError("That line is not in this specification.");
  const limits = limitsOf(brief.input);
  const rec = decisionRecord(brief, lineId);
  const free = specMenu(brief.input.trade, brief.input.room, brief.input.words)[lineId]?.values ?? [];
  const alternatives: Alternative[] = free.map((v) => {
    if (clean(v) === clean(line.requirement)) return { value: v, verdict: "SAME" as const, reasons: ["This is the current choice."] };
    const reasons = problemsFor(line, v, limits, brief.input.words);
    return { value: v, verdict: reasons.length ? ("BLOCKED" as const) : ("ALLOWED" as const), reasons: reasons.length ? reasons : ["Allowed by the client's limits. The evidence and the rulebook preferred the current choice."] };
  });
  const verification = await verifySpec(spec, { brief });
  const lineErrors = verification.diagnostics.filter((d) => d.lineId === lineId && d.severity === "ERROR");
  const constraints = [
    ...line.hardConstraints.map((c) => ({ text: c, held: !lineErrors.length })),
    ...(limitProblem(lineId, line.requirement, limits) === undefined && ((lineId === "cct" && limits?.cct) || (lineId === "cri" && limits?.criMin) || (lineId === "dimming" && limits?.dimTo) || (lineId === "level" && limits?.luxTarget)) ? [{ text: "client's written limit for this line", held: true }] : []),
  ];
  const basisText =
    line.basis === "constraint" ? "A limit the client wrote down decided it; evidence did not."
    : line.basis === "qloo_evidence" ? `Qloo evidence decided it${rec.margin !== undefined ? ` (the runner-up was ${rec.margin <= 0.3 ? "close" : "well behind"}: margin ${rec.margin})` : ""}.`
    : line.basis === "client_answer" ? "The client's answer to a question decided it."
    : line.basis === "client_words" ? "The client's words alone give the same value; the evidence didn't change it."
    : "No usable Qloo evidence: this is the literal reading of the client's words.";
  return {
    op: "why",
    lineId,
    category: line.category,
    value: line.requirement,
    decidedBy: { basis: line.basis, rule: line.interpretationRule, margin: rec.margin, drivers: rec.drivers, summary: line.override ? `The designer replaced the rulebook's value ("${line.override.from}"). ${basisText}` : basisText },
    clientStatements: line.clientRefs,
    evidence: line.evidenceSummary,
    evidenceIds: line.evidenceIds,
    constraints,
    literalValue: line.literalValue,
    alternatives,
    needsInfo: verification.diagnostics.filter((d) => d.lineId === lineId && d.severity === "NEEDS_REVIEW").map((d) => d.message),
  };
}

export async function challengeWhyNot(brief: Brief, spec: CompiledSpec, lineId: string, alternative: string): Promise<WhyNotAnswer> {
  const line = spec.lines.find((l) => l.id === lineId);
  if (!line) throw new ChallengeError("That line is not in this specification.");
  const limits = limitsOf(brief.input);
  const menu = specMenu(brief.input.trade, brief.input.room, brief.input.words)[lineId]?.values ?? [];
  const n = normaliseAlternative(lineId, alternative, limits, menu);
  const base = { op: "why_not" as const, lineId, category: line.category, proposed: alternative.trim().slice(0, 200), needsInfo: [] as string[] };
  if (n.impossible) return { ...base, verdict: "BLOCKED", reasons: [n.impossible], evidenceView: "Not evaluated: the value is impossible." };
  if (n.unsupported || !n.value) return { ...base, verdict: "UNSUPPORTED", reasons: [n.unsupported ?? "Not understood."], evidenceView: "Not evaluated: nothing in the evidence or the rulebook speaks to it." };
  if (clean(n.value) === clean(line.requirement)) return { ...base, verdict: "SAME", normalised: n.value, reasons: ["That is already the current value."], evidenceView: "No change." };
  const reasons = problemsFor(line, n.value, limits, brief.input.words);
  const rec = decisionRecord(brief, lineId);
  const inMenu = menu.some((v) => clean(v) === clean(n.value!));
  const evidenceView = inMenu
    ? `The rulebook knows this option. It chose "${line.override?.from ?? line.requirement}"${rec.margin !== undefined ? ` (margin ${rec.margin}${rec.margin <= 0.3 ? ", a close call" : ""})` : ""} from ${line.evidenceSummary.length ? "the measured atmospheres below" : "the client's words, because no Qloo evidence was usable"}${rec.drivers.length ? `, driven by ${rec.drivers.join(" and ")}` : ""}.`
    : "This value is not one of the rulebook's options. Nothing from Qloo supports or contradicts it, so it would be recorded as a designer override, not as evidence.";
  const consequences = await consequencesOf(spec, lineId, n.value);
  const needsInfo = lineId === "level" || lineId === "dimming" ? ["This still needs a lighting calculation / fitting compatibility check by a professional."] : [];
  if (reasons.length) return { ...base, verdict: "BLOCKED", normalised: n.value, reasons, evidenceView, consequences, needsInfo };
  const newErrors = consequences.newFindings.filter((d) => d.severity === "ERROR");
  if (newErrors.length) return { ...base, verdict: "BLOCKED", normalised: n.value, reasons: newErrors.map((d) => `It would cause a new error: ${d.message}`), evidenceView, consequences, needsInfo };
  return { ...base, verdict: "ALLOWED", normalised: n.value, reasons: [inMenu ? "Allowed by every written limit and consistent with the other lines. The evidence preferred the current value, so choosing this one is the designer's call." : "Allowed by every written limit. It is a designer override: the evidence neither supports nor contradicts it."], evidenceView, consequences, needsInfo };
}

export async function challengeProve(brief: Brief, spec: CompiledSpec, lineId: string): Promise<ProveAnswer> {
  if (!spec.lines.some((l) => l.id === lineId)) throw new ChallengeError("That line is not in this specification.");
  const v = await verifySpec(spec, { brief });
  const mine = v.diagnostics.filter((d) => d.lineId === lineId);
  return { op: "prove", lineId, category: spec.lines.find((l) => l.id === lineId)!.category, findings: mine.filter((d) => d.severity !== "PASS"), passes: mine.filter((d) => d.severity === "PASS"), overall: v.documentStatus, errors: v.counts.ERROR };
}

/** The smallest valid correction for a failing line. Proposes only; applying is separate and explicit. */
export async function challengeRepair(brief: Brief, spec: CompiledSpec, lineId: string): Promise<RepairAnswer> {
  const line = spec.lines.find((l) => l.id === lineId);
  if (!line) throw new ChallengeError("That line is not in this specification.");
  const limits = limitsOf(brief.input);
  const v = await verifySpec(spec, { brief });
  const errors = v.diagnostics.filter((d) => d.lineId === lineId && d.severity === "ERROR");
  const base = { op: "repair" as const, lineId, category: line.category, requiresApproval: true as const };
  if (!errors.length) return { ...base, problems: [], note: "Nothing to repair: this line has no errors." };
  let value: string | undefined;
  let because = "";
  if (lineId === "cct") {
    const warm = /warm|cozy|cosy|inviting|snug/i.test(brief.input.words.join(" "));
    const range = limits?.cct ?? (warm ? { min: 1800, max: 3000 } : undefined);
    if (range) {
      value = applyCctRange(line.requirement, range).value;
      because = limits?.cct ? "Clamped into the client's written range." : "Capped at 3000K because the client used a warm word.";
    }
  } else if (lineId === "cri" && limits?.criMin) {
    value = applyCriLimit(line.requirement, limits.criMin).value;
    because = `Raised to the client's minimum of CRI ${limits.criMin}.`;
  } else if (lineId === "dimming" && limits?.dimTo) {
    value = applyDimLimit(line.requirement, limits.dimTo).value;
    because = `Rewritten to reach the client's ${limits.dimTo}% floor.`;
  } else if (lineId === "level" && limits?.luxTarget) {
    value = applyLuxLimit(line.requirement, limits.luxTarget, "from the client's message").value;
    because = `Set to the client's ${limits.luxTarget} lux target.`;
  }
  const problems = errors.map((e) => e.message);
  if (!value || clean(value) === clean(line.requirement)) return { ...base, problems, note: "No automatic repair: this error isn't caused by a written limit, so there is no minimal valid correction to propose. Rebuild the specification, or re-run the brief." };
  const consequences = await consequencesOf(spec, lineId, value);
  if (consequences.newFindings.some((d) => d.severity === "ERROR")) return { ...base, problems, consequences, note: "The obvious correction would cause a new error, so it is not proposed." };
  return { ...base, problems, proposal: { value, because }, consequences, note: "Nothing has been changed. Applying records a designer revision in the evidence ledger." };
}

/** The value to record when a designer applies an evaluated alternative or repair. Re-evaluated server side; never trusted from the client. */
export async function approvedValue(brief: Brief, spec: CompiledSpec, lineId: string, text: string, mode: "alternative" | "repair"): Promise<string> {
  if (mode === "repair") {
    const r = await challengeRepair(brief, spec, lineId);
    if (!r.proposal) throw new ChallengeError(r.note);
    return r.proposal.value;
  }
  const a = await challengeWhyNot(brief, spec, lineId, text);
  if (a.verdict !== "ALLOWED" || !a.normalised) throw new ChallengeError(a.reasons.join(" ") || "That alternative can't be applied.");
  return a.normalised;
}

export async function compileFor(brief: Brief): Promise<CompiledSpec> {
  return compileSpec(brief);
}
