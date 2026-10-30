// Evidence sensitivity: for each reference the client gave, what happens to the
// specification when Qloo is asked again without it. The recomputation itself is
// the influence map (influence.ts: one ledgered Qloo query per reference, same
// geography, baseline, tags and answer). This module turns it into a stability
// verdict per line and per reference and checks that the client's written limits
// still held in every recomputation.
//
// The stability index is a plain count, defined below. It is not a validated
// confidence score and says nothing about the probability that this client likes
// anything: Qloo's figures are aggregates over places.

import { limitsOf, limitProblem } from "./constraints";
import type { Brief } from "./types";

export type LineStability = "robust" | "single_source" | "multi_source" | "unverifiable";

export interface SensitivityReport {
  schema: "tastespec.sensitivity/1";
  computedAt: string;
  method: string;
  indexDefinition: string;
  references: {
    entity_id: string;
    name: string;
    usable: boolean;
    placesWithout: number;
    /** Taste-matched places returned without this reference, minus with it. Fewer places means thinner evidence. */
    coverageChange: number;
    changed: { lineId: string; category: string; without: string }[];
    stableFraction: number;
    hardLimitViolations: number;
  }[];
  lines: { lineId: string; category: string; value: string; stability: LineStability; deciders: string[]; advice: string }[];
  /** Share of (usable reference, line) pairs whose value did not change when that reference was removed. */
  stabilityIndex: number | null;
  hardLimitViolations: number;
  needsClarification: string[];
}

export class NoInfluenceError extends Error {}

export function sensitivityFromBrief(brief: Brief): SensitivityReport {
  const inf = brief.influence;
  if (!inf) throw new NoInfluenceError("Run the evidence sensitivity analysis first: it asks Qloo again without each reference.");
  const limits = limitsOf(brief.input);
  const cat = new Map(brief.spec.map((l) => [l.id, l.category]));
  const fullN = brief.crowdVenues.length;
  const refs = inf.references.map((r) => {
    const changed = r.decides.map((d) => ({ lineId: d.lineId, category: cat.get(d.lineId) ?? d.lineId, without: d.without }));
    return {
      entity_id: r.entity_id,
      name: r.name,
      usable: r.usable,
      placesWithout: r.crowdN,
      coverageChange: r.crowdN - fullN,
      changed,
      stableFraction: r.usable && brief.spec.length ? +(1 - changed.length / brief.spec.length).toFixed(3) : 1,
      hardLimitViolations: changed.filter((c) => limitProblem(c.lineId, c.without, limits) !== undefined).length,
    };
  });
  const usable = refs.filter((r) => r.usable);
  const lines = brief.spec.map((l) => {
    const deciders = usable.filter((r) => r.changed.some((c) => c.lineId === l.id)).map((r) => r.name);
    const stability: LineStability = !usable.length ? "unverifiable" : deciders.length === 0 ? "robust" : deciders.length === 1 ? "single_source" : "multi_source";
    const advice =
      stability === "robust" ? "Holds when any one reference is removed."
      : stability === "single_source" ? `Hangs on one reference (${deciders[0]}). Ask the client whether it speaks for their taste.`
      : stability === "multi_source" ? `Changes when any of ${deciders.length} references is removed (${deciders.join(", ")}). Confirm with the client.`
      : "Not enough places came back without any reference to test this line.";
    return { lineId: l.id, category: l.category, value: l.value, stability, deciders, advice };
  });
  const pairs = usable.length * brief.spec.length;
  const unchanged = usable.reduce((n, r) => n + (brief.spec.length - r.changed.length), 0);
  return {
    schema: "tastespec.sensitivity/1",
    computedAt: inf.computedAt,
    method: "leave-one-reference-out: Qloo is asked for the taste-matched places again without that reference, with the same geography, city baseline, taste tags, client answer and written limits; the specification is rebuilt and compared.",
    indexDefinition: "Stability index = the share of (usable reference, specification line) pairs in which removing that one reference leaves the line's value unchanged. A descriptive count, not a validated confidence score.",
    references: refs,
    lines,
    stabilityIndex: pairs ? +(unchanged / pairs).toFixed(3) : null,
    hardLimitViolations: refs.reduce((n, r) => n + r.hardLimitViolations, 0),
    needsClarification: lines.filter((l) => l.stability === "single_source" || l.stability === "multi_source").map((l) => l.lineId),
  };
}
