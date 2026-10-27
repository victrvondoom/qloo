// Client words → competing readings. Each vague word maps to several
// dimensions it can mean in a design consultation. The dictionary default is
// what a literal reading (and most chatbots) would pick. The taste evidence then
// weights the readings: weight ∝ exp(2 · score of that dimension).

import type { DecodedWord, DimensionId, DimensionScore, WordReading } from "./types";

interface LexReading {
  dimension: DimensionId;
  meaning: string;
  isDictionaryDefault?: boolean;
}

export const WORD_LEXICON: Record<string, LexReading[]> = {
  warm: [
    { dimension: "low_glow", meaning: "warm-coloured, low, amber light", isDictionaryDefault: true },
    { dimension: "natural_organic", meaning: "warm materials: wood, linen, clay" },
    { dimension: "vintage_character", meaning: "warm as in lived-in, with history" },
    { dimension: "energetic_social", meaning: "warm as in welcoming and sociable" },
  ],
  modern: [
    { dimension: "clean_minimal", meaning: "sleek, minimal, hidden light sources", isDictionaryDefault: true },
    { dimension: "industrial_raw", meaning: "modern as in urban loft" },
    { dimension: "refined_luxe", meaning: "modern as in boutique-hotel polish" },
  ],
  cozy: [
    { dimension: "low_glow", meaning: "small pools of low light", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "cluttered-in-a-good-way, collected" },
    { dimension: "natural_organic", meaning: "soft textiles and natural textures" },
    { dimension: "calm_quiet", meaning: "quiet, enclosed, restful" },
  ],
  clean: [
    { dimension: "clean_minimal", meaning: "minimal, uncluttered, concealed fixtures", isDictionaryDefault: true },
    { dimension: "bright_airy", meaning: "bright and fresh" },
    { dimension: "refined_luxe", meaning: "polished, hotel-like" },
  ],
  bright: [
    { dimension: "bright_airy", meaning: "high light levels, daylight feel", isDictionaryDefault: true },
    { dimension: "energetic_social", meaning: "bright as in lively and colourful" },
  ],
  moody: [
    { dimension: "low_glow", meaning: "dark, low, dramatic light", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "moody as in old-world, layered" },
    { dimension: "refined_luxe", meaning: "moody as in glamorous hotel bar" },
  ],
  minimal: [
    { dimension: "clean_minimal", meaning: "fewest possible visible fixtures", isDictionaryDefault: true },
    { dimension: "calm_quiet", meaning: "visually quiet, restful" },
    { dimension: "natural_organic", meaning: "few, natural materials" },
  ],
  luxurious: [
    { dimension: "refined_luxe", meaning: "polished metals, statement pieces", isDictionaryDefault: true },
    { dimension: "low_glow", meaning: "luxury as in candle-lit intimacy" },
    { dimension: "calm_quiet", meaning: "luxury as in spa-like calm" },
  ],
  natural: [
    { dimension: "natural_organic", meaning: "natural materials and plants", isDictionaryDefault: true },
    { dimension: "bright_airy", meaning: "natural as in daylight" },
    { dimension: "calm_quiet", meaning: "natural as in unfussy, calm" },
  ],
  fun: [
    { dimension: "energetic_social", meaning: "playful, colourful, social", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "fun as in kitsch and retro" },
    { dimension: "industrial_raw", meaning: "fun as in casual, beer-hall" },
  ],
  calm: [
    { dimension: "calm_quiet", meaning: "low contrast, glare-free, restful", isDictionaryDefault: true },
    { dimension: "low_glow", meaning: "calm as in dim and soft" },
    { dimension: "natural_organic", meaning: "calm as in natural and green" },
  ],
  relaxed: [
    { dimension: "calm_quiet", meaning: "unhurried and restful", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "relaxed as in worn-in, casual" },
    { dimension: "natural_organic", meaning: "relaxed as in beachy, natural" },
  ],
  industrial: [
    { dimension: "industrial_raw", meaning: "metal, exposed structure, track light", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "industrial as in vintage factory" },
  ],
  classic: [
    { dimension: "vintage_character", meaning: "traditional, period-appropriate", isDictionaryDefault: true },
    { dimension: "refined_luxe", meaning: "classic as in timeless elegance" },
  ],
  timeless: [
    { dimension: "refined_luxe", meaning: "understated quality that won't date", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "timeless as in classic, traditional" },
    { dimension: "clean_minimal", meaning: "timeless as in pared-back" },
  ],
  elegant: [
    { dimension: "refined_luxe", meaning: "polished and formal", isDictionaryDefault: true },
    { dimension: "clean_minimal", meaning: "elegant as in restrained" },
    { dimension: "low_glow", meaning: "elegant as in candle-lit dinner" },
  ],
  inviting: [
    { dimension: "low_glow", meaning: "soft, warm pools of light", isDictionaryDefault: true },
    { dimension: "energetic_social", meaning: "sociable, made for gathering" },
    { dimension: "bright_airy", meaning: "open and light" },
  ],
  airy: [
    { dimension: "bright_airy", meaning: "light, open, daylight", isDictionaryDefault: true },
    { dimension: "clean_minimal", meaning: "airy as in uncluttered" },
  ],
  eclectic: [
    { dimension: "vintage_character", meaning: "collected over time, mixed eras", isDictionaryDefault: true },
    { dimension: "energetic_social", meaning: "bold, colourful, maximal" },
    { dimension: "industrial_raw", meaning: "eclectic as in thrown-together loft" },
  ],
  bold: [
    { dimension: "energetic_social", meaning: "saturated colour, statement pieces", isDictionaryDefault: true },
    { dimension: "refined_luxe", meaning: "bold as in glamorous" },
    { dimension: "industrial_raw", meaning: "bold as in raw, graphic" },
  ],
  simple: [
    { dimension: "clean_minimal", meaning: "few elements, nothing fussy", isDictionaryDefault: true },
    { dimension: "natural_organic", meaning: "simple as in honest materials" },
    { dimension: "calm_quiet", meaning: "simple as in quiet" },
  ],
  rustic: [
    { dimension: "natural_organic", meaning: "rough wood, natural texture", isDictionaryDefault: true },
    { dimension: "vintage_character", meaning: "rustic as in farmhouse antique" },
  ],
  sexy: [
    { dimension: "low_glow", meaning: "dark, low, flattering light", isDictionaryDefault: true },
    { dimension: "refined_luxe", meaning: "glamorous, hotel-bar" },
  ],
  homey: [
    { dimension: "vintage_character", meaning: "collected, family pieces", isDictionaryDefault: true },
    { dimension: "low_glow", meaning: "lamps rather than downlights" },
    { dimension: "natural_organic", meaning: "soft natural textures" },
  ],
};

const ALIASES: Record<string, string> = {
  cosy: "cozy",
  contemporary: "modern",
  sleek: "modern",
  luxe: "luxurious",
  luxury: "luxurious",
  chill: "relaxed",
  laidback: "relaxed",
  "laid-back": "relaxed",
  organic: "natural",
  earthy: "natural",
  minimalist: "minimal",
  dramatic: "moody",
  dark: "moody",
  welcoming: "inviting",
  vintage: "classic",
  retro: "classic",
  traditional: "classic",
  light: "airy",
  fresh: "airy",
  playful: "fun",
  lively: "fun",
  peaceful: "calm",
  serene: "calm",
};

export function normaliseWord(raw: string): string {
  const w = raw.toLowerCase().trim().replace(/[^a-z-]/g, "");
  return ALIASES[w] ?? w;
}

export function lexiconFor(word: string): LexReading[] | undefined {
  return WORD_LEXICON[normaliseWord(word)];
}

export function decodeWord(
  word: string,
  dims: DimensionScore[],
  readingsOverride?: LexReading[],
  source: DecodedWord["source"] = "lexicon",
): DecodedWord {
  const lex = readingsOverride ?? lexiconFor(word);
  if (!lex || lex.length === 0) {
    return { word, known: false, readings: [], margin: 0, source: "unmapped" };
  }
  const scoreOf = (id: DimensionId) => dims.find((d) => d.id === id)?.score ?? 0;
  // Small prior toward the dictionary sense so zero evidence returns the literal reading.
  const raw = lex.map((r) => Math.exp(2 * scoreOf(r.dimension) + (r.isDictionaryDefault ? 0.15 : 0)));
  const total = raw.reduce((a, b) => a + b, 0);
  const readings: WordReading[] = lex
    .map((r, i) => ({
      dimension: r.dimension,
      meaning: r.meaning,
      weight: raw[i] / total,
      isDictionaryDefault: Boolean(r.isDictionaryDefault),
    }))
    .sort((a, b) => b.weight - a.weight);
  const margin = readings.length > 1 ? readings[0].weight - readings[1].weight : 1;
  return { word, known: true, readings, chosen: readings[0], margin, source };
}

export function literalReading(word: string): LexReading | undefined {
  const lex = lexiconFor(word);
  return lex?.find((r) => r.isDictionaryDefault) ?? lex?.[0];
}
