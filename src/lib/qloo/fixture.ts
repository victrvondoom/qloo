// SYNTHETIC fixture transport — NOT Qloo data.
//
// Used by the test suite and for offline demos (QLOO_MODE=fixture). Places are
// fictional, ids start with "FIX-", and every taste association below is
// invented for testing. The UI labels any brief produced from this transport
// FIXTURE · synthetic. Never present it as Qloo data.
//
// The world: 36 hand-written places in Chicago plus ~160 generated ones across
// five cities, each with 0–2 atmospheres expressed through tags and keywords,
// and a popularity in 0..1. Like the real API, a query returns only the top
// slice of a much larger pool, honours filter.location.query (hard) and
// signal.location.query (soft), and filter.popularity.max.

import type { Params, RawResponse, Transport } from "./client";
import { DIMENSIONS } from "../dimensions";
import type { DimensionId } from "../types";

interface FixtureLove {
  id: string;
  name: string;
  type: string;
  popularity: number;
  prefers: DimensionId[];
}

const love = (key: string, name: string, type: string, popularity: number, prefers: DimensionId[]): FixtureLove => ({ id: `FIX-L-${key}`, name, type: `urn:entity:${type}`, popularity, prefers });

const LOVES: FixtureLove[] = [
  love("khruangbin", "Khruangbin", "artist", 0.93, ["vintage_character", "low_glow", "natural_organic"]),
  love("thebear", "The Bear", "tv_show", 0.95, ["vintage_character", "energetic_social", "industrial_raw"]),
  love("thebear-film", "The Bear", "movie", 0.41, ["natural_organic"]),
  love("wesanderson", "Wes Anderson", "person", 0.94, ["vintage_character", "refined_luxe"]),
  love("acehotel", "Ace Hotel", "place", 0.82, ["vintage_character", "low_glow", "energetic_social"]),
  love("aesop", "Aesop", "brand", 0.86, ["natural_organic", "clean_minimal", "low_glow"]),
  love("fredagain", "Fred again..", "artist", 0.92, ["clean_minimal", "energetic_social", "bright_airy"]),
  love("severance", "Severance", "tv_show", 0.94, ["clean_minimal", "calm_quiet"]),
  love("muji", "MUJI", "brand", 0.88, ["clean_minimal", "natural_organic", "bright_airy", "calm_quiet"]),
  love("kinfolk", "Kinfolk", "brand", 0.7, ["natural_organic", "bright_airy", "calm_quiet"]),
  love("norah", "Norah Jones", "artist", 0.9, ["low_glow", "calm_quiet", "vintage_character"]),
  love("bluebottle", "Blue Bottle Coffee", "brand", 0.84, ["clean_minimal", "bright_airy"]),
  love("kendrick", "Kendrick Lamar", "artist", 0.97, ["energetic_social", "industrial_raw"]),
  love("boniver", "Bon Iver", "artist", 0.88, ["natural_organic", "calm_quiet", "low_glow"]),
  love("radiohead", "Radiohead", "artist", 0.93, ["low_glow", "clean_minimal"]),
  love("fleetwoodmac", "Fleetwood Mac", "artist", 0.95, ["vintage_character", "bright_airy"]),
  love("daftpunk", "Daft Punk", "artist", 0.94, ["energetic_social", "clean_minimal"]),
  love("ghibli", "Studio Ghibli", "brand", 0.95, ["natural_organic", "vintage_character", "calm_quiet"]),
  love("sofiacoppola", "Sofia Coppola", "person", 0.86, ["refined_luxe", "calm_quiet", "bright_airy"]),
  love("wongkarwai", "Wong Kar-wai", "person", 0.84, ["low_glow", "vintage_character", "refined_luxe"]),
  love("whitelotus", "The White Lotus", "tv_show", 0.93, ["refined_luxe", "bright_airy"]),
  love("succession", "Succession", "tv_show", 0.95, ["refined_luxe", "clean_minimal"]),
  love("chefstable", "Chef's Table", "tv_show", 0.85, ["refined_luxe", "natural_organic"]),
  love("bourdain", "Anthony Bourdain", "person", 0.9, ["vintage_character", "industrial_raw", "energetic_social"]),
  love("lelabo", "Le Labo", "brand", 0.8, ["industrial_raw", "natural_organic", "clean_minimal"]),
  love("sohohouse", "Soho House", "place", 0.83, ["refined_luxe", "vintage_character", "low_glow"]),
  love("ottolenghi", "Ottolenghi", "person", 0.82, ["natural_organic", "bright_airy", "energetic_social"]),
  love("buenavista", "Buena Vista Social Club", "artist", 0.86, ["vintage_character", "energetic_social", "low_glow"]),
  love("badbunny", "Bad Bunny", "artist", 0.97, ["energetic_social", "bright_airy"]),
  love("fridakahlo", "Frida Kahlo", "person", 0.9, ["vintage_character", "natural_organic", "energetic_social"]),
  love("patagonia", "Patagonia", "brand", 0.9, ["natural_organic", "industrial_raw"]),
];

interface Venue {
  name: string;
  city: string;
  dims: DimensionId[];
  tags: string[];
  keywords: string[];
  popularity: number;
}

const HANDWRITTEN: Omit<Venue, "city">[] = [
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

const NAME_PARTS: Record<DimensionId, [string[], string[]]> = {
  low_glow: [["Ember", "Lantern", "Amber", "Candle", "Dusk", "Midnight", "Sable", "Umber"], ["Room", "Lounge", "Parlour", "Den", "Bar"]],
  bright_airy: [["Skylight", "Morning", "Linen", "Daylight", "Meadow", "Saltwater", "Clearwater", "Sunday"], ["Café", "Kitchen", "Bakery", "Deck", "House"]],
  clean_minimal: [["Plane", "Line", "Arc", "Grid", "Form", "Field", "Mono", "Axis"], ["Studio", "Counter", "Gallery", "Bar", "Coffee"]],
  vintage_character: [["Holloway", "Pembroke", "Winslow", "Hatch", "Crown", "Old Fox", "Marigold", "Bellwether"], ["Tavern", "Diner", "Records", "Hall", "Pub"]],
  industrial_raw: [["Rivet", "Forge", "Mill", "Dock", "Gauge", "Anvil", "Boiler", "Freight"], ["Taproom", "Works", "Yard", "Brewing", "Hall"]],
  natural_organic: [["Fern", "Juniper", "Clover", "Sorrel", "Moss", "Thyme", "Birch", "Sage"], ["Table", "Kitchen", "Garden", "Café", "House"]],
  refined_luxe: [["Gilded", "Astor", "Belvedere", "Sterling", "Regent", "Ivory", "Laurent", "Marlowe"], ["Bar", "Room", "Club", "Salon", "Grill"]],
  energetic_social: [["Neon", "Riot", "Disco", "Hi-Fi", "Boom", "Velour", "Lucky", "Fever"], ["Club", "Social", "Hall", "Karaoke", "Bar"]],
  calm_quiet: [["Hush", "Haven", "Slow", "Pause", "Tide", "Still", "Lull", "Quietude"], ["Tea Room", "Books", "Spa", "Reading Room", "Café"]],
};

const CITIES: [string, number][] = [
  ["Chicago", 24],
  ["Austin", 34],
  ["London", 34],
  ["Brooklyn", 34],
  ["Los Angeles", 34],
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateWorld(): Venue[] {
  const r = rng(20261028);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const venues: Venue[] = HANDWRITTEN.map((v) => ({ ...v, city: "Chicago" }));
  const used = new Set(venues.map((v) => v.name));
  for (const [city, n] of CITIES) {
    for (let i = 0; i < n; i++) {
      const first = pick(DIMENSIONS).id;
      const dims: DimensionId[] = [first];
      if (r() < 0.55) {
        const second = pick(DIMENSIONS.filter((d) => d.id !== first && d.id !== DIMENSIONS.find((x) => x.id === first)!.opposite)).id;
        dims.push(second);
      }
      const [adj, noun] = NAME_PARTS[first];
      let name = `${pick(adj)} ${pick(noun)}`;
      for (let k = 2; used.has(name); k++) name = `${pick(adj)} ${pick(noun)}${k > 4 ? ` ${k}` : ""}`;
      used.add(name);
      const terms = dims.map((d) => pick(DIMENSIONS.find((x) => x.id === d)!.venueTerms));
      venues.push({
        name,
        city,
        dims,
        tags: [NAME_PARTS[first][1].includes(name.split(" ").at(-1)!) ? name.split(" ").at(-1)! : "Restaurant"],
        keywords: [...terms, pick(["reservations", "good value", "walk-ins", "takeout"])],
        popularity: Math.round((0.15 + r() * 0.8) * 100) / 100,
      });
    }
  }
  return venues;
}

const WORLD = generateWorld();

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

function venueEntity(v: Venue, affinity?: number) {
  return {
    entity_id: `FIX-P-${slug(`${v.name}-${v.city}`)}`,
    name: v.name,
    type: "urn:entity:place",
    types: ["urn:entity:place"],
    popularity: v.popularity,
    tags: v.tags.map((t) => ({ tag_id: `urn:tag:genre:place:${slug(t)}`, name: t, type: "urn:tag:genre:place" })),
    properties: { keywords: v.keywords.map((k, i) => ({ name: k, count: 20 - i })), geocode: { city: v.city } },
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

  async get(path: string, params: Params): Promise<RawResponse> {
    this.log.push({ path, params });
    if (path === "/search") {
      const q = String(params.query ?? "").toLowerCase().trim();
      const types = listParam(params, "types");
      const hits = LOVES.filter((l) => q.length > 1 && (l.name.toLowerCase().includes(q) || q.includes(l.name.toLowerCase())) && (!types.length || types.includes(l.type)));
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
      const take = Math.min(20, Number(params.take ?? 20));
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

      const hardCity = String(params["filter.location.query"] ?? "").toLowerCase();
      const softCity = String(params["signal.location.query"] ?? "").toLowerCase();
      const maxPop = params["filter.popularity.max"] !== undefined ? Number(params["filter.popularity.max"]) : undefined;
      const pool = WORLD.filter((v) => (!hardCity || v.city.toLowerCase() === hardCity) && (maxPop === undefined || v.popularity <= maxPop));
      const ranked = pool
        .map((v) => {
          const local = softCity && v.city.toLowerCase() === softCity ? 0.12 : 0;
          if (!signals.length) return { v, a: v.popularity + local };
          const fit = signals.reduce((acc, s) => acc + v.dims.filter((d) => s.prefers.includes(d)).length / Math.max(1, v.dims.length), 0) / signals.length;
          return { v, a: Math.round((0.75 * fit + 0.25 * v.popularity + local) * 1000) / 1000 };
        })
        .sort((x, y) => y.a - x.a || x.v.name.localeCompare(y.v.name));
      // Real Qloo returns the top slice of thousands of places; this world is
      // small, so return at most ~40% of the matching pool to keep taste-matched
      // and popularity-ordered sets meaningfully different, as they are live.
      const cap = Math.max(1, Math.min(40, Math.ceil(pool.length * 0.4)));
      const page = Math.max(1, Number(params.page ?? 1));
      const slice = ranked.slice(0, cap).slice((page - 1) * take, page * take);
      return {
        status: 200,
        body: { success: true, results: { entities: slice.map(({ v, a }) => venueEntity(v, signals.length ? a : undefined)) } },
      };
    }
    return { status: 404, body: { message: `unsupported path ${path}` } };
  }
}
