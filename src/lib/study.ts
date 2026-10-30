// The human preference study: blinded pairs of specifications, judged by people.
//
// Nothing here simulates a participant. Cases are produced by the real pipeline
// (scripts/build-study-cases.ts) and stored with a content hash; a response is
// stored against the exact case version and the systems that were shown.
// Participants are anonymous: a random session hash, no name, email or IP.

import { sha256Hex } from "./ledger";

export type StudySystem = "B0" | "B2" | "B3" | "B1";
export const SYSTEM_NAMES: Record<StudySystem, string> = {
  B0: "Literal words only",
  B1: "LLM only (no Qloo)",
  B2: "Deterministic Qloo mapping",
  B3: "Full Tastespec",
};
export const CONSENT_VERSION = "consent-2026-10-30";
export const MIN_INTERPRETABLE = 20;

export interface StudyLine {
  category: string;
  value: string;
}

export interface StudyCase {
  id: string;
  title: string;
  /** What the participant is told about the client. */
  brief: { clientLabel: string; city: string; room: string; words: string[]; loves: string[]; constraints: string[] };
  dataMode: "live" | "fixture";
  rulebook: string;
  candidates: Partial<Record<StudySystem, StudyLine[]>>;
  /** SHA-256 over the content a participant sees, so a response is tied to exactly what was judged. */
  version: string;
}

export function caseVersion(c: Omit<StudyCase, "version">): Promise<string> {
  return sha256Hex(JSON.stringify({ id: c.id, brief: c.brief, dataMode: c.dataMode, rulebook: c.rulebook, candidates: c.candidates }));
}

export const CHOICES = ["A", "B", "equal", "neither"] as const;
export type Choice = (typeof CHOICES)[number];
export const CRITERIA = ["reflects", "designer", "clarity", "constraints"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const QUESTIONS: Record<Criterion, string> = {
  reflects: "Which specification better reflects what this client described?",
  designer: "Which would you hand to an interior designer?",
  clarity: "Which is easier to understand?",
  constraints: "Which better respects the client's explicit requirements?",
};

/** Keeps only cases whose content still matches their version hash (an edited case is dropped, not served). */
export async function validCases(raw: unknown): Promise<StudyCase[]> {
  if (!Array.isArray(raw)) return [];
  const out: StudyCase[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const x = c as StudyCase;
    if (typeof x.id !== "string" || typeof x.version !== "string" || !x.candidates) continue;
    const { version, ...rest } = x;
    if ((await caseVersion(rest)) === version && Object.values(x.candidates).filter(Boolean).length >= 2) out.push(x);
  }
  return out;
}

/** Pairs of systems whose specifications actually differ. Identical candidates give a participant nothing to judge. */
export function distinctPairs(c: Pick<StudyCase, "candidates">): [StudySystem, StudySystem][] {
  const sys = (Object.keys(c.candidates) as StudySystem[]).filter((k) => c.candidates[k]);
  const out: [StudySystem, StudySystem][] = [];
  for (let i = 0; i < sys.length; i++) for (let j = i + 1; j < sys.length; j++) if (JSON.stringify(c.candidates[sys[i]]) !== JSON.stringify(c.candidates[sys[j]])) out.push([sys[i], sys[j]]);
  return out;
}

const cryptoInt = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

/** Picks one differing pair and a random left/right, using crypto randomness. */
export function pickPair(pairs: [StudySystem, StudySystem][], rand: (n: number) => number = cryptoInt): { left: StudySystem; right: StudySystem } | undefined {
  if (!pairs.length) return undefined;
  const [x, y] = pairs[rand(pairs.length)];
  return rand(2) === 0 ? { left: x, right: y } : { left: y, right: x };
}

// ---------------------------------------------------------------- analysis

export function wilson(k: number, n: number, z = 1.96) {
  if (n === 0) return { p: null as number | null, lo: null as number | null, hi: null as number | null, n };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p: +p.toFixed(4), lo: +Math.max(0, c - h).toFixed(4), hi: +Math.min(1, c + h).toFixed(4), n };
}

export interface ResponseRow {
  case_id: string;
  case_version: string;
  data_mode: string;
  left_system: StudySystem;
  right_system: StudySystem;
  reflects: Choice;
  designer: Choice;
  clarity: Choice;
  constraints: Choice;
  confidence: number;
}

/** Winner as a system, or "equal" / "neither". */
function winner(r: ResponseRow, c: Criterion): StudySystem | "equal" | "neither" {
  const v = r[c];
  return v === "A" ? r.left_system : v === "B" ? r.right_system : v;
}

export interface PairSummary {
  pair: string;
  responses: number;
  criteria: Record<Criterion, { first: number; second: number; equal: number; neither: number; decisive: number; firstShareOfDecisive: ReturnType<typeof wilson>; equalRate: number | null; neitherRate: number | null }>;
  meanConfidence: number | null;
}

export function summarize(rows: ResponseRow[]) {
  const pairs = new Map<string, ResponseRow[]>();
  for (const r of rows) {
    const key = [r.left_system, r.right_system].sort().join(" vs ");
    pairs.set(key, [...(pairs.get(key) ?? []), r]);
  }
  const byPair: PairSummary[] = [...pairs.entries()].map(([pair, rs]) => {
    const [first, second] = pair.split(" vs ") as [StudySystem, StudySystem];
    const criteria = Object.fromEntries(
      CRITERIA.map((c) => {
        const w = rs.map((r) => winner(r, c));
        const f = w.filter((x) => x === first).length;
        const s = w.filter((x) => x === second).length;
        const eq = w.filter((x) => x === "equal").length;
        const ne = w.filter((x) => x === "neither").length;
        return [c, { first: f, second: s, equal: eq, neither: ne, decisive: f + s, firstShareOfDecisive: wilson(f, f + s), equalRate: rs.length ? +(eq / rs.length).toFixed(4) : null, neitherRate: rs.length ? +(ne / rs.length).toFixed(4) : null }];
      }),
    ) as PairSummary["criteria"];
    return { pair, responses: rs.length, criteria, meanConfidence: rs.length ? +(rs.reduce((a, r) => a + r.confidence, 0) / rs.length).toFixed(2) : null };
  });
  return {
    responses: rows.length,
    interpretable: rows.length >= MIN_INTERPRETABLE,
    byPair,
    byCase: [...new Set(rows.map((r) => r.case_id))].map((id) => ({ caseId: id, versions: [...new Set(rows.filter((r) => r.case_id === id).map((r) => r.case_version.slice(0, 12)))], responses: rows.filter((r) => r.case_id === id).length })),
    dataModes: [...new Set(rows.map((r) => r.data_mode))],
  };
}
