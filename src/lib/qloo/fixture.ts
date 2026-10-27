// SYNTHETIC fixture transport — NOT Qloo data.
//
// Used by the test suite and for UI work without a key (QLOO_MODE=fixture).
// Venues are fictional, ids start with "FIX-", affinities are computed from a
// hand-written style table. The UI shows a "simulated data" banner whenever a
// brief was produced from this transport. Never use it for a public demo.

import type { Params, Transport } from "./client";
import type { DimensionId } from "../types";

interface FixtureLove {
  id: string;
  name: string;
  type: string;
  popularity: number;
  prefers: DimensionId[];
}

const LOVES: FixtureLove[] = [
  { id: "FIX-L-khruangbin", name: "Khruangbin", type: "urn:entity:artist", popularity: 0.93, prefers: ["vintage_character", "low_glow", "natural_organic"] },
  { id: "FIX-L-thebear", name: "The Bear", type: "urn:entity:tv_show", popularity: 0.95, prefers: ["vintage_character", "energetic_social", "industrial_raw"] },
  { id: "FIX-L-thebear-film", name: "The Bear", type: "urn:entity:movie", popularity: 0.41, prefers: ["natural_organic"] },
  { id: "FIX-L-wesanderson", name: "Wes Anderson", type: "urn:entity:person", popularity: 0.94, prefers: ["vintage_character", "refined_luxe"] },
  { id: "FIX-L-acehotel", name: "Ace Hotel", type: "urn:entity:place", popularity: 0.82, prefers: ["vintage_character", "low_glow", "energetic_social"] },
  { id: "FIX-L-aesop", name: "Aesop", type: "urn:entity:brand", popularity: 0.86, prefers: ["natural_organic", "clean_minimal", "low_glow"] },
  { id: "FIX-L-fredagain", name: "Fred again..", type: "urn:entity:artist", popularity: 0.92, prefers: ["clean_minimal", "energetic_social", "bright_airy"] },
  { id: "FIX-L-severance", name: "Severance", type: "urn:entity:tv_show", popularity: 0.94, prefers: ["clean_minimal", "calm_quiet"] },
  { id: "FIX-L-muji", name: "MUJI", type: "urn:entity:brand", popularity: 0.88, prefers: ["clean_minimal", "natural_organic", "bright_airy", "calm_quiet"] },
  { id: "FIX-L-kinfolk", name: "Kinfolk", type: "urn:entity:brand", popularity: 0.7, prefers: ["natural_organic", "bright_airy", "calm_quiet"] },
  { id: "FIX-L-norah", name: "Norah Jones", type: "urn:entity:artist", popularity: 0.9, prefers: ["low_glow", "calm_quiet", "vintage_character"] },
];

const VENUE_STYLES: { name: string; dims: DimensionId[]; tags: string[]; keywords: string[]; popularity: number }[] = [
  { name: "Ember Room", dims: ["low_glow", "vintage_character"], tags: ["Cocktail Bar"], keywords: ["dimly lit", "art deco", "intimate"], popularity: 0.62 },
  { name: "Velvet Ledger", dims: ["low_glow", "refined_luxe"], tags: ["Wine Bar"], keywords: ["candlelit", "elegant"], popularity: 0.55 },
  { name: "Saint Olive", dims: ["low_glow", "natural_organic"], tags: ["Wine Bar"], keywords: ["natural wine", "cozy"], popularity: 0.48 },
  { name: "The Lantern Club", dims: ["low_glow", "vintage_character", "energetic_social"], tags: ["Jazz Club"], keywords: ["live music", "historic"], popularity: 0.66 },
  { name: "Copper Hour", dims: ["low_glow"], tags: ["Lounge"], keywords: ["moody", "date night"], popularity: 0.51 },
  { name: "Marigold Diner", dims: ["vintage_character", "energetic_social"], tags: ["Diner"], keywords: ["retro", "old-school", "late night"], popularity: 0.71 },
  { name: "Grainhouse Records", dims: ["vintage_character", "calm_quiet"], tags: ["Record Store"], keywords: ["vintage", "quiet"], popularity: 0.39 },
  { name: "Holloway Tavern", dims: ["vintage_character", "low_glow"], tags: ["Pub"], keywords: ["since 1924", "cozy"], popularity: 0.6 },
  { name: "Foundry Taproom", dims: ["industrial_raw", "energetic_social"], tags: ["Brewery"], keywords: ["warehouse", "lively"], popularity: 0.69 },
  { name: "Rivet Hall", dims: ["industrial_raw"], tags: ["Food Hall"], keywords: ["exposed brick", "converted"], popularity: 0.74 },
  { name: "Steel & Rye", dims: ["industrial_raw", "low_glow"], tags: ["Distillery"], keywords: ["industrial", "dim"], popularity: 0.45 },
  { name: "Kiln Studio Café", dims: ["clean_minimal", "bright_airy"], tags: ["Specialty Coffee"], keywords: ["minimalist", "natural light"], popularity: 0.58 },
  { name: "Plane Tree Omakase", dims: ["clean_minimal", "refined_luxe", "calm_quiet"], tags: ["Japanese Restaurant"], keywords: ["omakase", "serene"], popularity: 0.5 },
  { name: "White Arc Gallery", dims: ["clean_minimal", "calm_quiet"], tags: ["Art Gallery"], keywords: ["contemporary", "quiet"], popularity: 0.43 },
  { name: "Nord Bakery", dims: ["bright_airy", "clean_minimal", "natural_organic"], tags: ["Bakery"], keywords: ["scandinavian", "airy"], popularity: 0.64 },
  { name: "Sunroom Kitchen", dims: ["bright_airy", "natural_organic"], tags: ["Brunch"], keywords: ["sunny", "farm-to-table"], popularity: 0.77 },
  { name: "Glasshouse Terrace", dims: ["bright_airy", "energetic_social"], tags: ["Rooftop Bar"], keywords: ["rooftop", "lively"], popularity: 0.81 },
  { name: "Fern & Field", dims: ["natural_organic", "calm_quiet"], tags: ["Vegetarian Restaurant"], keywords: ["plants", "seasonal", "peaceful"], popularity: 0.47 },
  { name: "Greenhouse Tea Room", dims: ["natural_organic", "calm_quiet", "bright_airy"], tags: ["Tea House"], keywords: ["botanical", "tranquil"], popularity: 0.42 },
  { name: "Juniper Spa", dims: ["calm_quiet", "refined_luxe"], tags: ["Spa"], keywords: ["serene", "luxury"], popularity: 0.53 },
  { name: "Pages & Pour", dims: ["calm_quiet", "vintage_character"], tags: ["Bookstore"], keywords: ["reading", "classic"], popularity: 0.44 },
  { name: "The Gilded Fork", dims: ["refined_luxe"], tags: ["Fine Dining"], keywords: ["tasting menu", "white tablecloth"], popularity: 0.67 },
  { name: "Marlowe Hotel Bar", dims: ["refined_luxe", "low_glow"], tags: ["Hotel Bar"], keywords: ["sophisticated", "intimate"], popularity: 0.62 },
  { name: "Prime Cut", dims: ["refined_luxe", "vintage_character"], tags: ["Steakhouse"], keywords: ["classic", "upscale"], popularity: 0.79 },
  { name: "Pulse", dims: ["energetic_social"], tags: ["Nightclub"], keywords: ["dance", "dj"], popularity: 0.8 },
  { name: "Scoreboard", dims: ["energetic_social"], tags: ["Sports Bar"], keywords: ["loud", "busy"], popularity: 0.86 },
  { name: "Lucky Karaoke", dims: ["energetic_social"], tags: ["Karaoke"], keywords: ["party"], popularity: 0.72 },
  { name: "Chain Burger Co.", dims: [], tags: ["Fast Food"], keywords: ["quick"], popularity: 0.95 },
  { name: "Mega Mall Food Court", dims: [], tags: ["Food Court"], keywords: ["convenient"], popularity: 0.93 },
  { name: "Harbor Seafood", dims: ["bright_airy"], tags: ["Seafood Restaurant"], keywords: ["waterfront"], popularity: 0.84 },
  { name: "Lakeview Grill", dims: ["bright_airy", "energetic_social"], tags: ["American Restaurant"], keywords: ["patio", "busy"], popularity: 0.88 },
  { name: "Atlas Coworking Café", dims: ["clean_minimal"], tags: ["Cafe"], keywords: ["modern"], popularity: 0.57 },
  { name: "Brick & Mortar Pizza", dims: ["industrial_raw", "energetic_social"], tags: ["Pizza"], keywords: ["wood-fired", "loud"], popularity: 0.82 },
  { name: "Olde Towne Pub", dims: ["vintage_character", "energetic_social"], tags: ["Pub"], keywords: ["historic", "sports bar"], popularity: 0.76 },
  { name: "Quiet Hours Cafe", dims: ["calm_quiet", "natural_organic"], tags: ["Cafe"], keywords: ["quiet", "plants"], popularity: 0.46 },
  { name: "Neon Arcade Bar", dims: ["energetic_social", "vintage_character"], tags: ["Bar"], keywords: ["retro", "lively"], popularity: 0.65 },
];

const MOOD_TAGS: Record<DimensionId, string[]> = {
  low_glow: ["moody", "atmospheric"],
  bright_airy: ["upbeat", "sunny"],
  clean_minimal: ["minimalist", "electronic"],
  vintage_character: ["nostalgic", "soul", "psychedelic"],
  industrial_raw: ["gritty"],
  natural_organic: ["earthy", "acoustic"],
  refined_luxe: ["elegant"],
  energetic_social: ["party", "high energy"],
  calm_quiet: ["mellow", "contemplative"],
};

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function venueEntity(v: (typeof VENUE_STYLES)[number], affinity?: number) {
  return {
    entity_id: `FIX-P-${slug(v.name)}`,
    name: v.name,
    type: "urn:entity:place",
    types: ["urn:entity:place"],
    popularity: v.popularity,
    tags: v.tags.map((t) => ({ tag_id: `urn:tag:genre:place:${slug(t)}`, name: t, type: "urn:tag:genre:place" })),
    properties: { keywords: v.keywords.map((k, i) => ({ name: k, count: 20 - i })) },
    ...(affinity !== undefined ? { query: { affinity } } : {}),
  };
}

function listParam(p: Params, key: string): string[] {
  const v = p[key];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : String(v).split(",")).filter(Boolean);
}

export class FixtureTransport implements Transport {
  readonly mode = "fixture" as const;
  readonly log: { path: string; params: Params }[] = [];

  async get(path: string, params: Params) {
    this.log.push({ path, params });
    if (path === "/search") {
      const q = String(params.query ?? "").toLowerCase();
      const types = listParam(params, "types");
      const hits = LOVES.filter((l) => q && l.name.toLowerCase().includes(q) && (!types.length || types.includes(l.type)));
      return {
        status: 200,
        body: { results: hits.slice(0, Number(params.take ?? 5)).map((l) => ({ entity_id: l.id, name: l.name, types: [l.type], popularity: l.popularity, tags: [] })) },
      };
    }
    if (path === "/v2/insights") {
      const type = params["filter.type"];
      if (!type) return { status: 400, body: { success: false, errors: ["filter.type is required"] } };
      const signals = listParam(params, "signal.interests.entities")
        .map((id) => LOVES.find((l) => l.id === id))
        .filter((l): l is FixtureLove => Boolean(l));
      const take = Number(params.take ?? 20);
      if (type === "urn:tag") {
        const counts = new Map<string, number>();
        for (const s of signals) for (const d of s.prefers) for (const t of MOOD_TAGS[d]) counts.set(t, (counts.get(t) ?? 0) + 1);
        const tags = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, take)
          .map(([name, c]) => ({ id: `urn:tag:keyword:${slug(name)}`, name, type: "urn:tag:keyword", query: { affinity: Math.min(1, c / Math.max(1, signals.length)) } }));
        return { status: 200, body: { success: true, results: { tags } } };
      }
      if (type !== "urn:entity:place") return { status: 200, body: { success: true, results: { entities: [] } } };
      const ranked = VENUE_STYLES.map((v) => {
        if (!signals.length) return { v, a: v.popularity };
        const fit = signals.reduce((acc, s) => acc + v.dims.filter((d) => s.prefers.includes(d)).length / Math.max(1, v.dims.length), 0) / signals.length;
        return { v, a: Math.round((0.75 * fit + 0.25 * v.popularity) * 1000) / 1000 };
      }).sort((x, y) => y.a - x.a);
      // Real Qloo returns the top `take` of thousands of places; this world has
      // ~36, so cap at half of it to keep the taste-matched and popularity-ordered
      // sets meaningfully different, as they are in live data.
      const cap = Math.min(take, Math.ceil(VENUE_STYLES.length / 2));
      return {
        status: 200,
        body: { success: true, results: { entities: ranked.slice(0, cap).map(({ v, a }) => venueEntity(v, signals.length ? a : undefined)) } },
      };
    }
    return { status: 404, body: { message: `unsupported path ${path}` } };
  }
}
