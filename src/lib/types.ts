// Domain types shared by the engine, the API routes and the UI.

export type DimensionId =
  | "low_glow"
  | "bright_airy"
  | "clean_minimal"
  | "vintage_character"
  | "industrial_raw"
  | "natural_organic"
  | "refined_luxe"
  | "energetic_social"
  | "calm_quiet";

export type Trade = "lighting" | "finishes";

export type RoomType =
  | "living_room"
  | "bedroom"
  | "kitchen"
  | "dining_room"
  | "home_office"
  | "bathroom"
  | "restaurant"
  | "bar"
  | "retail";

/** Proof Lab challenges. Each is labelled in the ledger and the UI. */
export type Challenge = "none" | "upstream_down";

export interface BriefInput {
  clientLabel: string;
  trade: Trade;
  room: RoomType;
  city: string;
  /** The client's own vague words, e.g. ["warm", "modern"]. */
  words: string[];
  /** Free-text things the client loves, any domain. "The Bear (show)", "Khruangbin" ... */
  loves: string[];
  /** Entity choices the pro pinned after reviewing resolution (input text -> entity id). */
  pinned?: Record<string, string>;
  challenge?: Challenge;
  /** Designer's project / job name, for grouping. */
  project?: string;
  /** The client's message as pasted (owner-only; never sent to Qloo, never shown on share links). */
  sourceText?: string;
}

/** A real place from the client's taste neighbourhood, offered as a design reference. */
export interface ReferenceRoom {
  entity_id: string;
  name: string;
  city?: string;
  affinity?: number;
  popularity?: number;
  dimensions: DimensionId[];
  terms: string[];
}

/**
 * One rung of "progressively niche": the same taste signals, restricted to less
 * popular places (both crowd and baseline, so the lift stays fair).
 */
export interface DepthLayer {
  level: 0 | 1 | 2;
  label: "Mainstream" | "Curated" | "Deep cut";
  popularityMax?: number;
  /** How the popularity cap was applied: by Qloo (filter param) or locally on returned popularity. */
  method: "none" | "api_filter" | "client_filter";
  crowdN: number;
  baseN: number;
  /** False when this depth returned too few places to say anything. */
  usable: boolean;
  dimensions: DimensionScore[];
  references: ReferenceRoom[];
  evidence: number[];
  computedAt: string;
  note?: string;
}

export type GraphColumn = "said" | "means" | "rooms" | "atmospheres" | "decisions" | "spec";

export interface GraphNode {
  id: string;
  column: GraphColumn;
  label: string;
  sub?: string;
  /** 0..1 emphasis (score, affinity, weight). */
  weight: number;
  kind: "word" | "reference" | "reading" | "entity" | "place" | "atmosphere" | "decision" | "constraint" | "question" | "line" | "abstained";
  dimension?: DimensionId;
  muted?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  kind: "reading" | "resolves" | "affinity" | "carries" | "selects" | "drives" | "bounds" | "answers";
}

export interface TasteGraph {
  columns: { id: GraphColumn; title: string; count: number; note?: string }[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  type?: string;
  subtype?: string;
  types?: string[];
  popularity?: number;
  affinity?: number;
  tags: { tag_id: string; name: string; type?: string }[];
  keywords: string[];
  properties: Record<string, unknown>;
}

export interface Resolution {
  input: string;
  status: "resolved" | "ambiguous" | "not_found" | "abstained";
  chosen?: { entity_id: string; name: string; type: string; popularity?: number };
  alternatives: { entity_id: string; name: string; type: string; popularity?: number }[];
  /** 0..1 string similarity between input and chosen name. */
  similarity: number;
  /** 0..1 how sure we are this is the entity the client meant. */
  confidence: number;
  method: "pinned" | "exact" | "type_hint" | "top_result";
  usedAsSignal: boolean;
  note?: string;
  /** Ledger seq of the /search call. */
  evidence: number[];
}

export interface VenueEvidence {
  entity_id: string;
  name: string;
  affinity?: number;
  popularity?: number;
  city?: string;
  dimensions: DimensionId[];
  /**
   * Matched terms, for display: which tag/keyword triggered which dimension.
   * source "mapped" = a term the lexicon missed, mapped by a model (see Brief.tagMap).
   */
  matches: { dimension: DimensionId; term: string; source: "tag" | "keyword" | "category" | "mapped" }[];
}

export interface DimensionScore {
  id: DimensionId;
  label: string;
  crowdHits: number;
  crowdN: number;
  baseHits: number;
  baseN: number;
  /** Posterior-mean ratio crowd/base, Beta(1,1) priors. */
  lift: number;
  /** P(crowd rate > base rate) under the Beta posteriors (normal approx). */
  pGreater: number;
  /** Supporting cross-domain taste tags (e.g. "nostalgic" from music/film). */
  tasteTags: { name: string; affinity?: number }[];
  /** Final signed score in [-1, 1] used by rulebooks. */
  score: number;
  /** Did the client's answer to a clarifying question move this score? */
  clientAdjusted?: number;
  /** Top venues carrying this dimension, highest affinity first. */
  exemplars: { entity_id: string; name: string }[];
}

export interface WordReading {
  dimension: DimensionId;
  meaning: string;
  /** Normalised weight across readings of the same word (sums to 1). */
  weight: number;
  isDictionaryDefault: boolean;
}

export interface DecodedWord {
  word: string;
  known: boolean;
  readings: WordReading[];
  chosen?: WordReading;
  /** Margin between the top two readings, 0..1. Low = still ambiguous. */
  margin: number;
  source: "lexicon" | "llm" | "unmapped";
}

export interface EvidenceRef {
  dimension: DimensionId;
  lift: number;
  pGreater: number;
  crowdHits: number;
  crowdN: number;
  baseHits: number;
  baseN: number;
  exemplars: string[];
  exemplarIds: string[];
}

export type LineStatus = "proposed" | "accepted" | "revised";

/**
 * Why a spec line has the value it has.
 *  qloo_evidence   - Qloo place evidence moved or confirmed it (aggregate affinity, measured lift)
 *  client_words    - the client's literal words; evidence didn't decide it
 *  client_answer   - the client's answer to the clarifying question decided it
 *  constraint      - a hard rule (e.g. the warm-light floor) decided it
 *  literal_fallback- evidence was unavailable or insufficient, so the literal reading is used
 */
export type LineBasis = "qloo_evidence" | "client_words" | "client_answer" | "constraint" | "literal_fallback";

export interface ReviewEvent {
  at: string;
  status: LineStatus;
  value: string;
  note?: string;
  ledgerSeq?: number;
}

export interface SpecLine {
  id: string;
  category: string;
  value: string;
  why: string;
  basis: LineBasis;
  evidence: EvidenceRef[];
  /** Ledger seqs of the Qloo requests (crowd + baseline pages) behind the evidence. */
  evidenceLedger: number[];
  /** Signal entity ids whose taste neighbourhood produced the evidence. */
  signalEntityIds: string[];
  constraints: string[];
  /** How well the evidence pins this line down. Zero evidence is always "low". */
  confidence: "high" | "medium" | "low";
  /** What the line would be if the client's words were taken at their dictionary meaning. */
  literalValue: string;
  status: LineStatus;
  revisedTo?: string;
  note?: string;
  /** Every review action on this line, oldest first (never rewritten). */
  history: ReviewEvent[];
}

export interface ClarifyingQuestion {
  dimension: DimensionId;
  versus: DimensionId;
  prompt: string;
  optionA: { entity_id: string; name: string; carries: DimensionId };
  optionB: { entity_id: string; name: string; carries: DimensionId };
  /** Lines whose value differs between the two possible answers. */
  expectedImpact: number;
  /** Model's prior that the client picks A, from the evidence. */
  pA: number;
  /** Expected number of current lines that change once answered. */
  expectedChange: number;
  /** Binary entropy of the answer in bits (1 = evidence can't call it). */
  entropyBits: number;
  answer?: "A" | "B" | "neither";
}

export interface LlmBaseline {
  available: boolean;
  reason?: string;
  model?: string;
  lines?: { category: string; value: string }[];
  /** Per-line audit against Qloo evidence. */
  audit?: { category: string; llmValue: string; evidenceValue: string; agrees: boolean }[];
}

export interface LedgerEntry {
  seq: number;
  ts: string;
  kind: "qloo_call" | "decision" | "computation" | "llm_call" | "client_input";
  summary: string;
  detail: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type AgentState =
  | "INTAKE"
  | "NORMALIZE"
  | "RESOLVE_ENTITIES"
  | "FETCH_QLOO"
  | "ASSESS_EVIDENCE"
  | "INTERPRET"
  | "CHECK_CONSTRAINTS"
  | "SIMULATE_ALTERNATIVES"
  | "CLARIFY_IF_NEEDED"
  | "GENERATE_SPEC"
  | "COUNTER_TEST"
  | "VALIDATE"
  | "PERSIST"
  | "COMPLETE"
  | "NEEDS_CLARIFICATION"
  | "INSUFFICIENT_EVIDENCE"
  | "UPSTREAM_UNAVAILABLE"
  | "FAILED"
  | "CANCELLED";

/** The terminal outcome stored on a brief. FAILED/CANCELLED runs don't produce briefs. */
export type RunStatus = "COMPLETE" | "NEEDS_CLARIFICATION" | "INSUFFICIENT_EVIDENCE" | "UPSTREAM_UNAVAILABLE";

export interface TraceStep {
  seq: number;
  state: AgentState;
  tool: string;
  decision: string;
  rationale: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  validation: "pass" | "fail" | "warn" | "n/a";
  ms: number;
  retries: number;
  evidence: number[];
}

export interface RunStats {
  qlooRequests: number;
  qlooAttempts: number;
  qlooRetries: number;
  qlooFailures: number;
  qlooCacheHits: number;
  qlooMs: number;
  llmCalls: number;
  totalMs: number;
}

export interface Brief {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** SHA-256 of the owner's secret; only the owner may write or list it. */
  ownerHash?: string;
  input: BriefInput;
  /** Where Qloo data came from: the real API or the synthetic fixture. */
  dataMode: "live" | "fixture";
  /** Whether all the evidence the run needed arrived. */
  evidenceMode: "complete" | "degraded";
  status: RunStatus;
  rulebookVersion: string;
  resolutions: Resolution[];
  crowdVenues: VenueEvidence[];
  baseVenues: VenueEvidence[];
  dimensions: DimensionScore[];
  words: DecodedWord[];
  spec: SpecLine[];
  question?: ClarifyingQuestion;
  llmBaseline: LlmBaseline;
  narrative?: string;
  warnings: string[];
  trace: TraceStep[];
  stats: RunStats;
  ledger: LedgerEntry[];
  outcome?: { rating?: number; note?: string; at?: string };
  /** The client's reactions to spec lines on their share link (latest per line). */
  clientFeedback?: Record<string, ClientReaction>;
  /** Where the place evidence came from: the city itself, places weighted toward it, or anywhere. */
  scope?: "city" | "weighted" | "global";
  /** Cross-domain taste tags as returned (kept so the run can be replayed from stored evidence). */
  tasteTags?: { name: string; affinity?: number }[];
  /** Which loves moved which lines, measured by leaving each one out (on request). */
  influence?: InfluenceMap;
  /** Progressively niche views of the same taste (level 0 = the main run). */
  depth?: DepthLayer[];
  /** Which depth level the spec was derived from (default 0). */
  appliedDepth?: 0 | 1 | 2;
  /** Place tags mapped to atmospheres by a model (only when the lexicon missed them). */
  tagMap?: { model: string; mapped: Record<string, DimensionId[]> };
}

export interface InfluenceMap {
  computedAt: string;
  method: "leave-one-out";
  references: {
    entity_id: string;
    name: string;
    /** False when too few places came back without it to say anything. */
    usable: boolean;
    crowdN: number;
    /** Score drop per atmosphere when this reference is removed (positive = it pushes toward that atmosphere). */
    push: Record<DimensionId, number>;
    /** Lines whose value changes without this reference, and what they become. */
    decides: { lineId: string; without: string }[];
  }[];
  lines: { lineId: string; category: string; value: string; deciders: string[]; robust: boolean }[];
  robustLines: number;
  evidence: number[];
}

export interface ClientReaction {
  reaction: "love" | "unsure" | "change";
  note?: string;
  at: string;
  /** The line value the client reacted to (a re-score may change the line later). */
  value: string;
}

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "warn" | "error"; detail?: string; state?: AgentState }
  | { type: "decision"; label: string; detail: string }
  /** Progressive graph: each event replaces the columns it carries. */
  | { type: "graph"; graph: TasteGraph }
  | { type: "brief"; brief: Brief }
  | { type: "error"; message: string; state?: AgentState };
