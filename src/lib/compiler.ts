// The specification compiler: turns a brief the agent produced into a versioned,
// auditable specification package. It adds no new design opinions. Every value
// comes from the brief's spec lines; the compiler gives them machine-readable
// form, names the rule, evidence, constraints and assumptions behind each, and
// lists what is unknown. Verification (verify-spec.ts) and export (spec-export.ts)
// work on this package.
//
// A compiled specification is a taste-informed starting point for professional
// review. It is not an engineering design, not code-compliance evidence and not
// construction-ready, and every export says so.

import { limitsOf, type Limits } from "./constraints";
import { canonicalJson, sha256Hex } from "./ledger";
import { RULEBOOK_VERSION } from "./rulebooks";
import type { Brief, SpecLine } from "./types";

export const SPEC_SCHEMA = "tastespec.spec/1";
export const NOT_CERTIFIED = "This is a taste-informed starting point for professional review. It is not an engineering design, not evidence of code or regulatory compliance, and not construction-ready. Values marked unknown were not available from the client or from Qloo.";

export type MachineValue =
  | { kind: "cct"; unit: "K"; min: number; max: number; ambient: number; task?: number; dimToWarm: boolean }
  | { kind: "cri"; unit: "Ra"; min: number; r9Required: boolean }
  | { kind: "dimming"; unit: "%"; floor?: number; scenes?: number }
  | { kind: "illuminance"; unit: "lx"; target?: number; typicalMin?: number; typicalMax?: number }
  | { kind: "text" };

export type ReviewStatus = "proposed" | "accepted" | "revised" | "rejected";

export interface CompiledLine {
  /** Stable across versions: the rulebook line id. */
  id: string;
  category: string;
  requirement: string;
  machine: MachineValue;
  /** Constraints that bound this line, as recorded by the rulebook. */
  hardConstraints: string[];
  /** What the client said that this line rests on (their words, their written limits, their references). */
  clientRefs: string[];
  /** Ledger sequence numbers of the Qloo requests behind the evidence. */
  evidenceIds: number[];
  /** The measured atmospheres behind the line, as returned: crowd share vs city baseline. */
  evidenceSummary: { atmosphere: string; lift: number; crowd: string; baseline: string }[];
  interpretationRule: string;
  basis: SpecLine["basis"];
  confidence: SpecLine["confidence"];
  uncertainty: string;
  assumptions: string[];
  /** What the literal reading of the client's words would have said. */
  literalValue: string;
  review: ReviewStatus;
  reviewNote?: string;
  /** Set when a designer replaced the rulebook's value (after a challenge). The original stays recorded here. */
  override?: { from: string; by: "designer" };
  /** Content hash of everything above that defines the line's meaning (not its explanation). */
  lineVersion: string;
  /** Why the rulebook chose it, in the rulebook's own words. Explanation only. */
  rationale: string;
}

export interface EvidenceRef {
  seq: number;
  kind: string;
  summary: string;
  hash: string;
}

export interface CompiledSpec {
  schema: typeof SPEC_SCHEMA;
  specId: string;
  /** Hash over the specification's semantic content. Equal content gives an equal id. */
  versionId: string;
  version: number;
  parentVersionId?: string;
  briefId: string;
  compiledAt: string;
  rulebookVersion: string;
  dataMode: "live" | "fixture";
  syntheticNotice?: string;
  evidenceMode: string;
  status: Brief["status"];
  project: string;
  client: { label: string; city: string; room: string; trade: string };
  brief: { words: string[]; loves: string[]; pinned: Record<string, string>; sourceText?: string; usedReferences: string[]; abstainedReferences: string[]; ambiguousReferences: string[] };
  limits: Limits;
  lines: CompiledLine[];
  evidenceRefs: EvidenceRef[];
  ledgerHead?: string;
  assumptions: string[];
  /** Things this document cannot know. */
  unknowns: string[];
  openQuestions: string[];
  notCertified: string;
}

/** What defines a line's meaning (not its explanation). Recomputable from an exported package. */
export async function lineVersionOf(l: Omit<CompiledLine, "lineVersion">): Promise<string> {
  return sha256Hex(canonicalJson({ id: l.id, category: l.category, requirement: l.requirement, machine: l.machine, hardConstraints: l.hardConstraints, evidenceIds: l.evidenceIds, basis: l.basis, rule: l.interpretationRule, dims: l.evidenceSummary.map((e) => [e.atmosphere, e.lift]).sort() }));
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));

export function machineValue(lineId: string, value: string): MachineValue {
  if (lineId === "cct") {
    const ks = (value.match(/\d{4}/g) ?? []).map(Number);
    if (!ks.length) return { kind: "text" };
    const task = /(\d{4})K on task/.exec(value);
    const ambient = /dim-to-warm/.test(value) ? Math.max(ks[0], ks[1] ?? ks[0]) : ks[0];
    return { kind: "cct", unit: "K", min: Math.min(...ks), max: Math.max(...ks), ambient, ...(task ? { task: Number(task[1]) } : {}), dimToWarm: /dim-to-warm/.test(value) };
  }
  if (lineId === "cri") {
    const n = num(/CRI (\d{2,3})\+/.exec(value)?.[1]);
    return n ? { kind: "cri", unit: "Ra", min: n, r9Required: /R9/.test(value) } : { kind: "text" };
  }
  if (lineId === "dimming") {
    const floors = [...value.matchAll(/(\d{1,3})%/g)].map((m) => Number(m[1]));
    const scenes = /three scenes/.test(value) ? 3 : /two scenes/.test(value) ? 2 : undefined;
    return { kind: "dimming", unit: "%", ...(floors.length ? { floor: Math.min(...floors) } : {}), ...(scenes ? { scenes } : {}) };
  }
  if (lineId === "level") {
    const target = num(/(?:~|target\s)(\d{2,4}) lux/.exec(value)?.[1]);
    const typ = /Typical (\d+)–(\d+) lux|typical for this room (\d+)–(\d+) lux/.exec(value);
    return { kind: "illuminance", unit: "lx", ...(target ? { target } : {}), ...(typ ? { typicalMin: Number(typ[1] ?? typ[3]), typicalMax: Number(typ[2] ?? typ[4]) } : {}) };
  }
  return { kind: "text" };
}

/** What the document does not know, per line. These are stated, not inferred away. */
const LINE_ASSUMPTIONS: Record<string, string[]> = {
  cct: ["Applies to the main ambient sources. Which fittings come in this colour temperature is not checked."],
  cri: ["CRI is one colour-fidelity index and not a full account of colour quality. Manufacturer R9 and TM-30 data are not available here."],
  dimming: ["Driver and dimmer compatibility is not assumed; no dimming protocol is specified. Confirm with the manufacturer."],
  level: ["A starting target, not a lighting calculation. Room dimensions, surface reflectances and fittings are not known."],
  layers: ["An aesthetic direction. No products or quantities are selected."],
  fixtures: ["An aesthetic direction. No products, brands or finishes are selected."],
  optics: ["An aesthetic direction. Beam angles are intentions, not photometric data."],
};

const UNKNOWNS = [
  "Room dimensions, ceiling height and surface finishes",
  "Fitting performance (lumen output, beam data, driver and dimmer compatibility)",
  "Daylight contribution and window orientation",
  "Budget, procurement and installation constraints",
  "Applicable local codes and standards",
];

const interpretationRule = (id: string) => `${RULEBOOK_VERSION}:${id}`;

function uncertaintyText(l: SpecLine): string {
  if (l.basis === "literal_fallback") return "No usable Qloo evidence: this is the literal reading of the client's words, at low confidence.";
  if (l.basis === "constraint") return "Set by a limit the client wrote down; evidence did not decide it.";
  if (l.basis === "client_answer") return "Settled by the client's own answer to a question.";
  if (l.basis === "client_words") return "The same as the literal reading of the client's words; evidence did not change it.";
  const top = [...l.evidence].sort((a, b) => b.lift - a.lift)[0];
  return `${l.confidence} confidence${top ? `: strongest atmosphere "${top.dimension.replace(/_/g, " ")}" appears in ${top.crowdHits}/${top.crowdN} of the taste-matched places against ${top.baseHits}/${top.baseN} of typical places in the city (lift x${top.lift.toFixed(1)}). This is an aggregate over places, not a probability about this client.` : "."}`;
}

export async function compileSpec(brief: Brief, opts: { version?: number; parentVersionId?: string; now?: string } = {}): Promise<CompiledSpec> {
  const limits = limitsOf(brief.input) ?? {};
  const used = brief.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => r.chosen!.name);
  const abstained = brief.resolutions.filter((r) => !r.usedAsSignal).map((r) => r.input);
  const ambiguous = brief.resolutions.filter((r) => r.status === "ambiguous").map((r) => r.input);
  const seqs = new Set<number>();
  const lines: CompiledLine[] = [];
  for (const l of brief.spec) {
    for (const s of l.evidenceLedger) seqs.add(s);
    const hard = l.constraints.filter((c) => !c.startsWith("room-range"));
    const clientLimits = l.constraints.filter((c) => c.startsWith("client "));
    const refs = [
      ...brief.input.words.map((w) => `said: "${w}"`),
      ...clientLimits.map((c) => `wrote: ${c.replace(/^client /, "").split(":")[0]}`),
      ...(l.basis === "qloo_evidence" ? used.map((u) => `loves: ${u}`) : []),
    ];
    const overridden = l.status === "revised" && l.revisedTo ? l.revisedTo : undefined;
    const value = overridden ?? l.value;
    const machine = machineValue(l.id, value);
    const line: Omit<CompiledLine, "lineVersion"> = {
      id: l.id,
      category: l.category,
      requirement: value,
      ...(overridden ? { override: { from: l.value, by: "designer" as const } } : {}),
      machine,
      hardConstraints: hard,
      clientRefs: refs,
      evidenceIds: [...l.evidenceLedger].sort((a, b) => a - b),
      evidenceSummary: l.evidence.map((e) => ({ atmosphere: e.dimension, lift: +e.lift.toFixed(2), crowd: `${e.crowdHits}/${e.crowdN}`, baseline: `${e.baseHits}/${e.baseN}` })),
      interpretationRule: interpretationRule(l.id),
      basis: l.basis,
      confidence: l.confidence,
      uncertainty: overridden ? `Set by the designer after a challenge. The rulebook's value was "${l.value}"; the evidence below supported that value, not this one.` : uncertaintyText(l),
      assumptions: LINE_ASSUMPTIONS[l.id] ?? [],
      literalValue: l.literalValue,
      review: l.status,
      ...(l.note ? { reviewNote: l.note } : {}),
      rationale: l.why,
    };
    lines.push({ ...line, lineVersion: await lineVersionOf(line) });
  }
  const evidenceRefs: EvidenceRef[] = brief.ledger.filter((e) => seqs.has(e.seq)).map((e) => ({ seq: e.seq, kind: e.kind, summary: e.summary, hash: e.hash }));
  const semantic = { lines: lines.map((l) => [l.id, l.lineVersion]), limits, rulebook: brief.rulebookVersion, mode: brief.dataMode, status: brief.status, loves: [...brief.input.loves].sort(), words: [...brief.input.words].sort() };
  const versionId = (await sha256Hex(canonicalJson(semantic))).slice(0, 24);
  const open = [
    ...(brief.question && !brief.question.answer ? [`The agent asked: ${brief.question.prompt ?? "a clarifying question"} It is unanswered, so the lines it affects rest on evidence alone.`] : []),
    ...ambiguous.map((a) => `"${a}" matched more than one entity. Confirm which one the client means.`),
    ...abstained.map((a) => `"${a}" could not be identified and was not used as evidence.`),
  ];
  return {
    schema: SPEC_SCHEMA,
    specId: `spec-${brief.id}`,
    versionId,
    version: opts.version ?? 1,
    ...(opts.parentVersionId ? { parentVersionId: opts.parentVersionId } : {}),
    briefId: brief.id,
    compiledAt: opts.now ?? new Date().toISOString(),
    rulebookVersion: brief.rulebookVersion,
    dataMode: brief.dataMode,
    ...(brief.dataMode === "fixture" ? { syntheticNotice: "SYNTHETIC DATA: the places and scores behind this specification come from a fictional test world, not from Qloo." } : {}),
    evidenceMode: brief.evidenceMode,
    status: brief.status,
    project: brief.input.project ?? "",
    client: { label: brief.input.clientLabel, city: brief.input.city, room: brief.input.room, trade: brief.input.trade },
    brief: { words: brief.input.words, loves: brief.input.loves, pinned: brief.input.pinned ?? {}, ...(brief.input.sourceText ? { sourceText: brief.input.sourceText } : {}), usedReferences: used, abstainedReferences: abstained, ambiguousReferences: ambiguous },
    limits,
    lines,
    evidenceRefs,
    ...(brief.ledger.length ? { ledgerHead: brief.ledger.at(-1)!.hash } : {}),
    assumptions: [...new Set(lines.flatMap((l) => l.assumptions))],
    unknowns: brief.input.trade === "lighting" ? UNKNOWNS : UNKNOWNS.filter((u) => !/Fitting|Daylight/.test(u)),
    openQuestions: open,
    notCertified: NOT_CERTIFIED,
  };
}
