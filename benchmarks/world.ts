// Seeded synthetic world for offline benchmarking. NOT Qloo data.
//
// It exists to test the pipeline's *inference* under controlled conditions:
// whether it recovers a client's latent atmosphere preferences from noisy,
// partially-tagged place data, abstains when it should, survives failures, and
// stays stable under irrelevant changes. It cannot tell us whether the design
// mappings are good, or whether real clients prefer the output; those need
// live Qloo data and human labels (see EVALUATION_METHODOLOGY.md).
//
// Deliberate realism:
//  - venue text uses the app lexicon only part of the time (vocabulary mismatch)
//  - some venues carry a misleading term from an unrelated atmosphere
//  - some venues have no tags at all
//  - affinity is latent match + popularity + noise, so crowd sets are imperfect
//  - cities differ in coverage (dense / medium / sparse)
//  - some reference names collide across entity types

import { DIMENSIONS } from "../src/lib/dimensions";
import type { Params, RawResponse, Transport } from "../src/lib/qloo/client";
import type { DimensionId } from "../src/lib/types";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIM_IDS = DIMENSIONS.map((d) => d.id);
const OPPOSITE = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d.opposite])) as Record<DimensionId, DimensionId>;

/** Words a real review might use that the lexicon does NOT contain. */
const OFF_LEXICON: Record<DimensionId, string[]> = {
  low_glow: ["amber-lit", "shadowy", "low-lit", "hushed glow"],
  bright_airy: ["sun-drenched", "glassy", "light and open"],
  clean_minimal: ["pared-back", "streamlined", "gallery-white"],
  vintage_character: ["old-world", "time-worn", "nostalgia"],
  industrial_raw: ["raw concrete", "steel beams", "ex-factory"],
  natural_organic: ["leafy", "earthen", "handmade ceramics"],
  refined_luxe: ["polished", "plush", "velvet ropes"],
  energetic_social: ["buzzing", "rowdy", "packed"],
  calm_quiet: ["hushed", "unhurried", "still"],
};

export interface Venue {
  id: string;
  name: string;
  city: string;
  dims: DimensionId[];
  popularity: number;
  tags: { tag_id: string; name: string; type: string }[];
  keywords: { name: string; count: number }[];
}

export interface Love {
  id: string;
  name: string;
  type: string;
  popularity: number;
  /** Latent preference per atmosphere, -0.3..1. */
  pref: Record<DimensionId, number>;
}

export interface WorldOptions {
  seed: number;
  cities: { name: string; venues: number }[];
  lexiconRate?: number;
  misleadRate?: number;
  untaggedRate?: number;
}

const ADJ = ["Quiet", "Golden", "Little", "Copper", "North", "Old", "Blue", "Wild", "Silver", "Hidden", "Green", "Iron", "Paper", "Velvet", "Lucky", "Sunny"];
const NOUN = ["Fox", "Lantern", "Table", "Harbor", "Room", "Garden", "Hall", "Kitchen", "Parlor", "Yard", "House", "Studio", "Bar", "Cellar", "Terrace", "Market"];

export class SyntheticWorld implements Transport {
  readonly mode = "fixture" as const;
  readonly venues: Venue[] = [];
  readonly loves: Love[] = [];
  calls = 0;
  /** Failure injection for reliability scenarios. */
  failure: { kind: "none" | "insights_down" | "search_down" | "rate_limited_once" | "flaky"; remaining?: number } = { kind: "none" };
  private readonly r: () => number;

  constructor(readonly opts: WorldOptions) {
    this.r = rng(opts.seed);
    const lexRate = opts.lexiconRate ?? 0.7;
    const mislead = opts.misleadRate ?? 0.1;
    const untagged = opts.untaggedRate ?? 0.15;
    let n = 0;
    for (const city of opts.cities) {
      for (let i = 0; i < city.venues; i++) {
        const dims: DimensionId[] = [];
        const k = this.r() < 0.2 ? 0 : this.r() < 0.6 ? 1 : 2;
        while (dims.length < k) {
          const d = DIM_IDS[Math.floor(this.r() * DIM_IDS.length)];
          if (!dims.includes(d) && !dims.includes(OPPOSITE[d])) dims.push(d);
        }
        const words: string[] = [];
        if (this.r() >= untagged) {
          for (const d of dims) {
            const def = DIMENSIONS.find((x) => x.id === d)!;
            words.push(this.r() < lexRate ? def.venueTerms[Math.floor(this.r() * def.venueTerms.length)] : OFF_LEXICON[d][Math.floor(this.r() * OFF_LEXICON[d].length)]);
          }
          if (this.r() < mislead) {
            const wrong = DIMENSIONS[Math.floor(this.r() * DIMENSIONS.length)];
            words.push(wrong.venueTerms[Math.floor(this.r() * wrong.venueTerms.length)]);
          }
          words.push(["family-friendly", "good value", "reservations", "takeout"][Math.floor(this.r() * 4)]);
        }
        const name = `${ADJ[Math.floor(this.r() * ADJ.length)]} ${NOUN[Math.floor(this.r() * NOUN.length)]} ${++n}`;
        this.venues.push({
          id: `SYN-P-${n}`,
          name,
          city: city.name,
          dims,
          popularity: Math.round(this.r() * 1000) / 1000,
          tags: words.slice(0, 1).map((w) => ({ tag_id: `urn:tag:genre:place:${w.replace(/\W+/g, "_")}`, name: w, type: "urn:tag:genre:place" })),
          keywords: words.slice(1).map((w, j) => ({ name: w, count: 20 - j })),
        });
      }
    }
  }

  addLove(name: string, type: string, preferred: DimensionId[], popularity = 0.8): Love {
    const pref = Object.fromEntries(DIM_IDS.map((d) => [d, 0])) as Record<DimensionId, number>;
    for (const d of preferred) pref[d] = 1;
    for (const d of preferred) if (pref[OPPOSITE[d]] === 0) pref[OPPOSITE[d]] = -0.3;
    const love: Love = { id: `SYN-L-${this.loves.length + 1}`, name, type, popularity, pref };
    this.loves.push(love);
    return love;
  }

  /** Mean latent preference of a set of loves: the synthetic client's ground truth. */
  truth(loveIds: string[]): Record<DimensionId, number> {
    const ls = loveIds.map((id) => this.loves.find((l) => l.id === id)!).filter(Boolean);
    return Object.fromEntries(DIM_IDS.map((d) => [d, ls.length ? ls.reduce((a, l) => a + l.pref[d], 0) / ls.length : 0])) as Record<DimensionId, number>;
  }

  private venueAffinity(v: Venue, signals: Love[], noise: () => number): number {
    if (!signals.length) return v.popularity;
    const fit = v.dims.length ? signals.reduce((a, s) => a + v.dims.reduce((b, d) => b + s.pref[d], 0) / v.dims.length, 0) / signals.length : 0;
    return 0.7 * fit + 0.2 * v.popularity + 0.25 * (noise() - 0.5);
  }

  async get(path: string, params: Params): Promise<RawResponse> {
    this.calls++;
    const f = this.failure;
    if (f.kind === "rate_limited_once" && (f.remaining ?? 1) > 0) {
      f.remaining = (f.remaining ?? 1) - 1;
      return { status: 429, body: { message: "rate limited" }, retryAfterMs: 50 };
    }
    if (f.kind === "flaky" && this.calls % 3 === 0) return { status: 503, body: { message: "flaky" } };
    if (f.kind === "search_down" && path === "/search") return { status: 503, body: { message: "down" } };
    if (f.kind === "insights_down" && path === "/v2/insights") return { status: 503, body: { message: "down" } };

    const list = (k: string) => {
      const v = params[k];
      return v === undefined ? [] : (Array.isArray(v) ? v : String(v).split(",")).filter(Boolean);
    };
    if (path === "/search") {
      const q = String(params.query ?? "").toLowerCase().trim();
      const types = list("types");
      const hits = this.loves.filter((l) => q && (l.name.toLowerCase().includes(q) || q.includes(l.name.toLowerCase())) && (!types.length || types.includes(l.type)));
      return { status: 200, body: { results: hits.slice(0, Number(params.take ?? 5)).map((l) => ({ entity_id: l.id, name: l.name, types: [l.type], popularity: l.popularity })) } };
    }
    if (path === "/v2/insights") {
      const type = params["filter.type"];
      if (!type) return { status: 400, body: { success: false, errors: ["filter.type is required"] } };
      const signals = list("signal.interests.entities").map((id) => this.loves.find((l) => l.id === id)).filter((l): l is Love => Boolean(l));
      const take = Math.min(20, Number(params.take ?? 20));
      const page = Math.max(1, Number(params.page ?? 1));
      if (type === "urn:tag") {
        const scores = DIM_IDS.map((d) => ({ d, s: signals.reduce((a, l) => a + l.pref[d], 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
        const tags = scores.slice(0, 4).flatMap(({ d, s }) => DIMENSIONS.find((x) => x.id === d)!.moodTerms.slice(0, 2).map((t) => ({ id: `urn:tag:keyword:${t}`, name: t, query: { affinity: Math.min(1, s / Math.max(1, signals.length)) } })));
        return { status: 200, body: { success: true, results: { tags: tags.slice(0, take) } } };
      }
      if (type !== "urn:entity:place") return { status: 200, body: { success: true, results: { entities: [] } } };
      const city = String(params["filter.location.query"] ?? params["signal.location.query"] ?? "");
      const hard = Boolean(params["filter.location.query"]);
      const pool = this.venues.filter((v) => !hard || v.city.toLowerCase() === city.toLowerCase());
      // Deterministic per-query noise so pages are consistent.
      const seed = [...JSON.stringify([signals.map((s) => s.id), city])].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, this.opts.seed);
      const noise = rng(seed);
      const ranked = pool
        .map((v) => ({ v, a: this.venueAffinity(v, signals, noise) + (!hard && city && v.city.toLowerCase() === city.toLowerCase() ? 0.15 : 0) }))
        .sort((x, y) => y.a - x.a);
      const slice = ranked.slice((page - 1) * take, page * take);
      return {
        status: 200,
        body: {
          success: true,
          results: {
            entities: slice.map(({ v, a }) => ({
              entity_id: v.id,
              name: v.name,
              types: ["urn:entity:place"],
              popularity: v.popularity,
              tags: v.tags,
              properties: { keywords: v.keywords, geocode: { city: v.city } },
              ...(signals.length ? { query: { affinity: Math.round(a * 1000) / 1000 } } : {}),
            })),
          },
        },
      };
    }
    return { status: 404, body: { message: `unsupported path ${path}` } };
  }
}
