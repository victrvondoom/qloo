// Progressively niche. Level 0 is the main run. Levels 1 and 2 ask Qloo the same
// taste question restricted to less popular places, crowd AND baseline alike,
// so the lift still compares like with like. What comes back is a narrower slice
// of the same taste: reference rooms a designer may not know, and whether the
// atmosphere reading holds (or sharpens) away from the obvious places.
//
// Popularity caps adapt to the scale Qloo actually returns: "Curated" = the
// median popularity of the main run's places, "Deep cut" = their 25th percentile.

import { classifyVenue, computeDimensions, hasText } from "./fingerprint";
import { Ledger } from "./ledger";
import { QlooClient, QlooError, type Params, type Transport } from "./qloo/client";
import type { Brief, DepthLayer, DimensionScore, QlooEntity, ReferenceRoom, VenueEvidence } from "./types";

export const DEPTH_LABELS: Record<0 | 1 | 2, DepthLayer["label"]> = { 0: "Mainstream", 1: "Curated", 2: "Deep cut" };
const PLACE = "urn:entity:place";
const MIN_USABLE = 6;
/** Below this, a layer is shown but marked thin (same threshold as the main run's warning). */
const MIN_TAGGED = 12;

/** Places that best show the client's leading atmospheres, highest affinity first. */
export function referenceRooms(crowd: VenueEvidence[], dims: DimensionScore[], n = 8): ReferenceRoom[] {
  const top = new Set(
    [...dims]
      .filter((d) => d.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((d) => d.id),
  );
  const rank = (v: VenueEvidence) => (v.affinity ?? 0) + 0.25 * v.dimensions.filter((d) => top.has(d)).length;
  return [...crowd]
    .filter((v) => v.dimensions.length > 0)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, n)
    .map((v) => ({
      entity_id: v.entity_id,
      name: v.name,
      ...(v.city ? { city: v.city } : {}),
      ...(v.affinity !== undefined ? { affinity: v.affinity } : {}),
      ...(v.popularity !== undefined ? { popularity: v.popularity } : {}),
      dimensions: v.dimensions,
      terms: [...new Set(v.matches.map((m) => m.term))].slice(0, 4),
    }));
}

export function mainDepthLayer(crowd: VenueEvidence[], base: VenueEvidence[], dims: DimensionScore[], evidence: number[]): DepthLayer {
  return {
    level: 0,
    label: DEPTH_LABELS[0],
    method: "none",
    crowdN: crowd.length,
    baseN: base.length,
    usable: true,
    dimensions: dims,
    references: referenceRooms(crowd, dims),
    evidence: [...evidence],
    computedAt: new Date().toISOString(),
  };
}

function quantile(xs: number[], q: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

/** Adaptive caps from the main run's popularity values (undefined when Qloo sent none). */
export function popularityCaps(crowd: VenueEvidence[]): { 1?: number; 2?: number } {
  const pops = crowd.map((v) => v.popularity).filter((p): p is number => typeof p === "number");
  if (pops.length < 6) return {};
  return { 1: +quantile(pops, 0.5).toFixed(4), 2: +quantile(pops, 0.25).toFixed(4) };
}

export async function computeDepth(brief: Brief, level: 1 | 2, qloo: QlooClient, ledger: Ledger): Promise<DepthLayer> {
  const signals = [...new Set(brief.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => r.chosen!.entity_id))].sort();
  const caps = popularityCaps(brief.crowdVenues);
  const cap = caps[level];
  const computedAt = new Date().toISOString();
  const empty = (note: string): DepthLayer => ({
    level,
    label: DEPTH_LABELS[level],
    method: "none",
    crowdN: 0,
    baseN: 0,
    usable: false,
    dimensions: [],
    references: [],
    evidence: [],
    computedAt,
    note,
  });
  if (!signals.length) return empty("No resolved references to search with.");
  if (cap === undefined) return empty("Qloo returned no popularity values for these places, so there is nothing to narrow by.");

  const city = brief.input.city;
  const mapped = brief.tagMap?.mapped;
  const evidence: number[] = [];
  let method: DepthLayer["method"] = "api_filter";

  const fetchSide = async (withSignals: boolean, location: Params): Promise<QlooEntity[]> => {
    const baseParams: Params = { "filter.type": PLACE, ...location, ...(withSignals ? { "signal.interests.entities": signals } : {}) };
    const label = `${DEPTH_LABELS[level]} ${withSignals ? "taste-matched" : "baseline"} places (popularity ≤ ${cap})`;
    if (method === "api_filter") {
      try {
        const r = await qloo.insightsEntities({ ...baseParams, "filter.popularity.max": cap }, label, 40);
        evidence.push(...r.evidence);
        return r.value;
      } catch (err) {
        if (!(err instanceof QlooError) || err.kind !== "bad_request") throw err;
        method = "client_filter"; // Qloo rejected the param: filter what it returns instead.
        await ledger.append("decision", "Popularity filter not accepted; filtering returned places locally", { error: err.message.slice(0, 200) });
      }
    }
    const r = await qloo.insightsEntities(baseParams, `${label} (local filter)`, 60);
    evidence.push(...r.evidence);
    return r.value.filter((e) => typeof e.popularity === "number" && e.popularity <= cap);
  };

  // Same geography as the main run: start inside the city only if the main run could.
  let location: Params = !brief.scope || brief.scope === "city" ? { "filter.location.query": city } : { "signal.location.query": city };
  let crowdRaw = await fetchSide(true, location);
  if ("filter.location.query" in location && crowdRaw.filter(hasText).length < MIN_TAGGED) {
    location = { "signal.location.query": city };
    crowdRaw = await fetchSide(true, location);
  }
  const baseRaw = await fetchSide(false, location);
  const crowd = crowdRaw.filter((e) => hasText(e) && !signals.includes(e.entity_id)).map((e) => classifyVenue(e, mapped));
  const base = baseRaw.filter(hasText).map((e) => classifyVenue(e, mapped));
  const usable = crowd.length >= MIN_USABLE && base.length >= MIN_USABLE;
  const dims = computeDimensions(crowd, base, brief.tasteTags ?? [], { evidenceUsable: usable });
  const top = [...dims].sort((a, b) => b.score - a.score).slice(0, 3);
  const e = await ledger.append("computation", `Depth "${DEPTH_LABELS[level]}": popularity ≤ ${cap} (${method === "api_filter" ? "Qloo filter" : "local filter"})`, {
    level,
    popularityMax: cap,
    method,
    crowdN: crowd.length,
    baseN: base.length,
    usable,
    top: top.map((d) => ({ id: d.id, lift: +d.lift.toFixed(3), score: +d.score.toFixed(3) })),
  });
  evidence.push(e.seq);
  return {
    level,
    label: DEPTH_LABELS[level],
    popularityMax: cap,
    method,
    crowdN: crowd.length,
    baseN: base.length,
    usable,
    dimensions: dims,
    references: referenceRooms(crowd, dims),
    evidence,
    computedAt,
    note: !usable
      ? `Only ${crowd.length} taste-matched and ${base.length} typical places at this depth; too few to read an atmosphere.`
      : crowd.length < MIN_TAGGED || base.length < MIN_TAGGED
        ? `Thin: ${crowd.length} taste-matched vs ${base.length} typical places. Treat as a lead, not a finding.`
        : "filter.location.query" in location
          ? undefined
          : `Too few such places inside ${city}; these are weighted toward ${city}.`,
  };
}

/**
 * Explore one depth level for a finished brief (a handful of Qloo calls,
 * ledgered on the brief). Returns the brief with the layer added; computing a
 * level that already exists is a no-op. Applying it to the spec is separate
 * (refine.applyDepth), so a designer can look before switching.
 */
export async function exploreDepth(brief: Brief, level: 1 | 2, transport: Transport, opts: { signal?: AbortSignal; budgetMs?: number } = {}): Promise<{ brief: Brief; layer: DepthLayer; fresh: boolean }> {
  const main = brief.depth?.find((d) => d.level === 0);
  if (!main || !brief.depth) throw new Error("This brief has no usable evidence to narrow from.");
  const existing = brief.depth.find((d) => d.level === level);
  if (existing) return { brief, layer: existing, fresh: false };
  const ledger = new Ledger(brief.ledger);
  const qloo = new QlooClient(transport, ledger, { deadline: Date.now() + (opts.budgetMs ?? 40_000), signal: opts.signal, maxCalls: 12 });
  const layer = await computeDepth(brief, level, qloo, ledger);
  const depth = [...brief.depth.filter((d) => d.level !== level), layer].sort((a, b) => a.level - b.level);
  return {
    brief: {
      ...brief,
      updatedAt: new Date().toISOString(),
      depth,
      ledger: ledger.entries,
      stats: {
        ...brief.stats,
        qlooRequests: brief.stats.qlooRequests + qloo.stats.requests,
        qlooAttempts: brief.stats.qlooAttempts + qloo.stats.attempts,
        qlooRetries: brief.stats.qlooRetries + qloo.stats.retries,
        qlooFailures: brief.stats.qlooFailures + qloo.stats.failures,
        qlooCacheHits: brief.stats.qlooCacheHits + qloo.stats.cacheHits,
        qlooMs: brief.stats.qlooMs + qloo.stats.ms,
      },
    },
    layer,
    fresh: true,
  };
}
