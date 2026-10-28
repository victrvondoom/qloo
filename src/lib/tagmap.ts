// Place terms the lexicon can't read ("omakase counter", "natural wine") mapped
// onto atmospheres by a model, cached in the database for 30 days so each term
// is asked about once across all briefs. Mapped matches are labelled "mapped"
// in the evidence and listed on the brief, so they can be audited or ignored,
// and they apply to taste-matched and baseline places alike.

import type { TagMapper } from "./agent";
import { DIMENSIONS } from "./dimensions";
import { llmAvailable, llmMapTerms, llmModel } from "./llm";
import { cache } from "./store";
import type { DimensionId } from "./types";

const NS = "tagmap/1";
const TTL_SECONDS = 30 * 86_400;
const MAX_TERMS = 80;
const VALID = new Set<string>(DIMENSIONS.map((d) => d.id));

export function makeTagMapper(ask: (terms: string[], signal?: AbortSignal) => Promise<Record<string, DimensionId[]>> = llmMapTerms, model = llmModel()): TagMapper {
  return async (terms, signal) => {
    const wanted = [...new Set(terms.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 2 && t.length <= 60))].slice(0, MAX_TERMS);
    const mapped: Record<string, DimensionId[]> = {};
    const unknown: string[] = [];
    for (const t of wanted) {
      const hit = await cache.get<DimensionId[]>(NS, t);
      if (hit === undefined) unknown.push(t);
      else if (hit.length) mapped[t] = hit;
    }
    if (unknown.length) {
      const out = await ask(unknown, signal);
      for (const t of unknown) {
        const dims = [...new Set((out[t] ?? []).filter((d) => VALID.has(d)))].slice(0, 2);
        // "Nothing to say about atmosphere" is cached too, so it isn't asked again.
        await cache.put(NS, t, dims, TTL_SECONDS);
        if (dims.length) mapped[t] = dims;
      }
    }
    return { model, mapped };
  };
}

/** The mapper a run uses: a model when a key is configured, otherwise none (lexicon only). */
export function defaultTagMapper(): TagMapper | undefined {
  return llmAvailable() ? makeTagMapper() : undefined;
}
