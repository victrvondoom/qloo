// What-if revisions: change one thing about a brief and run the real agent again.
// This only builds the modified input and runs the existing pipeline; the
// comparison is done by spec-diff.ts on the two compiled specifications.

import { cleanInput, runBrief, transportForBrief, type RunOptions } from "./agent";
import { cleanCctRange, parseConstraints, type CctRange } from "./constraints";
import type { RawResponse, Transport } from "./qloo/client";
import type { Brief, BriefInput } from "./types";

export interface Changes {
  replaceLove?: { from: string; to: string };
  addLove?: string;
  removeLove?: string;
  words?: string[];
  /** Pass null to clear a limit. */
  cctRange?: CctRange | null;
  criMin?: number | null;
  dimTo?: number | null;
  luxTarget?: number | null;
  /** A sentence the client wrote: its limits replace the ones it mentions. */
  sentence?: string;
  /** input text -> entity id the designer confirmed. */
  pin?: Record<string, string>;
  /** Run with Qloo evidence removed (what-if: nothing came back). */
  removeEvidence?: boolean;
}

export class ReviseError extends Error {}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The modified input, or a ReviseError saying what cannot hold. Refuses contradictory requirements instead of choosing. */
export function reviseInput(prev: BriefInput, c: Changes): BriefInput {
  const next: BriefInput = { ...prev, loves: [...prev.loves], pinned: { ...(prev.pinned ?? {}) } };
  if (c.replaceLove) {
    const i = next.loves.findIndex((l) => norm(l) === norm(c.replaceLove!.from));
    if (i < 0) throw new ReviseError(`"${c.replaceLove.from}" is not one of this client's references.`);
    next.loves[i] = c.replaceLove.to;
    delete next.pinned![prev.loves[i]];
  }
  if (c.addLove) next.loves.push(c.addLove);
  if (c.removeLove) {
    const before = next.loves.length;
    next.loves = next.loves.filter((l) => norm(l) !== norm(c.removeLove!));
    if (next.loves.length === before) throw new ReviseError(`"${c.removeLove}" is not one of this client's references.`);
  }
  if (c.words) next.words = c.words;
  if (c.sentence) {
    const p = parseConstraints(c.sentence);
    if (p.conflicts.length) throw new ReviseError(`Requirements that can't both hold: ${p.conflicts.join(" ")}`);
    const l = p.limits;
    if (l.cct) next.cctRange = l.cct;
    if (l.criMin) next.criMin = l.criMin;
    if (l.dimTo) next.dimTo = l.dimTo;
    if (l.dimmable) next.dimmable = true;
    if (l.luxTarget) next.luxTarget = l.luxTarget;
    next.sourceText = `${prev.sourceText ? `${prev.sourceText}\n` : ""}${c.sentence}`.slice(0, 4000);
  }
  if (c.cctRange !== undefined) {
    if (c.cctRange !== null && !cleanCctRange(c.cctRange)) throw new ReviseError("That colour-temperature range is not possible (1800–6500K, minimum not above maximum).");
    next.cctRange = c.cctRange ?? undefined;
  }
  const num = (v: number | null | undefined, lo: number, hi: number, what: string) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (!Number.isInteger(v) || v < lo || v > hi) throw new ReviseError(`${what} must be a whole number from ${lo} to ${hi}.`);
    return v;
  };
  const cri = num(c.criMin, 60, 100, "Minimum CRI");
  if (cri !== undefined) next.criMin = cri ?? undefined;
  const dim = num(c.dimTo, 1, 100, "The dimming floor");
  if (dim !== undefined) {
    next.dimTo = dim ?? undefined;
    if (dim) next.dimmable = true;
  }
  const lux = num(c.luxTarget, 5, 2000, "The lux target");
  if (lux !== undefined) next.luxTarget = lux ?? undefined;
  if (c.pin) for (const [k, v] of Object.entries(c.pin)) if (typeof v === "string" && v.length < 120) next.pinned![k] = v;
  if (!Object.keys(next.pinned!).length) delete next.pinned;
  const clean = cleanInput(next);
  if (clean.loves.length < 2 && !c.removeEvidence) throw new ReviseError("A brief needs at least two references.");
  // Server-side check on the whole message, as at intake.
  const conflicts = parseConstraints(clean.sourceText ?? "").conflicts;
  if (conflicts.length) throw new ReviseError(`Requirements that can't both hold: ${conflicts.join(" ")}`);
  return clean;
}

/** A transport that returns nothing: the "Qloo evidence removed" what-if. It keeps the original data mode and says so. */
export function noEvidenceTransport(mode: "live" | "fixture"): Transport {
  return {
    mode,
    note: "Qloo evidence removed for this what-if",
    async get(path: string): Promise<RawResponse> {
      return { status: 200, body: path === "/search" ? { results: [] } : { results: { entities: [], tags: [] } } };
    },
  };
}

export async function runRevision(prev: Brief, c: Changes, opts: Pick<RunOptions, "signal" | "ownerHash" | "tagMapper"> & { transport?: Transport } = {}): Promise<{ input: BriefInput; brief: Brief }> {
  const input = reviseInput(prev.input, c);
  const transport = opts.transport ?? (c.removeEvidence ? noEvidenceTransport(prev.dataMode) : transportForBrief(prev));
  const brief = await runBrief({ ...input, project: prev.input.project }, () => {}, { ...opts, transport, useLlm: false });
  return { input, brief };
}
