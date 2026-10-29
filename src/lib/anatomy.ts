// Taste Anatomy: the client's taste taken apart by domain and put back
// together, with every step measured against Qloo or resampled from stored
// evidence. Ten methods, one report:
//
//   1 facets            one Qloo query per reference alone → its own atmosphere vector vs the city
//   2 agreement         cosine between facet vectors, grouped by domain; coherence = mean agreement
//   3 conflict          the pair of facets that disagree most, and what each leans toward
//   4 consensus core    places a majority of facets choose independently (the narrowest intersection)
//   5 bridge rooms      Qloo asked with only the two conflicting facets: where those tastes meet
//   6 stability         bootstrap resampling of stored places: how often each line survives
//   7 flip distance     fewest places whose reading must change before a line changes
//   8 domain-alone      the spec music alone, screen alone, places & brands alone would build
//   9 corroboration     place evidence vs Qloo taste-tag evidence: atmospheres both channels support
//  10 niche index       divergence of the taste neighbourhood from the city mainstream
//
// Nothing here changes the spec. All Qloo queries are ledgered on the brief.

import { classifyVenue, computeDimensions, hasText } from "./fingerprint";
import { DIMENSIONS, matchMoodText } from "./dimensions";
import { scopeParams, specFor } from "./influence";
import { Ledger } from "./ledger";
import { QlooClient, type Transport } from "./qloo/client";
import { signalIds } from "./refine";
import type { Brief, DimensionId, DimensionScore, TasteAnatomy, VenueEvidence } from "./types";

const PLACE = "urn:entity:place";
const MIN_USABLE = 6;
const IDS = DIMENSIONS.map((d) => d.id);

export function domainOf(type?: string): string {
  const t = (type ?? "").replace("urn:entity:", "");
  if (t === "artist" || t === "album") return "music";
  if (t === "tv_show" || t === "movie" || t === "person") return "screen & people";
  if (t === "book") return "books";
  if (t === "podcast") return "audio";
  if (t === "videogame" || t === "video_game") return "games";
  return "places & brands";
}

type Vec = Record<DimensionId, number>;
const vecOf = (dims: DimensionScore[]): Vec => Object.fromEntries(IDS.map((id) => [id, +(dims.find((d) => d.id === id)?.score ?? 0).toFixed(3)])) as Vec;

export function cosine(a: Vec, b: Vec): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (const id of IDS) {
    ab += a[id] * b[id];
    aa += a[id] * a[id];
    bb += b[id] * b[id];
  }
  return aa && bb ? +(ab / Math.sqrt(aa * bb)).toFixed(3) : 0;
}

function lean(v: Vec): DimensionId {
  return IDS.reduce((best, id) => (v[id] > v[best] ? id : best), IDS[0]);
}

/** Deterministic PRNG so the same brief always resamples the same way. */
function rng(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 6 · Bootstrap: resample taste-matched and baseline places with replacement, rebuild, count. */
export function bootstrapStability(brief: Brief, samples = 400): TasteAnatomy["stability"] {
  const r = rng(brief.id);
  const crowd = brief.crowdVenues;
  const base = brief.baseVenues;
  const tags = brief.tasteTags ?? [];
  const full = specFor(brief, computeDimensions(crowd, base, tags, { evidenceUsable: true }));
  const counts = new Map<string, Map<string, number>>();
  const scores = new Map<DimensionId, number[]>(IDS.map((id) => [id, []]));
  const pick = (xs: VenueEvidence[]) => xs.map(() => xs[Math.floor(r() * xs.length)]);
  for (let i = 0; i < samples; i++) {
    const dims = computeDimensions(pick(crowd), pick(base), tags, { evidenceUsable: true });
    for (const d of dims) scores.get(d.id)!.push(d.score);
    for (const l of specFor(brief, dims)) {
      const m = counts.get(l.id) ?? new Map<string, number>();
      m.set(l.value, (m.get(l.value) ?? 0) + 1);
      counts.set(l.id, m);
    }
  }
  const q = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))].toFixed(3);
  };
  return {
    samples,
    lines: full.map((l) => {
      const m = counts.get(l.id) ?? new Map();
      return {
        lineId: l.id,
        category: l.category,
        value: l.value,
        stable: +((m.get(l.value) ?? 0) / samples).toFixed(3),
        alternatives: [...m.entries()].filter(([v]) => v !== l.value).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([value, n]) => ({ value, share: +(n / samples).toFixed(3) })),
      };
    }),
    dims: IDS.map((id) => ({ id, lo: q(scores.get(id)!, 0.05), hi: q(scores.get(id)!, 0.95) })),
  };
}

/** 7 · Flip distance: strip the line's driving atmosphere from the strongest places one at a time until the value changes. */
export function flipDistances(brief: Brief, limit = 12): TasteAnatomy["flip"] {
  const tags = brief.tasteTags ?? [];
  const base = brief.baseVenues;
  const fullDims = computeDimensions(brief.crowdVenues, base, tags, { evidenceUsable: true });
  const full = specFor(brief, fullDims);
  return full.map((l) => {
    const driver = l.evidence[0]?.dimension;
    if (!driver || l.basis === "constraint") return { lineId: l.id, category: l.category, places: null, reason: l.basis === "constraint" ? "held by a hard constraint" : "decided by the client's words" };
    const carriers = brief.crowdVenues.map((v, i) => ({ v, i })).filter(({ v }) => v.dimensions.includes(driver)).sort((a, b) => (b.v.affinity ?? 0) - (a.v.affinity ?? 0));
    const crowd = [...brief.crowdVenues];
    for (let k = 1; k <= Math.min(limit, carriers.length); k++) {
      const { v, i } = carriers[k - 1];
      crowd[i] = { ...v, dimensions: v.dimensions.filter((d) => d !== driver) };
      const spec = specFor(brief, computeDimensions(crowd, base, tags, { evidenceUsable: true }));
      const now = spec.find((x) => x.id === l.id)?.value;
      if (now !== l.value) return { lineId: l.id, category: l.category, places: k, driver, toValue: now };
    }
    return { lineId: l.id, category: l.category, places: null, driver, reason: `holds after ${Math.min(limit, carriers.length)} places stop reading as this atmosphere` };
  });
}

/** 10 · Niche index: Jensen–Shannon divergence of atmosphere mixes plus the popularity gap. */
export function nicheIndex(brief: Brief): TasteAnatomy["niche"] {
  const mix = (vs: VenueEvidence[]) => {
    const c = Object.fromEntries(IDS.map((id) => [id, 1e-6])) as Vec;
    for (const v of vs) for (const d of v.dimensions) c[d] += 1;
    const t = IDS.reduce((s, id) => s + c[id], 0);
    return Object.fromEntries(IDS.map((id) => [id, c[id] / t])) as Vec;
  };
  const p = mix(brief.crowdVenues);
  const q = mix(brief.baseVenues);
  const kl = (a: Vec, b: Vec) => IDS.reduce((s, id) => s + a[id] * Math.log2(a[id] / b[id]), 0);
  const m = Object.fromEntries(IDS.map((id) => [id, (p[id] + q[id]) / 2])) as Vec;
  const jsd = +(0.5 * kl(p, m) + 0.5 * kl(q, m)).toFixed(3);
  const pop = (vs: VenueEvidence[]) => {
    const xs = vs.map((v) => v.popularity).filter((x): x is number => typeof x === "number");
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  const crowdPop = pop(brief.crowdVenues);
  const basePop = pop(brief.baseVenues);
  const gap = crowdPop !== undefined && basePop !== undefined ? basePop - crowdPop : 0;
  const index = Math.round(100 * Math.max(0, Math.min(1, 0.7 * Math.min(1, jsd / 0.35) + 0.3 * Math.max(0, Math.min(1, gap / 0.25)))));
  return {
    jsd,
    crowdPopularity: crowdPop !== undefined ? +crowdPop.toFixed(3) : undefined,
    basePopularity: basePop !== undefined ? +basePop.toFixed(3) : undefined,
    index,
    recommendDepth: index < 15 ? 2 : index < 35 ? 1 : 0,
    reading:
      index >= 60
        ? "Strongly their own: the places they'd choose look little like the city's usual."
        : index >= 35
          ? "Distinct: clearly different from the city mainstream."
          : "Close to the mainstream: going deeper will separate their taste from what everyone likes.",
  };
}

export async function computeAnatomy(brief: Brief, transport: Transport, opts: { signal?: AbortSignal; budgetMs?: number } = {}): Promise<{ brief: Brief; anatomy: TasteAnatomy }> {
  if (brief.status !== "COMPLETE" && brief.status !== "NEEDS_CLARIFICATION") throw new Error("This brief has no usable evidence to take apart.");
  const ids = signalIds(brief);
  if (ids.length < 2) throw new Error("Taste anatomy needs at least two references the agent could use.");
  const meta = new Map(brief.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => [r.chosen!.entity_id, r.chosen!] as const));
  const mapped = brief.tagMap?.mapped;
  const base = brief.baseVenues;
  const ledger = new Ledger(brief.ledger);
  const qloo = new QlooClient(transport, ledger, { deadline: Date.now() + (opts.budgetMs ?? 50_000), signal: opts.signal, maxCalls: ids.length * 3 + 4 });
  const evidence: number[] = [];
  const scope = scopeParams(brief);

  // 1 · facets, and 9 · their taste-tag channel
  const crowds = new Map<string, VenueEvidence[]>();
  const facets: TasteAnatomy["facets"] = [];
  for (const id of ids) {
    const m = meta.get(id)!;
    const r = await qloo.insightsEntities({ "filter.type": PLACE, "signal.interests.entities": [id], ...scope }, `Facet: places for "${m.name}" alone`, 40);
    evidence.push(...r.evidence);
    const crowd = r.value.filter((e) => hasText(e) && !ids.includes(e.entity_id)).map((e) => classifyVenue(e, mapped));
    crowds.set(id, crowd);
    const t = await qloo.insightsTags({ "signal.interests.entities": [id], take: 20 }, `Facet: taste tags for "${m.name}" alone`).catch(() => undefined);
    if (t) evidence.push(...t.evidence);
    const tagVec = Object.fromEntries(IDS.map((d) => [d, 0])) as Vec;
    for (const tag of t?.value ?? []) for (const d of matchMoodText(tag.name)) tagVec[d] += tag.affinity ?? 0.5;
    const tagTotal = IDS.reduce((s, d) => s + tagVec[d], 0);
    if (tagTotal) for (const d of IDS) tagVec[d] = +(tagVec[d] / tagTotal).toFixed(3);
    const usable = crowd.length >= MIN_USABLE;
    const vector = usable ? vecOf(computeDimensions(crowd, base, [], { evidenceUsable: true })) : (Object.fromEntries(IDS.map((d) => [d, 0])) as Vec);
    facets.push({
      entity_id: id,
      name: m.name,
      type: m.type.replace("urn:entity:", ""),
      domain: domainOf(m.type),
      crowdN: crowd.length,
      usable,
      vector,
      tagVector: tagVec,
      leans: usable ? lean(vector) : undefined,
    });
  }
  const usableFacets = facets.filter((f) => f.usable);

  // 2 · agreement, 3 · conflict
  const agreement: TasteAnatomy["agreement"] = [];
  for (let i = 0; i < usableFacets.length; i++) for (let j = i + 1; j < usableFacets.length; j++) agreement.push({ a: usableFacets[i].entity_id, b: usableFacets[j].entity_id, cosine: cosine(usableFacets[i].vector, usableFacets[j].vector) });
  const coherence = agreement.length ? +(agreement.reduce((s, x) => s + x.cosine, 0) / agreement.length).toFixed(3) : 1;
  const worst = [...agreement].sort((a, b) => a.cosine - b.cosine)[0];
  const facetOf = (id: string) => facets.find((f) => f.entity_id === id)!;
  const conflict = worst && worst.cosine < 0.5 ? { a: worst.a, b: worst.b, cosine: worst.cosine, aLeans: facetOf(worst.a).leans!, bLeans: facetOf(worst.b).leans! } : undefined;

  // 4 · consensus core
  const votes = new Map<string, { v: VenueEvidence; n: number }>();
  for (const f of usableFacets) for (const v of crowds.get(f.entity_id)!) votes.set(v.entity_id, { v, n: (votes.get(v.entity_id)?.n ?? 0) + 1 });
  const threshold = Math.max(2, Math.ceil(usableFacets.length / 2));
  const corePlaces = [...votes.values()].filter((x) => x.n >= threshold).sort((a, b) => b.n - a.n || (b.v.affinity ?? 0) - (a.v.affinity ?? 0));
  const core: TasteAnatomy["core"] = {
    threshold,
    of: usableFacets.length,
    n: corePlaces.length,
    vector: corePlaces.length >= 4 ? vecOf(computeDimensions(corePlaces.map((x) => x.v), base, [], { evidenceUsable: true })) : undefined,
    places: corePlaces.slice(0, 8).map(({ v, n }) => ({ entity_id: v.entity_id, name: v.name, city: v.city, popularity: v.popularity, votes: n, dimensions: v.dimensions })),
  };

  // 5 · bridge rooms
  let bridge: TasteAnatomy["bridge"];
  if (conflict) {
    const r = await qloo.insightsEntities({ "filter.type": PLACE, "signal.interests.entities": [conflict.a, conflict.b].sort(), ...scope }, `Bridge: places for "${facetOf(conflict.a).name}" and "${facetOf(conflict.b).name}" together`, 20);
    evidence.push(...r.evidence);
    const places = r.value.filter((e) => hasText(e) && !ids.includes(e.entity_id)).map((e) => classifyVenue(e, mapped));
    const bridgeVotes = (id: string) => (crowds.get(conflict.a)!.some((v) => v.entity_id === id) ? 1 : 0) + (crowds.get(conflict.b)!.some((v) => v.entity_id === id) ? 1 : 0);
    bridge = {
      places: places
        .filter((v) => v.dimensions.length)
        .sort((x, y) => bridgeVotes(y.entity_id) - bridgeVotes(x.entity_id) || (y.affinity ?? 0) - (x.affinity ?? 0))
        .slice(0, 6)
        .map((v) => ({ entity_id: v.entity_id, name: v.name, city: v.city, popularity: v.popularity, dimensions: v.dimensions, inBoth: bridgeVotes(v.entity_id) === 2 })),
      vector: places.length >= MIN_USABLE ? vecOf(computeDimensions(places, base, [], { evidenceUsable: true })) : undefined,
    };
  }

  // 8 · domain-alone specs
  const full = specFor(brief, computeDimensions(brief.crowdVenues, base, brief.tasteTags ?? [], { evidenceUsable: true }));
  const byDomain = new Map<string, VenueEvidence[]>();
  const domainFacets = new Map<string, string[]>();
  for (const f of usableFacets) {
    const seen = new Map((byDomain.get(f.domain) ?? []).map((v) => [v.entity_id, v] as const));
    for (const v of crowds.get(f.entity_id)!) seen.set(v.entity_id, v);
    byDomain.set(f.domain, [...seen.values()]);
    domainFacets.set(f.domain, [...(domainFacets.get(f.domain) ?? []), f.name]);
  }
  const domains: TasteAnatomy["domains"] = [...byDomain.entries()].map(([domain, crowd]) => {
    const spec = specFor(brief, computeDimensions(crowd, base, [], { evidenceUsable: true }));
    return { domain, facets: domainFacets.get(domain)!, spec: spec.map((l) => ({ lineId: l.id, value: l.value })), agrees: spec.filter((l) => full.find((x) => x.id === l.id)?.value === l.value).length };
  });
  const lineDomains = full.map((l) => ({ lineId: l.id, category: l.category, agree: domains.filter((d) => d.spec.find((x) => x.lineId === l.id)?.value === l.value).length, of: domains.length }));

  // 9 · corroboration (place channel = the main fingerprint; tag channel = mean of facet tag shares)
  const placeVec = vecOf(brief.depth?.find((d) => d.level === 0)?.dimensions ?? brief.dimensions);
  const tagMean = Object.fromEntries(IDS.map((d) => [d, usableFacets.length ? usableFacets.reduce((s, f) => s + f.tagVector[d], 0) / facets.length : 0])) as Vec;
  const corroboration = IDS.map((id) => ({ id, place: placeVec[id], tags: +tagMean[id].toFixed(3), status: (placeVec[id] > 0.15 && tagMean[id] >= 0.08 ? "both" : placeVec[id] > 0.15 ? "places only" : tagMean[id] >= 0.08 ? "tags only" : "neither") as TasteAnatomy["corroboration"][number]["status"] }));

  const anatomy: TasteAnatomy = {
    computedAt: new Date().toISOString(),
    facets,
    agreement,
    coherence,
    conflict,
    core,
    bridge,
    stability: bootstrapStability(brief),
    flip: flipDistances(brief),
    domains,
    lineDomains,
    corroboration,
    niche: nicheIndex(brief),
    evidence,
  };
  const e = await ledger.append("computation", `Taste anatomy: coherence ${coherence.toFixed(2)}, core ${core.n} places, niche index ${anatomy.niche.index}`, {
    facets: facets.map((f) => ({ id: f.entity_id, domain: f.domain, crowdN: f.crowdN, leans: f.leans })),
    conflict: conflict ?? null,
    coreThreshold: `${threshold} of ${usableFacets.length}`,
    bootstrapSamples: anatomy.stability.samples,
    methods: "facets, cosine agreement, consensus core, bridge query, bootstrap, flip distance, domain-alone specs, tag corroboration, JSD niche index",
  });
  anatomy.evidence.push(e.seq);
  return {
    brief: {
      ...brief,
      updatedAt: new Date().toISOString(),
      anatomy,
      ledger: ledger.entries,
      stats: { ...brief.stats, qlooRequests: brief.stats.qlooRequests + qloo.stats.requests, qlooAttempts: brief.stats.qlooAttempts + qloo.stats.attempts, qlooMs: brief.stats.qlooMs + qloo.stats.ms },
    },
    anatomy,
  };
}
