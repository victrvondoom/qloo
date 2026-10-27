// The atmosphere vocabulary. A venue "carries" a dimension when one of its Qloo
// tags, category tags or review keywords matches a term below. The same lexicon
// reads cross-domain taste tags (music, film, books) through `moodTerms`.
//
// The lexicon is deliberately plain and inspectable: judges and pros can read
// exactly why a venue counted, and the Method page prints this table.

import type { DimensionId } from "./types";

export interface DimensionDef {
  id: DimensionId;
  label: string;
  short: string;
  /** The dimension whose opposite reading a clarifying question contrasts with. */
  opposite: DimensionId;
  venueTerms: string[];
  moodTerms: string[];
}

export const DIMENSIONS: DimensionDef[] = [
  {
    id: "low_glow",
    label: "Low, intimate light",
    short: "Low glow",
    opposite: "bright_airy",
    venueTerms: [
      "dimly lit", "dim", "candlelit", "candle", "intimate", "romantic", "speakeasy", "cocktail bar",
      "cocktail lounge", "wine bar", "lounge", "jazz club", "jazz bar", "dive bar", "moody", "dark",
      "cozy", "cosy", "date night", "hidden bar", "piano bar", "whiskey bar", "listening bar",
    ],
    moodTerms: ["moody", "atmospheric", "melancholic", "melancholy", "dreamy", "noir", "sultry", "intimate", "late night", "nocturnal", "romantic"],
  },
  {
    id: "bright_airy",
    label: "Bright, airy daylight",
    short: "Bright & airy",
    opposite: "low_glow",
    venueTerms: [
      "bright", "airy", "sunny", "sunlit", "natural light", "light-filled", "rooftop", "patio",
      "outdoor seating", "terrace", "brunch", "bakery", "juice bar", "smoothie", "breakfast",
      "beach", "waterfront", "spacious", "open space", "big windows",
    ],
    moodTerms: ["sunny", "upbeat", "cheerful", "breezy", "summer", "feel-good", "optimistic", "bright", "uplifting"],
  },
  {
    id: "clean_minimal",
    label: "Clean, minimal, contemporary",
    short: "Clean & minimal",
    opposite: "vintage_character",
    venueTerms: [
      "minimalist", "minimal", "modern", "contemporary", "sleek", "design", "omakase", "nordic",
      "scandinavian", "gallery", "concept store", "japanese", "clean", "architectural", "specialty coffee",
    ],
    moodTerms: ["minimalist", "minimal", "ambient", "electronic", "futuristic", "sleek", "modern", "experimental", "cerebral"],
  },
  {
    id: "vintage_character",
    label: "Vintage, characterful, lived-in",
    short: "Vintage character",
    opposite: "clean_minimal",
    venueTerms: [
      "vintage", "retro", "classic", "historic", "old-school", "old school", "heritage", "antique",
      "diner", "tavern", "pub", "record store", "art deco", "mid-century", "landmark", "since 19",
      "family-owned", "old fashioned", "institution", "thrift",
    ],
    moodTerms: ["nostalgic", "retro", "vintage", "classic", "soul", "funk", "psychedelic", "70s", "60s", "folk", "americana", "period piece", "throwback"],
  },
  {
    id: "industrial_raw",
    label: "Industrial, raw, urban",
    short: "Industrial",
    opposite: "refined_luxe",
    venueTerms: [
      "industrial", "warehouse", "brewery", "taproom", "loft", "exposed brick", "beer hall",
      "food hall", "distillery", "brewpub", "converted", "factory", "garage", "street food",
    ],
    moodTerms: ["gritty", "punk", "garage", "urban", "raw", "grunge", "post-punk", "hip hop", "underground"],
  },
  {
    id: "natural_organic",
    label: "Natural, organic, earthy",
    short: "Natural & earthy",
    opposite: "industrial_raw",
    venueTerms: [
      "garden", "plant", "plants", "farm-to-table", "farm to table", "organic", "vegan", "vegetarian",
      "natural wine", "botanical", "rustic", "greenhouse", "seasonal", "wood-fired", "park", "nature",
      "farmers market", "local ingredients",
    ],
    moodTerms: ["earthy", "pastoral", "nature", "acoustic", "organic", "folk", "botanical", "rustic", "wholesome", "meditative"],
  },
  {
    id: "refined_luxe",
    label: "Refined, polished, luxe",
    short: "Refined & luxe",
    opposite: "industrial_raw",
    venueTerms: [
      "upscale", "fine dining", "elegant", "luxury", "luxurious", "michelin", "tasting menu",
      "hotel bar", "steakhouse", "champagne", "chic", "sophisticated", "white tablecloth", "glamorous",
      "five star", "high-end", "dress code", "sommelier",
    ],
    moodTerms: ["elegant", "sophisticated", "glamorous", "luxury", "opulent", "classical", "orchestral", "refined", "lush"],
  },
  {
    id: "energetic_social",
    label: "Energetic, social, loud",
    short: "Energetic",
    opposite: "calm_quiet",
    venueTerms: [
      "lively", "loud", "live music", "dance", "dancing", "nightclub", "club", "karaoke", "sports bar",
      "trendy", "hip", "busy", "late night", "party", "dj", "happy hour", "beer garden", "crowded", "vibrant",
    ],
    moodTerms: ["energetic", "party", "dance", "upbeat", "high energy", "anthemic", "festive", "rowdy", "fun"],
  },
  {
    id: "calm_quiet",
    label: "Calm, quiet, restorative",
    short: "Calm & quiet",
    opposite: "energetic_social",
    venueTerms: [
      "quiet", "calm", "peaceful", "tea house", "tea room", "bookstore", "library", "museum", "spa",
      "relaxing", "serene", "tranquil", "laid-back", "laid back", "zen", "study", "reading",
    ],
    moodTerms: ["calm", "chill", "mellow", "soothing", "contemplative", "slow", "quiet", "relaxing", "serene", "gentle", "introspective"],
  },
];

export const DIMENSION_BY_ID = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d])) as Record<DimensionId, DimensionDef>;

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[_:/]+/g, " ").replace(/[^a-z0-9\s'-]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Whole-word / whole-phrase match, so "dim" does not match "dimsum" and "club" not "clubhouse". */
export function termMatches(text: string, term: string): boolean {
  return normalise(text).includes(normalise(term));
}

export function matchVenueText(text: string): { dimension: DimensionId; term: string }[] {
  const hits: { dimension: DimensionId; term: string }[] = [];
  for (const d of DIMENSIONS) {
    const term = d.venueTerms.find((t) => termMatches(text, t));
    if (term) hits.push({ dimension: d.id, term });
  }
  return hits;
}

export function matchMoodText(text: string): DimensionId[] {
  return DIMENSIONS.filter((d) => d.moodTerms.some((t) => termMatches(text, t))).map((d) => d.id);
}
