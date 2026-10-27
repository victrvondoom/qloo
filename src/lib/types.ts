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
  status: "resolved" | "ambiguous" | "not_found";
  chosen?: { entity_id: string; name: string; type: string; popularity?: number };
  alternatives: { entity_id: string; name: string; type: string; popularity?: number }[];
  /** 0..1 string similarity between input and chosen name. */
  similarity: number;
  method: "pinned" | "exact" | "type_hint" | "llm" | "top_result";
  note?: string;
}

export interface VenueEvidence {
  entity_id: string;
  name: string;
  affinity?: number;
  popularity?: number;
  dimensions: DimensionId[];
  /** Matched terms, for display: which tag/keyword triggered which dimension. */
  matches: { dimension: DimensionId; term: string; source: "tag" | "keyword" | "category" }[];
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
}

export type LineStatus = "proposed" | "accepted" | "revised";

export interface SpecLine {
  id: string;
  category: string;
  value: string;
  why: string;
  evidence: EvidenceRef[];
  /** How well the evidence pins this line down: high | medium | low. */
  confidence: "high" | "medium" | "low";
  /** What the line would be if the client's words were taken at their dictionary meaning. */
  literalValue: string;
  status: LineStatus;
  revisedTo?: string;
  note?: string;
}

export interface ClarifyingQuestion {
  dimension: DimensionId;
  versus: DimensionId;
  prompt: string;
  optionA: { entity_id: string; name: string; carries: DimensionId };
  optionB: { entity_id: string; name: string; carries: DimensionId };
  /** Expected number of spec lines that change depending on the answer. */
  expectedImpact: number;
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

export interface Brief {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: BriefInput;
  dataMode: "live" | "fixture";
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
  ledger: LedgerEntry[];
  outcome?: { rating?: number; note?: string; at?: string };
}

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "warn" | "error"; detail?: string }
  | { type: "decision"; label: string; detail: string }
  | { type: "brief"; brief: Brief }
  | { type: "error"; message: string };
