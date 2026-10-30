// The Tastespec agent: an explicit state machine.
//
//   INTAKE → NORMALIZE → RESOLVE_ENTITIES → FETCH_QLOO → ASSESS_EVIDENCE →
//   INTERPRET → CHECK_CONSTRAINTS → GENERATE_SPEC → SIMULATE_ALTERNATIVES →
//   CLARIFY_IF_NEEDED → COUNTER_TEST → VALIDATE → (PERSIST, by the caller) → COMPLETE
//
// Terminal outcomes: NEEDS_CLARIFICATION, INSUFFICIENT_EVIDENCE and
// UPSTREAM_UNAVAILABLE still produce a brief (the latter two fall back to the
// literal spec with no personalisation); FAILED and CANCELLED throw.
//
// Every step is recorded in a decision trace (what it did, why, what it
// produced, how long, how many retries, which ledger entries back it). This is
// a record of observable decisions, not a reasoning transcript. Every Qloo
// call, decision and model call also goes into the hash-chained ledger.

import { Ledger } from "./ledger";
import { computeDimensions, classifyVenue, hasText, unmatchedTerms } from "./fingerprint";
import { buildTasteGraph, type GraphSource } from "./graph";
import { mainDepthLayer } from "./depth";
import { auditBaseline, rebuild } from "./refine";
import { DIMENSION_BY_ID } from "./dimensions";
import { envReport, log } from "./env";
import { HttpTransport, QlooClient, QlooError, SimulatedOutageTransport, type Params, type Transport } from "./qloo/client";
import { FixtureTransport } from "./qloo/fixture";
import { resolveLove } from "./resolve";
import { cleanLimits, limitsOf, parseConstraints } from "./constraints";
import { buildSpec, literalSpec, planQuestion, rankQuestions, specMenu, warmFloor } from "./spec";
import { decodeWord, lexiconFor, normaliseWord } from "./words";
import { llmAvailable, llmBaselineSpec, llmMapWord, llmModel, llmNarrative } from "./llm";
import { RULEBOOK_VERSION, ROOM_LABEL, TRADE_LABEL } from "./rulebooks";
import type {
  AgentEvent,
  AgentState,
  Brief,
  BriefInput,
  DecodedWord,
  DimensionId,
  DimensionScore,
  LlmBaseline,
  QlooEntity,
  Resolution,
  RunStatus,
  TraceStep,
  VenueEvidence,
} from "./types";

const PLACE = "urn:entity:place";
/** Places to collect per side (two pages of 20). */
const WANT = 40;
/** Below this many tagged places on either side, the fingerprint is "thin" and the brief warns. */
export const MIN_TAGGED = Number(process.env.TASTESPEC_MIN_TAGGED ?? 12);
/** Below this, there is no usable evidence: no personalisation at all (Invariant 1). */
export const MIN_USABLE = 6;
const UPSTREAM_KINDS = new Set(["auth", "rate_limit", "upstream", "network", "timeout", "deadline", "budget"]);

export class AgentError extends Error {
  constructor(
    readonly state: AgentState,
    message: string,
  ) {
    super(message);
  }
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Whole-run budget in ms (Qloo calls and model calls stop before it). */
  budgetMs?: number;
  maxQlooCalls?: number;
  /** Override the transport (benchmarks and tests). */
  transport?: Transport;
  /** Allow optional model calls (counter-test, note, unfamiliar words). Default: when a key is set. */
  useLlm?: boolean;
  /** Skip the clarifying question (B4 ablation). */
  noQuestion?: boolean;
  ownerHash?: string;
  /**
   * Maps place tags/keywords the lexicon missed onto atmospheres (a model when a
   * key is set). Returns only terms it could map. Undefined = lexicon only.
   */
  tagMapper?: TagMapper;
}

export type TagMapper = (terms: string[], signal?: AbortSignal) => Promise<{ model: string; mapped: Record<string, DimensionId[]> }>;

export function makeTransport(challenge?: BriefInput["challenge"]): Transport {
  const env = envReport();
  let t: Transport;
  if (env.qlooMode === "fixture") t = new FixtureTransport();
  else if (env.qlooMode === "live") t = new HttpTransport(process.env.QLOO_API_KEY!, env.qlooBaseUrl);
  else throw new AgentError("FAILED", `Qloo is not configured: ${env.issues.join(" ")} (Set QLOO_MODE=fixture for synthetic test data.)`);
  return challenge === "upstream_down" ? new SimulatedOutageTransport(t) : t;
}

/** Follow-up Qloo calls on an existing brief use the data source it was made with. */
export function transportForBrief(brief: Pick<Brief, "dataMode">): Transport {
  if (brief.dataMode === "fixture") return new FixtureTransport();
  const env = envReport();
  if (env.qlooMode !== "live") throw new AgentError("FAILED", "This brief was made with live Qloo data, but this server isn't configured for live Qloo.");
  return new HttpTransport(process.env.QLOO_API_KEY!, env.qlooBaseUrl);
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `b-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const MAX_LOVE_LEN = 80;
const MAX_WORD_LEN = 30;

export function cleanInput(raw: Partial<BriefInput>): BriefInput {
  const text = (v: unknown, max: number) =>
    String(v ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  const words = (Array.isArray(raw.words) ? raw.words : [])
    .slice(0, 20)
    .flatMap((w) => text(w, 200).split(/[,/]| and /))
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 1 && w.length <= MAX_WORD_LEN)
    .slice(0, 5);
  const loves = (Array.isArray(raw.loves) ? raw.loves : [])
    .slice(0, 30)
    .map((l) => text(l, 200))
    .filter((l) => l.length > 1 && l.length <= MAX_LOVE_LEN)
    .slice(0, 10);
  const pinned: Record<string, string> = {};
  if (raw.pinned && typeof raw.pinned === "object") {
    for (const [k, v] of Object.entries(raw.pinned).slice(0, 10)) if (typeof v === "string" && v.length < 120) pinned[text(k, MAX_LOVE_LEN)] = v;
  }
  return {
    clientLabel: text(raw.clientLabel, 40) || "Client",
    trade: raw.trade === "finishes" ? "finishes" : "lighting",
    room: raw.room && raw.room in ROOM_LABEL ? raw.room : "living_room",
    city: text(raw.city, 60),
    words,
    loves: [...new Set(loves)],
    pinned: Object.keys(pinned).length ? pinned : undefined,
    ...cleanLimits(raw as Record<string, unknown>),
    challenge: raw.challenge === "upstream_down" ? "upstream_down" : "none",
    project: text(raw.project, 60) || undefined,
    sourceText: typeof raw.sourceText === "string" && raw.sourceText.trim() ? raw.sourceText.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 4000) : undefined,
  };
}

type Emit = (e: AgentEvent) => void;

interface StepResult<T> {
  value: T;
  decision: string;
  rationale: string;
  output?: Record<string, unknown>;
  validation?: TraceStep["validation"];
  evidence?: number[];
  detail?: string;
}

class Run {
  readonly trace: TraceStep[] = [];
  state: AgentState = "INTAKE";
  readonly started = Date.now();
  constructor(
    readonly emit: Emit,
    readonly deadline: number,
    readonly signal?: AbortSignal,
  ) {}

  remaining() {
    return this.deadline - Date.now();
  }

  async step<T>(state: AgentState, tool: string, label: string, inputs: Record<string, unknown>, fn: () => Promise<StepResult<T>>, retriesOf?: () => number): Promise<T> {
    if (this.signal?.aborted) throw new AgentError("CANCELLED", "The run was cancelled.");
    if (this.remaining() <= 0) throw new AgentError("FAILED", "The run exceeded its time budget.");
    this.state = state;
    const t0 = Date.now();
    const r0 = retriesOf?.() ?? 0;
    this.emit({ type: "step", id: state, label, status: "running", state });
    try {
      const r = await fn();
      const validation = r.validation ?? "pass";
      this.trace.push({
        seq: this.trace.length,
        state,
        tool,
        decision: r.decision,
        rationale: r.rationale,
        inputs,
        output: r.output ?? {},
        validation,
        ms: Date.now() - t0,
        retries: (retriesOf?.() ?? 0) - r0,
        evidence: r.evidence ?? [],
      });
      this.emit({ type: "step", id: state, label, status: validation === "warn" ? "warn" : validation === "fail" ? "error" : "done", detail: r.detail ?? r.decision, state });
      return r.value;
    } catch (err) {
      const cancelled = this.signal?.aborted || (err instanceof QlooError && err.kind === "cancelled") || (err instanceof AgentError && err.state === "CANCELLED");
      this.trace.push({
        seq: this.trace.length,
        state,
        tool,
        decision: cancelled ? "cancelled" : "failed",
        rationale: err instanceof Error ? err.message.slice(0, 300) : String(err),
        inputs,
        output: {},
        validation: "fail",
        ms: Date.now() - t0,
        retries: (retriesOf?.() ?? 0) - r0,
        evidence: [],
      });
      this.emit({ type: "step", id: state, label, status: "error", detail: err instanceof Error ? err.message : String(err), state });
      if (cancelled) throw new AgentError("CANCELLED", "The run was cancelled.");
      if (err instanceof AgentError) throw err;
      throw new AgentError("FAILED", err instanceof Error ? err.message : String(err));
    }
  }
}

/** What to tell the designer, and what to do about it, for each way Qloo can fail. Never includes a key or a response body. */
export function upstreamHint(kind: QlooError["kind"] | undefined): string {
  switch (kind) {
    case "auth":
      return "Qloo rejected the API key (expired, wrong or not for this host). Check QLOO_API_KEY on the server; then run again.";
    case "rate_limit":
      return "Qloo is rate-limiting this key. Wait a minute and run again.";
    case "timeout":
    case "deadline":
      return "Qloo did not answer in time. Run again; if it keeps happening, check Qloo's status.";
    case "network":
      return "Qloo could not be reached. Check the server's network access, then run again.";
    case "budget":
      return "The run hit its Qloo request budget before finishing. Try again with fewer references.";
    default:
      return "Qloo returned an error. Run again in a moment.";
  }
}

function isUpstream(err: unknown): err is QlooError {
  return err instanceof QlooError && UPSTREAM_KINDS.has(err.kind);
}

function rescorer(words: string[], cache: Map<string, DecodedWord["readings"]>) {
  return (d: DimensionScore[]) =>
    words.map((w) => {
      const cached = cache.get(normaliseWord(w));
      return cached?.length
        ? decodeWord(w, d, cached.map((r) => ({ dimension: r.dimension, meaning: r.meaning, isDictionaryDefault: r.isDictionaryDefault })), "llm")
        : decodeWord(w, d);
    });
}

/** Invariant checks on a finished spec. Any failure aborts the run rather than shipping a bad spec. */
export function validateBrief(b: Pick<Brief, "spec" | "status" | "input" | "dataMode">): string[] {
  const problems: string[] = [];
  const fallback = b.status === "INSUFFICIENT_EVIDENCE" || b.status === "UPSTREAM_UNAVAILABLE";
  for (const l of b.spec) {
    if (!l.basis) problems.push(`${l.id}: no basis`);
    if (fallback && l.value !== l.literalValue) problems.push(`${l.id}: personalised without usable evidence`);
    if (fallback && l.confidence !== "low") problems.push(`${l.id}: confidence above low without evidence`);
    if (l.basis === "qloo_evidence" && l.evidence.length === 0) problems.push(`${l.id}: claims Qloo evidence but cites none`);
    if (l.basis === "qloo_evidence" && l.evidenceLedger.length === 0) problems.push(`${l.id}: cites no Qloo request`);
  }
  if (b.input.trade === "lighting" && warmFloor(b.input.words)) {
    const cct = b.spec.find((l) => l.id === "cct");
    if (cct && /3500K ambient|4000K/.test(cct.value)) problems.push("cct: violates warm-light floor");
  }
  if (b.input.cctRange) {
    const cct = b.spec.find((l) => l.id === "cct");
    const ks = (cct?.value.match(/\d{4}/g) ?? []).map(Number);
    if (cct && ks.some((k) => k < b.input.cctRange!.min || k > b.input.cctRange!.max)) problems.push("cct: outside the range the client wrote down");
  }
  const c = b.input;
  if (c.trade !== "lighting") return problems;
  const line = (id: string) => b.spec.find((l) => l.id === id)?.value ?? "";
  if (c.criMin && Number(/CRI (\d{2,3})\+/.exec(line("cri"))?.[1] ?? 0) < c.criMin) problems.push("cri: below the minimum the client wrote down");
  if (c.dimTo) {
    const floors = [...line("dimming").matchAll(/(\d{1,3})%/g)].map((m) => Number(m[1]));
    if (floors.length && Math.min(...floors) > c.dimTo) problems.push("dimming: floor above what the client wrote down");
  }
  if (c.luxTarget && !new RegExp(`\\b${c.luxTarget} lux`).test(line("level"))) problems.push("level: not the lux target the client wrote down");
  return problems;
}

export async function runBrief(rawInput: Partial<BriefInput>, emit: Emit, opts: RunOptions = {}): Promise<Brief> {
  const run = new Run(emit, Date.now() + (opts.budgetMs ?? 55_000), opts.signal);
  const ledger = new Ledger();
  const warnings: string[] = [];
  let degraded = false;
  let llmCalls = 0;
  const useLlm = opts.useLlm ?? llmAvailable();

  // INTAKE
  const input = await run.step("INTAKE", "validator", "Reading the brief", { fields: Object.keys(rawInput ?? {}) }, async () => {
    const input = cleanInput(rawInput ?? {});
    const problems: string[] = [];
    if (!input.city) problems.push("A city is required: the evidence compares the client's taste with what's typical where they live.");
    for (const c of parseConstraints(input.sourceText ?? "").conflicts) problems.push(`Requirements that can't both hold: ${c}`);
    if (input.loves.length < 2) problems.push("Give at least two things the client loves (each 2–80 characters).");
    if (input.words.length < 1) problems.push("Give at least one word the client used.");
    if (problems.length) throw new AgentError("FAILED", problems.join(" "));
    return { value: input, decision: "accepted", rationale: "Required fields present and within limits.", output: { words: input.words.length, loves: input.loves.length } };
  });

  const transport = opts.transport ?? makeTransport(input.challenge);
  const qloo = new QlooClient(transport, ledger, { deadline: run.deadline - 8_000, signal: opts.signal, maxCalls: opts.maxQlooCalls ?? 45 });
  const retries = () => qloo.stats.retries;

  // NORMALIZE
  await run.step("NORMALIZE", "normalizer", "Normalising words and references", {}, async () => {
    const intake = await ledger.append("client_input", `Brief for ${input.clientLabel}: ${TRADE_LABEL[input.trade]}, ${ROOM_LABEL[input.room]}, ${input.city}`, {
      words: input.words,
      loves: input.loves,
      pinned: input.pinned ?? {},
      dataMode: transport.mode,
      challenge: input.challenge,
      ...(transport.note ? { transportNote: transport.note } : {}),
    });
    const unknown = input.words.filter((w) => !lexiconFor(w));
    return {
      value: undefined,
      decision: unknown.length ? "some words outside lexicon" : "all words in lexicon",
      rationale: unknown.length ? `${unknown.join(", ")} will need a model mapping or will be ignored.` : "Every word has curated readings.",
      output: { words: input.words, unknown },
      evidence: [intake.seq],
    };
  });

  // The LLM-only baseline (B1) runs alongside the Qloo work; it never sees Qloo data.
  const menu = specMenu(input.trade, input.room, input.words, limitsOf(input));
  const baselinePromise: Promise<LlmBaseline> = useLlm
    ? (llmCalls++,
      llmBaselineSpec({ trade: TRADE_LABEL[input.trade], room: ROOM_LABEL[input.room], words: input.words, loves: input.loves, menu, signal: opts.signal })
        .then(async (lines) => {
          await ledger.append("llm_call", "LLM-only baseline: picked spec values from words + loves, no Qloo data", { model: llmModel(), lines });
          return { available: true, model: llmModel(), lines: lines.map((l) => ({ category: menu[l.id].category, value: l.value })) };
        })
        .catch(async (err) => {
          await ledger.append("llm_call", "LLM-only baseline failed", { error: String(err).slice(0, 300) });
          return { available: false, reason: `Baseline call failed: ${String(err).slice(0, 160)}` };
        }))
    : Promise.resolve({ available: false, reason: "No ANTHROPIC_API_KEY configured, so the LLM-only comparison was skipped." });

  let status: RunStatus = "COMPLETE";
  let upstreamReason = "";
  let tagMap: Brief["tagMap"];
  // The agent's only working state is this graph; it's streamed as it grows.
  const gs: GraphSource = { input };
  const emitGraph = () => emit({ type: "graph", graph: buildTasteGraph(gs) });

  // RESOLVE_ENTITIES
  const resolutions = await run.step(
    "RESOLVE_ENTITIES",
    "qloo:/search",
    "Resolving what they love in Qloo's graph",
    { loves: input.loves },
    async () => {
      const settled = await Promise.allSettled(input.loves.map((l) => resolveLove(qloo, l, input.pinned?.[l])));
      const resolutions: Resolution[] = [];
      let upstreamFailures = 0;
      let upstreamKind: QlooError["kind"] | undefined;
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") resolutions.push(s.value);
        else {
          if (s.reason instanceof QlooError && s.reason.kind === "cancelled") throw s.reason;
          if (isUpstream(s.reason)) {
            upstreamFailures++;
            upstreamKind ??= s.reason.kind;
          }
          resolutions.push({ input: input.loves[i], status: "not_found", alternatives: [], similarity: 0, confidence: 0, method: "top_result", usedAsSignal: false, evidence: [], note: `Lookup failed: ${(s.reason as Error).message.slice(0, 120)}` });
        }
      });
      for (const r of resolutions) {
        if (r.status !== "resolved" && r.status !== "ambiguous") {
          emit({ type: "decision", label: `Not using "${r.input}"`, detail: r.note ?? "" });
          await ledger.append("decision", `Abstained on "${r.input}"`, { input: r.input, status: r.status, similarity: r.similarity, note: r.note, alternatives: r.alternatives.map((a) => a.entity_id) });
        } else if (r.status === "ambiguous") {
          emit({ type: "decision", label: `"${r.input}" is ambiguous`, detail: r.note ?? "" });
          await ledger.append("decision", `"${r.input}" used but flagged ambiguous`, { input: r.input, chosen: r.chosen, confidence: r.confidence, note: r.note });
        }
      }
      const used = resolutions.filter((r) => r.usedAsSignal);
      if (used.length === 0 && upstreamFailures > 0) {
        degraded = true;
        status = "UPSTREAM_UNAVAILABLE";
        upstreamReason = `Qloo search was unavailable, so no references could be resolved. ${upstreamHint(upstreamKind)}`;
      } else if (used.length === 0) {
        status = "INSUFFICIENT_EVIDENCE";
      }
      return {
        value: resolutions,
        decision: `${used.length} of ${resolutions.length} references used as signals`,
        rationale: "Exact or near-exact matches are used; weak matches abstain; same-name collisions are flagged.",
        output: { used: used.map((r) => r.chosen?.entity_id), abstained: resolutions.filter((r) => !r.usedAsSignal).map((r) => r.input) },
        validation: used.length === 0 ? "fail" : used.length < resolutions.length ? "warn" : "pass",
        evidence: resolutions.flatMap((r) => r.evidence),
        detail: `${used.length} of ${resolutions.length} matched`,
      };
    },
    retries,
  );
  // Canonical order (sorted, de-duplicated) so the order a client lists things in can't change the evidence.
  const signalIds = [...new Set(resolutions.filter((r) => r.usedAsSignal).map((r) => r.chosen!.entity_id))].sort();
  gs.resolutions = resolutions;
  emitGraph();

  // FETCH_QLOO
  let crowd: VenueEvidence[] = [];
  let base: VenueEvidence[] = [];
  let tasteTags: { name: string; affinity?: number }[] = [];
  let evidenceScope: Brief["scope"];
  const evidenceLedger: number[] = [];
  if (status === "COMPLETE") {
    await run.step(
      "FETCH_QLOO",
      "qloo:/v2/insights",
      `Finding the rooms people with this taste choose in ${input.city}`,
      { signals: signalIds, city: input.city },
      async () => {
        const scopes: { id: NonNullable<Brief["scope"]>; label: string; crowd: Params; base: Params }[] = [
          { id: "city", label: `within ${input.city}`, crowd: { "filter.type": PLACE, "signal.interests.entities": signalIds, "filter.location.query": input.city }, base: { "filter.type": PLACE, "filter.location.query": input.city } },
          { id: "weighted", label: `weighted toward ${input.city}`, crowd: { "filter.type": PLACE, "signal.interests.entities": signalIds, "signal.location.query": input.city }, base: { "filter.type": PLACE, "signal.location.query": input.city } },
          { id: "global", label: "with no location limit", crowd: { "filter.type": PLACE, "signal.interests.entities": signalIds }, base: { "filter.type": PLACE, "signal.location.query": input.city } },
        ];
        let crowdRaw: QlooEntity[] = [];
        let scope = scopes[0];
        const notes: string[] = [];
        for (const s of scopes) {
          scope = s;
          try {
            const r = await qloo.insightsEntities(s.crowd, `Taste-matched places ${s.label}`, WANT);
            evidenceLedger.push(...r.evidence);
            crowdRaw = r.value;
            if (r.partial) {
              degraded = true;
              notes.push("crowd results partial");
            }
          } catch (err) {
            if (err instanceof QlooError && err.kind === "cancelled") throw err;
            if (isUpstream(err)) {
              degraded = true;
              status = "UPSTREAM_UNAVAILABLE";
              upstreamReason = `Qloo insights failed (${err.kind}${err.status ? ` ${err.status}` : ""}). ${upstreamHint(err.kind)}`;
              return { value: undefined, decision: "upstream unavailable", rationale: upstreamReason, validation: "fail" as const, evidence: evidenceLedger };
            }
            // A 4xx for this scope's parameters: record it and try the next scope.
            notes.push(`${s.label}: ${(err as Error).message.slice(0, 120)}`);
            await ledger.append("decision", `Scope "${s.label}" rejected; trying the next scope`, { error: (err as Error).message.slice(0, 200) });
            crowdRaw = [];
          }
          const tagged = crowdRaw.filter(hasText).length;
          if (tagged >= MIN_TAGGED) break;
          if (s !== scopes.at(-1)) {
            emit({ type: "decision", label: "Not enough local evidence", detail: `Only ${tagged} tagged places ${s.label}; widening the search.` });
            await ledger.append("decision", "Widened search scope", { from: s.label, taggedPlaces: tagged, minimum: MIN_TAGGED });
          }
        }
        // A loved place can't be evidence for itself.
        const crowdEntities = crowdRaw.filter((e) => hasText(e) && !signalIds.includes(e.entity_id));
        let baseEntities: QlooEntity[] = [];
        evidenceScope = scope.id;
        if (scope !== scopes[0]) warnings.push(`${input.city} had too few matching places, so the evidence comes from places ${scope.label}. Local taste may differ.`);

        const [baseR, tagsR] = await Promise.allSettled([
          qloo.insightsEntities(scope.base, `City baseline ${scope.label}`, WANT),
          qloo.insightsTags({ "signal.interests.entities": signalIds, take: 20 }, "Cross-domain taste tags"),
        ]);
        if (baseR.status === "fulfilled") {
          evidenceLedger.push(...baseR.value.evidence);
          baseEntities = baseR.value.value.filter(hasText);
          if (baseR.value.partial) degraded = true;
        } else {
          if (baseR.reason instanceof QlooError && baseR.reason.kind === "cancelled") throw baseR.reason;
          degraded = true;
          status = "UPSTREAM_UNAVAILABLE";
          upstreamReason = `The city baseline query failed (${(baseR.reason as Error).message.slice(0, 120)}); a lift can't be computed without it.`;
        }
        if (tagsR.status === "fulfilled") {
          tasteTags = tagsR.value.value;
          evidenceLedger.push(...tagsR.value.evidence);
        } else {
          if (tagsR.reason instanceof QlooError && tagsR.reason.kind === "cancelled") throw tagsR.reason;
          degraded = true;
          notes.push("taste tags unavailable");
          warnings.push("Qloo taste tags were unavailable; the fingerprint uses places only.");
        }

        // Terms the lexicon can't read: optionally ask a model to map them (cached, labelled "mapped").
        let mapped: Record<string, DimensionId[]> | undefined;
        if (opts.tagMapper && status === "COMPLETE") {
          const terms = unmatchedTerms([...crowdEntities, ...baseEntities]);
          if (terms.length) {
            try {
              const r = await opts.tagMapper(terms, opts.signal);
              mapped = r.mapped;
              tagMap = r;
              const e = await ledger.append("llm_call", `Mapped ${Object.keys(r.mapped).length} of ${terms.length} unread place terms onto atmospheres`, { model: r.model, asked: terms.length, mapped: r.mapped });
              evidenceLedger.push(e.seq);
            } catch (err) {
              await ledger.append("llm_call", "Place-term mapping failed; lexicon only", { error: String(err).slice(0, 200) });
            }
          }
        }
        crowd = crowdEntities.map((e) => classifyVenue(e, mapped));
        base = baseEntities.map((e) => classifyVenue(e, mapped));
        gs.crowdVenues = crowd;
        emitGraph();
        return {
          value: undefined,
          decision: status === "UPSTREAM_UNAVAILABLE" ? "upstream unavailable" : `crowd ${crowd.length}, baseline ${base.length}, tags ${tasteTags.length} (${scope.label})`,
          rationale: status === "UPSTREAM_UNAVAILABLE" ? upstreamReason : notes.length ? notes.join("; ") : "All evidence queries succeeded.",
          output: { scope: scope.label, crowdTagged: crowd.length, baseTagged: base.length, tags: tasteTags.length },
          validation: status === "UPSTREAM_UNAVAILABLE" ? ("fail" as const) : degraded ? ("warn" as const) : ("pass" as const),
          evidence: [...evidenceLedger],
          detail: `${crowd.length} taste-matched and ${base.length} typical places (${scope.label})`,
        };
      },
      retries,
    );
  }

  // ASSESS_EVIDENCE
  const evidenceUsable = await run.step("ASSESS_EVIDENCE", "assessor", "Checking the evidence is sufficient", { crowd: crowd.length, base: base.length }, async () => {
    if (status === "UPSTREAM_UNAVAILABLE") {
      warnings.unshift(`Qloo was unavailable: ${upstreamReason} This brief is the literal reading of the client's words, with no taste personalisation.`);
      await ledger.append("decision", "UPSTREAM_UNAVAILABLE: falling back to the literal spec", { reason: upstreamReason });
      return { value: false, decision: "UPSTREAM_UNAVAILABLE", rationale: upstreamReason, validation: "fail" as const };
    }
    if (status === "INSUFFICIENT_EVIDENCE" || crowd.length < MIN_USABLE || base.length < MIN_USABLE) {
      status = "INSUFFICIENT_EVIDENCE";
      const why = signalIds.length === 0 ? "none of the client's references could be identified" : `only ${crowd.length} taste-matched and ${base.length} typical tagged places came back (need ${MIN_USABLE}+ each)`;
      warnings.unshift(`Not enough evidence: ${why}. This brief is the literal reading of the client's words, with no taste personalisation.`);
      await ledger.append("decision", "INSUFFICIENT_EVIDENCE: abstaining from personalisation", { reason: why, minimum: MIN_USABLE });
      return { value: false, decision: "INSUFFICIENT_EVIDENCE", rationale: why, validation: "fail" as const };
    }
    if (crowd.length < MIN_TAGGED || base.length < MIN_TAGGED) warnings.push(`Thin evidence: ${crowd.length} taste-matched and ${base.length} typical tagged places. Treat the spec as a starting point.`);
    return { value: true, decision: "sufficient", rationale: `${crowd.length} taste-matched vs ${base.length} typical tagged places.`, validation: crowd.length < MIN_TAGGED || base.length < MIN_TAGGED ? ("warn" as const) : ("pass" as const) };
  });

  // INTERPRET
  const wordCache = new Map<string, DecodedWord["readings"]>();
  const { dims, words } = await run.step("INTERPRET", "fingerprint+lexicon", "Computing the atmosphere fingerprint and decoding their words", {}, async () => {
    const dims = computeDimensions(crowd, base, tasteTags, { evidenceUsable });
    const fp = await ledger.append("computation", "Atmosphere fingerprint", {
      method: "Beta(1,1) posterior lift of crowd share over baseline share; score = clamp(log2(lift)/1.5)·|2P−1| + capped taste-tag boost; zero when evidence unusable",
      evidenceUsable,
      crowdN: crowd.length,
      baseN: base.length,
      dimensions: dims.map((d) => ({ id: d.id, crowd: `${d.crowdHits}/${d.crowdN}`, base: `${d.baseHits}/${d.baseN}`, lift: +d.lift.toFixed(3), pGreater: +d.pGreater.toFixed(3), score: +d.score.toFixed(3) })),
    });
    // Unfamiliar words: ask the model for candidate readings (evidence still decides between them).
    if (useLlm && evidenceUsable) {
      for (const w of input.words.filter((w) => !lexiconFor(w))) {
        try {
          llmCalls++;
          const readings = await llmMapWord(w, opts.signal);
          if (readings.length) {
            wordCache.set(normaliseWord(w), readings.map((r) => ({ ...r, weight: 0 })));
            await ledger.append("llm_call", `Mapped unfamiliar word "${w}" onto dimensions`, { model: llmModel(), word: w, readings });
          }
        } catch (err) {
          await ledger.append("llm_call", `Could not map "${w}"`, { error: String(err).slice(0, 200) });
        }
      }
    }
    const words = rescorer(input.words, wordCache)(dims);
    for (const w of words) {
      if (!w.known) warnings.push(`"${w.word}" couldn't be mapped to an atmosphere, so it doesn't affect the spec.`);
      else if (w.chosen && !w.chosen.isDictionaryDefault) {
        const literal = w.readings.find((r) => r.isDictionaryDefault);
        emit({ type: "decision", label: `"${w.word}" doesn't mean what it says`, detail: `Evidence favours "${w.chosen.meaning}" (${Math.round(w.chosen.weight * 100)}%) over the literal "${literal?.meaning}".` });
      }
    }
    const wl = await ledger.append("computation", "Decoded client words", {
      words: words.map((w) => ({ word: w.word, source: w.source, chosen: w.chosen?.dimension, readings: w.readings.map((r) => ({ d: r.dimension, w: +r.weight.toFixed(3) })) })),
    });
    const top = [...dims].sort((a, b) => b.score - a.score).slice(0, 2);
    return {
      value: { dims, words },
      decision: evidenceUsable ? `strongest: ${top.map((d) => DIMENSION_BY_ID[d.id].short).join(", ")}` : "no personalisation (evidence unusable)",
      rationale: words.map((w) => `${w.word} → ${w.chosen ? w.chosen.meaning : "unmapped"}`).join("; "),
      output: { top: top.map((d) => ({ id: d.id, lift: +d.lift.toFixed(2), score: +d.score.toFixed(2) })) },
      evidence: [fp.seq, wl.seq],
      detail: evidenceUsable ? top.map((d) => `${DIMENSION_BY_ID[d.id].short} ×${d.lift.toFixed(1)}`).join(", ") : "Literal reading only",
    };
  });
  gs.dimensions = dims;
  gs.words = words;
  emitGraph();

  // CHECK_CONSTRAINTS
  await run.step("CHECK_CONSTRAINTS", "constraints", "Applying hard constraints", {}, async () => {
    const constraints = [
      ...(input.trade === "lighting" && warmFloor(input.words) ? ["warm-floor: ≥ 3000K ambient because the client used a warm word"] : []),
      `room: ${ROOM_LABEL[input.room]} light-level range`,
    ];
    const e = await ledger.append("computation", "Hard constraints", { constraints, rulebookVersion: RULEBOOK_VERSION });
    return { value: undefined, decision: `${constraints.length} constraints`, rationale: constraints.join("; "), evidence: [e.seq] };
  });

  // GENERATE_SPEC
  const spec = await run.step("GENERATE_SPEC", `rulebook ${RULEBOOK_VERSION}`, `Drafting the ${TRADE_LABEL[input.trade].toLowerCase()} spec`, {}, async () => {
    const spec = buildSpec(input.trade, input.room, dims, words, input.words, undefined, { evidenceUsable, evidenceLedger, signalEntityIds: signalIds, limits: limitsOf(input) });
    const diffs = spec.filter((l) => l.value !== l.literalValue).length;
    const e = await ledger.append("computation", "Spec drafted from rulebook", {
      rulebookVersion: RULEBOOK_VERSION,
      trade: input.trade,
      room: input.room,
      lines: spec.map((l) => ({ id: l.id, value: l.value, basis: l.basis, confidence: l.confidence, drivers: l.evidence.map((x) => x.dimension), constraints: l.constraints })),
      differsFromLiteralReading: diffs,
    });
    return { value: spec, decision: `${spec.length} lines, ${diffs} differ from literal`, rationale: "Deterministic rulebook over the evidence-weighted atmosphere vector.", evidence: [e.seq] };
  });

  // SIMULATE_ALTERNATIVES + CLARIFY_IF_NEEDED
  const rescore = rescorer(input.words, wordCache);
  const question = await run.step("SIMULATE_ALTERNATIVES", "question-planner", "Simulating answers to possible questions", {}, async () => {
    if (!evidenceUsable || opts.noQuestion) {
      return { value: undefined, decision: opts.noQuestion ? "disabled (ablation)" : "skipped: no usable evidence", rationale: "Questions are only planned on top of usable evidence.", validation: "n/a" as const };
    }
    const ranked = rankQuestions(input.trade, input.room, dims, rescore, input.words, limitsOf(input));
    const q = planQuestion(input.trade, input.room, dims, crowd, rescore, input.clientLabel, input.words, limitsOf(input));
    const e = await ledger.append("decision", q ? "Planned a clarifying question" : "No clarifying question", {
      candidates: ranked.slice(0, 4).map((c) => ({ contrast: [c.a, c.b], pA: +c.pA.toFixed(3), impact: c.impact, expectedChange: +c.expectedChange.toFixed(3), entropyBits: +c.entropyBits.toFixed(3) })),
      chosen: q ? { contrast: [q.dimension, q.versus], optionA: q.optionA, optionB: q.optionB } : null,
      rule: "ask only if expectedChange ≥ 1, entropy ≥ 0.5 bits, ≥ 2 lines depend on the answer, and a real place pair exists",
    });
    return {
      value: q,
      decision: q ? `ask: ${DIMENSION_BY_ID[q.dimension].short} vs ${DIMENSION_BY_ID[q.versus].short}` : "no question",
      rationale: q
        ? `Expected to change ${q.expectedChange.toFixed(1)} lines; answer uncertainty ${q.entropyBits.toFixed(2)} bits.`
        : "No contrast is both uncertain and decision-relevant enough to justify asking.",
      evidence: [e.seq],
      detail: q ? `Yes: the answer is expected to change ${q.expectedChange.toFixed(1)} lines` : "Not needed",
    };
  });
  if (question) {
    status = "NEEDS_CLARIFICATION";
    run.state = "CLARIFY_IF_NEEDED";
  }
  gs.spec = spec;
  gs.question = question;
  emitGraph();

  // COUNTER_TEST (+ optional client note)
  const { baseline, narrative } = await run.step("COUNTER_TEST", useLlm ? `llm:${llmModel()}` : "none", "Auditing an LLM-only answer against the evidence", {}, async () => {
    const timeout = new Promise<LlmBaseline>((r) => setTimeout(() => r({ available: false, reason: "The LLM-only baseline did not finish within the run budget." }), Math.max(0, run.remaining() - 3_000)));
    const baseline = auditBaseline(await Promise.race([baselinePromise, timeout]), spec);
    let narrative: string | undefined;
    if (useLlm && evidenceUsable && run.remaining() > 10_000) {
      const top = [...dims].sort((a, b) => b.score - a.score).slice(0, 2);
      const facts = [
        `Client: ${input.clientLabel}. Room: ${ROOM_LABEL[input.room]} in ${input.city}. They said: ${input.words.join(", ")}.`,
        `They love: ${resolutions.filter((r) => r.usedAsSignal).map((r) => r.chosen!.name).join(", ")}.`,
        ...words.filter((w) => w.chosen).map((w) => `When they say "${w.word}", the evidence suggests they mean: ${w.chosen!.meaning}.`),
        ...top.map((d) => `Places people with similar taste choose are ${d.lift.toFixed(1)}x as likely as typical ${input.city} places to be "${DIMENSION_BY_ID[d.id].label.toLowerCase()}", e.g. ${d.exemplars.slice(0, 2).map((e) => e.name).join(" and ")}.`),
        ...spec.slice(0, 3).map((l) => `${l.category}: ${l.value}`),
      ].join("\n");
      try {
        llmCalls++;
        narrative = await llmNarrative(facts, opts.signal);
        await ledger.append("llm_call", "Client note written from evidence facts only", { model: llmModel(), facts, note: narrative });
      } catch (err) {
        await ledger.append("llm_call", "Client note failed", { error: String(err).slice(0, 200) });
      }
    }
    const agree = baseline.audit?.filter((a) => a.agrees).length;
    return {
      value: { baseline, narrative },
      decision: baseline.audit ? `LLM-only agrees on ${agree}/${baseline.audit.length}` : "counter-test unavailable",
      rationale: baseline.audit ? "Same words, loves and option menu; no Qloo data." : baseline.reason ?? "",
      validation: baseline.audit ? ("pass" as const) : ("n/a" as const),
    };
  });

  const now = new Date().toISOString();
  const brief: Brief = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ownerHash: opts.ownerHash,
    input,
    dataMode: transport.mode,
    evidenceMode: degraded ? "degraded" : "complete",
    status,
    rulebookVersion: RULEBOOK_VERSION,
    resolutions,
    crowdVenues: crowd,
    baseVenues: base,
    dimensions: dims,
    words,
    spec,
    question,
    llmBaseline: baseline,
    narrative,
    warnings,
    trace: run.trace,
    stats: {
      qlooRequests: qloo.stats.requests,
      qlooAttempts: qloo.stats.attempts,
      qlooRetries: qloo.stats.retries,
      qlooFailures: qloo.stats.failures,
      qlooCacheHits: qloo.stats.cacheHits,
      qlooMs: qloo.stats.ms,
      llmCalls,
      totalMs: 0,
    },
    ledger: [],
    tasteTags,
    ...(evidenceScope ? { scope: evidenceScope } : {}),
    ...(tagMap ? { tagMap } : {}),
    depth: evidenceUsable ? [mainDepthLayer(crowd, base, dims, evidenceLedger)] : [],
    appliedDepth: 0,
  };

  // VALIDATE
  await run.step("VALIDATE", "invariants", "Checking the spec against safety invariants", {}, async () => {
    const problems = validateBrief(brief);
    if (problems.length) throw new AgentError("FAILED", `Spec failed validation: ${problems.join("; ")}`);
    const e = await ledger.append("computation", "Invariants checked", {
      checks: ["every line has a basis", "no personalisation without usable evidence", "evidence lines cite Qloo requests", "warm-light floor respected"],
      status,
      evidenceMode: brief.evidenceMode,
    });
    return { value: undefined, decision: "all invariants hold", rationale: `${brief.spec.length} lines checked.`, evidence: [e.seq] };
  });

  brief.ledger = ledger.entries;
  brief.trace = run.trace;
  brief.stats.totalMs = Date.now() - run.started;
  log("brief_complete", { status, dataMode: brief.dataMode, evidenceMode: brief.evidenceMode, ms: brief.stats.totalMs, qloo: brief.stats.qlooRequests, retries: brief.stats.qlooRetries });
  return brief;
}

/**
 * Apply the client's answer: no new Qloo calls, just an explicit signal. The
 * answer is applied on top of the raw evidence for the depth the spec uses.
 */
export async function answerQuestion(brief: Brief, answer: "A" | "B" | "neither", via: "designer" | "client" = "designer"): Promise<Brief> {
  if (!brief.question) throw new Error("This brief has no question.");
  if (brief.question.answer) throw new Error("The question was already answered.");
  const ledger = new Ledger(brief.ledger);
  const q = brief.question;
  const picked = answer === "neither" ? "neither" : answer === "A" ? q.optionA.name : q.optionB.name;
  const a = await ledger.append("client_input", `Client answered${via === "client" ? " on their link" : ""}: ${picked}`, { answer, contrast: [q.dimension, q.versus], via });
  const { dims, words, spec, changed } = rebuild(brief, brief.appliedDepth ?? 0, answer, [a.seq]);
  await ledger.append("computation", "Re-scored after client answer", {
    dimensions: dims.filter((d) => d.clientAdjusted).map((d) => ({ id: d.id, score: +d.score.toFixed(3), adjusted: +(d.clientAdjusted ?? 0).toFixed(3) })),
    changedLines: changed.map((l) => l.category),
  });
  return {
    ...brief,
    status: "COMPLETE",
    updatedAt: new Date().toISOString(),
    dimensions: dims,
    words,
    spec,
    question: { ...q, answer },
    llmBaseline: auditBaseline(brief.llmBaseline, spec),
    ledger: ledger.entries,
  };
}

export async function recordDecision(brief: Brief, lineId: string, status: "accepted" | "revised" | "proposed", revisedTo?: string, note?: string): Promise<Brief> {
  const line = brief.spec.find((l) => l.id === lineId);
  if (!line) throw new Error("Unknown spec line.");
  const clean = (s?: string, max = 300) => (s ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : undefined);
  const ledger = new Ledger(brief.ledger);
  const e = await ledger.append("client_input", `${line.category}: ${status}${revisedTo ? ` → "${clean(revisedTo)}"` : ""}`, {
    lineId,
    status,
    proposed: line.value,
    revisedTo: clean(revisedTo),
    note: clean(note),
    confidence: line.confidence,
    basis: line.basis,
  });
  const at = new Date().toISOString();
  return {
    ...brief,
    updatedAt: at,
    spec: brief.spec.map((l) =>
      l.id === lineId
        ? {
            ...l,
            status,
            revisedTo: status === "revised" ? clean(revisedTo) : undefined,
            note: clean(note),
            history: [...(l.history ?? []), { at, status, value: status === "revised" ? clean(revisedTo) ?? "" : l.value, note: clean(note), ledgerSeq: e.seq }],
          }
        : l,
    ),
    ledger: ledger.entries,
  };
}

export async function recordOutcome(brief: Brief, rating: number, note?: string): Promise<Brief> {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  const ledger = new Ledger(brief.ledger);
  const clean = note?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
  await ledger.append("client_input", `Outcome recorded: ${r}/5`, { rating: r, note: clean });
  return { ...brief, updatedAt: new Date().toISOString(), outcome: { rating: r, note: clean, at: new Date().toISOString() }, ledger: ledger.entries };
}

/** B0 for the Proof Lab "Without Qloo" control: computed fresh, no Qloo calls. */
export function computeLiteral(input: BriefInput) {
  const clean = cleanInput(input);
  return literalSpec(clean.trade, clean.room, clean.words, limitsOf(clean)).map((l) => ({ id: l.id, category: l.category, value: l.value, constraints: l.constraints ?? [] }));
}
