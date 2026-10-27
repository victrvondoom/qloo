// Atmosphere fingerprint: which kinds of rooms does this client's taste
// community choose, compared with the rooms everyone in the same city chooses?
//
// crowd  = places Qloo ranks highest for people who love what the client loves
// base   = the city's places with no taste signal (Qloo's popularity order)
//
// For each dimension we compare the share of crowd venues carrying it with the
// share of base venues carrying it, under Beta(1,1) priors. The lift is the
// ratio of posterior means; pGreater is P(crowd rate > base rate). Only venues
// that have at least one tag or keyword count, so untagged places can't dilute
// either side.

import { DIMENSIONS, DIMENSION_BY_ID, matchMoodText, matchVenueText } from "./dimensions";
import type { DimensionId, DimensionScore, QlooEntity, VenueEvidence } from "./types";

export function classifyVenue(e: QlooEntity): VenueEvidence {
  const matches: VenueEvidence["matches"] = [];
  const seen = new Set<DimensionId>();
  const sources: { text: string; source: "tag" | "keyword" | "category" }[] = [
    ...e.tags.map((t) => ({
      text: `${t.name} ${t.tag_id.split(":").at(-1) ?? ""}`,
      source: (t.tag_id.includes(":category:") || t.tag_id.includes(":genre:") ? "category" : "tag") as "tag" | "category",
    })),
    ...e.keywords.map((k) => ({ text: k, source: "keyword" as const })),
  ];
  for (const s of sources) {
    for (const hit of matchVenueText(s.text)) {
      if (seen.has(hit.dimension)) continue;
      seen.add(hit.dimension);
      matches.push({ dimension: hit.dimension, term: hit.term, source: s.source });
    }
  }
  return {
    entity_id: e.entity_id,
    name: e.name,
    affinity: e.affinity,
    popularity: e.popularity,
    dimensions: [...seen],
    matches,
  };
}

export function hasText(e: QlooEntity): boolean {
  return e.tags.length > 0 || e.keywords.length > 0;
}

/** Abramowitz–Stegun approximation of the standard normal CDF. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export interface LiftStats {
  lift: number;
  pGreater: number;
}

export function betaLift(crowdHits: number, crowdN: number, baseHits: number, baseN: number): LiftStats {
  const mc = (crowdHits + 1) / (crowdN + 2);
  const mb = (baseHits + 1) / (baseN + 2);
  const vc = (mc * (1 - mc)) / (crowdN + 3);
  const vb = (mb * (1 - mb)) / (baseN + 3);
  const z = (mc - mb) / Math.sqrt(vc + vb);
  return { lift: mc / mb, pGreater: normalCdf(z) };
}

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

/**
 * Signed score in [-1, 1]: log-lift scaled so a 2.8x lift saturates, then
 * multiplied by how decided the posterior comparison is. Cross-domain taste
 * tags can nudge a dimension up by at most 0.3, never create one from nothing
 * on the negative side.
 */
export function scoreFrom(stats: LiftStats, tasteTagCount: number): number {
  const certainty = Math.abs(2 * stats.pGreater - 1);
  const s = clamp(Math.log2(stats.lift) / 1.5) * certainty;
  const boost = Math.min(0.3, 0.1 * tasteTagCount);
  return clamp(s + boost * (1 - Math.abs(s)));
}

export function computeDimensions(
  crowd: VenueEvidence[],
  base: VenueEvidence[],
  tasteTags: { name: string; affinity?: number }[],
): DimensionScore[] {
  return DIMENSIONS.map((d) => {
    const crowdHits = crowd.filter((v) => v.dimensions.includes(d.id)).length;
    const baseHits = base.filter((v) => v.dimensions.includes(d.id)).length;
    const stats = betaLift(crowdHits, crowd.length, baseHits, base.length);
    const tags = tasteTags.filter((t) => matchMoodText(t.name).includes(d.id)).slice(0, 6);
    const exemplars = crowd
      .filter((v) => v.dimensions.includes(d.id))
      .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
      .slice(0, 4)
      .map((v) => ({ entity_id: v.entity_id, name: v.name }));
    return {
      id: d.id,
      label: DIMENSION_BY_ID[d.id].label,
      crowdHits,
      crowdN: crowd.length,
      baseHits,
      baseN: base.length,
      lift: stats.lift,
      pGreater: stats.pGreater,
      tasteTags: tags,
      score: scoreFrom(stats, tags.length),
      exemplars,
    };
  });
}

/** Apply a client's answer to a clarifying question: a strong, explicit signal. */
export function applyClientAnswer(
  dims: DimensionScore[],
  chosen: DimensionId,
  rejected: DimensionId,
): DimensionScore[] {
  return dims.map((d) => {
    if (d.id === chosen) {
      const target = Math.max(d.score, 0) + 0.5;
      const next = clamp(target);
      return { ...d, score: next, clientAdjusted: (d.clientAdjusted ?? 0) + (next - d.score) };
    }
    if (d.id === rejected) {
      const next = clamp(Math.min(d.score, 0) - 0.4);
      return { ...d, score: next, clientAdjusted: (d.clientAdjusted ?? 0) + (next - d.score) };
    }
    return d;
  });
}
