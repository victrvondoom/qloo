// Deterministic replay. Rebuild a brief's spec from the evidence stored on it
// (places as classified, taste tags, recorded word readings, the client's
// answer, the applied depth) with the rulebook this server runs, and compare
// line by line. No Qloo or model calls. If a stored spec was edited, or the
// rulebook changed since the run, replay names the lines that differ.

import { computeDimensions } from "./fingerprint";
import { verifyLedger } from "./ledger";
import { effectiveDimensions, rebuild } from "./refine";
import { RULEBOOK_VERSION } from "./rulebooks";
import { literalSpec } from "./spec";
import type { Brief, DimensionScore } from "./types";

export interface ReplayCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ReplayResult {
  briefId: string;
  replayedAt: string;
  rulebookVersion: string;
  storedRulebookVersion: string;
  identical: boolean;
  lines: { id: string; category: string; stored: string; replayed: string; same: boolean }[];
  checks: ReplayCheck[];
}

const close = (a: DimensionScore[], b: DimensionScore[]) =>
  a.length === b.length && a.every((d) => {
    const o = b.find((x) => x.id === d.id);
    return o && Math.abs(o.score - d.score) < 1e-9 && o.crowdHits === d.crowdHits && o.baseHits === d.baseHits;
  });

export async function replayBrief(brief: Brief): Promise<ReplayResult> {
  const checks: ReplayCheck[] = [];
  const ledger = await verifyLedger(brief.ledger);
  checks.push({ name: "Ledger chain intact", ok: ledger.ok, detail: ledger.ok ? `${ledger.checked} entries, head ${ledger.head.slice(0, 12)}…` : `Entry ${ledger.firstBadSeq}: ${ledger.reason}` });

  let replayed: { id: string; value: string }[];
  const fallback = brief.status === "INSUFFICIENT_EVIDENCE" || brief.status === "UPSTREAM_UNAVAILABLE";
  if (fallback) {
    replayed = literalSpec(brief.input.trade, brief.input.room, brief.input.words).map((l) => ({ id: l.id, value: l.value }));
    checks.push({ name: "No personalisation without evidence", ok: brief.spec.every((l) => l.value === l.literalValue), detail: "Fallback briefs must equal the literal reading." });
  } else {
    const base = brief.depth?.find((d) => d.level === 0);
    if (base && brief.tasteTags) {
      const recomputed = computeDimensions(brief.crowdVenues, brief.baseVenues, brief.tasteTags, { evidenceUsable: true });
      const ok = close(recomputed, base.dimensions);
      checks.push({
        name: "Fingerprint recomputes from stored places",
        ok,
        detail: ok ? `${brief.crowdVenues.length} taste-matched vs ${brief.baseVenues.length} typical places give the same nine scores.` : "The stored atmosphere scores don't match the stored places.",
      });
    }
    const level = brief.appliedDepth ?? 0;
    const dims = effectiveDimensions(brief, level);
    const sameDims = close(dims, brief.dimensions);
    checks.push({ name: "Answer and depth re-apply cleanly", ok: sameDims, detail: sameDims ? `Depth ${level}${brief.question?.answer ? `, answer ${brief.question.answer}` : ""}.` : "The stored vector differs from evidence + answer + depth." });
    replayed = rebuild(brief, level, brief.question?.answer).spec.map((l) => ({ id: l.id, value: l.value }));
  }

  const lines = brief.spec.map((l) => {
    const r = replayed.find((x) => x.id === l.id)?.value ?? "(no such line)";
    return { id: l.id, category: l.category, stored: l.value, replayed: r, same: r === l.value };
  });
  const identical = lines.every((l) => l.same) && replayed.length === brief.spec.length;
  checks.push({
    name: "Spec rebuilds line for line",
    ok: identical,
    detail: identical
      ? `${lines.length} of ${lines.length} lines identical under ${RULEBOOK_VERSION}.`
      : `${lines.filter((l) => !l.same).length} line(s) differ${brief.rulebookVersion !== RULEBOOK_VERSION ? ` (brief was made with ${brief.rulebookVersion})` : ""}.`,
  });
  return {
    briefId: brief.id,
    replayedAt: new Date().toISOString(),
    rulebookVersion: RULEBOOK_VERSION,
    storedRulebookVersion: brief.rulebookVersion,
    identical,
    lines,
    checks,
  };
}
