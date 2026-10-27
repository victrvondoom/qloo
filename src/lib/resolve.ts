// Turning "The Bear (show)" into a Qloo entity, carefully. A wrong match here is
// the most dangerous failure in any taste agent: everything downstream stays
// coherent and confident while describing someone else. So every resolution
// records its method, similarity and alternatives, low-similarity matches are
// not used as signals, and the pro can pin a different candidate.

import type { QlooClient } from "./qloo/client";
import type { QlooEntity, Resolution } from "./types";

const TYPE_HINTS: [RegExp, string][] = [
  [/\b(show|tv|series|sitcom)\b/, "urn:entity:tv_show"],
  [/\b(movie|film)\b/, "urn:entity:movie"],
  [/\b(band|artist|musician|singer|rapper|music|dj)\b/, "urn:entity:artist"],
  [/\b(book|novel)\b/, "urn:entity:book"],
  [/\b(restaurant|bar|cafe|café|hotel|place|venue|shop|store|bakery|club)\b/, "urn:entity:place"],
  [/\b(brand|label)\b/, "urn:entity:brand"],
  [/\b(podcast)\b/, "urn:entity:podcast"],
  [/\b(game|videogame|video game)\b/, "urn:entity:videogame"],
  [/\b(city|destination|town)\b/, "urn:entity:destination"],
  [/\b(author|director|actor|actress|person|designer|chef)\b/, "urn:entity:person"],
];

export function parseLove(raw: string): { query: string; typeHint?: string } {
  const m = raw.trim().match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { query: raw.trim() };
  const hint = m[2].toLowerCase();
  const type = TYPE_HINTS.find(([re]) => re.test(hint))?.[1];
  return { query: m[1].trim(), typeHint: type };
}

export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function similarity(a: string, b: string): number {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x.length && !y.length) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

function typeOf(e: QlooEntity): string {
  return e.type ?? e.types?.find((t) => t.startsWith("urn:entity:")) ?? "urn:entity:unknown";
}

function compact(e: QlooEntity) {
  return { entity_id: e.entity_id, name: e.name, type: typeOf(e), popularity: e.popularity };
}

/** Similarity below this is too weak to use as a taste signal at all. */
export const MIN_USABLE_SIMILARITY = 0.5;

export function chooseCandidate(
  input: string,
  candidates: QlooEntity[],
  opts: { typeHint?: string; pinnedId?: string } = {},
): Resolution {
  const { query } = parseLove(input);
  if (opts.pinnedId) {
    const pinned = candidates.find((c) => c.entity_id === opts.pinnedId);
    if (pinned) {
      return {
        input,
        status: "resolved",
        chosen: compact(pinned),
        alternatives: candidates.filter((c) => c !== pinned).slice(0, 4).map(compact),
        similarity: similarity(query, pinned.name),
        method: "pinned",
        note: "Chosen by the pro.",
      };
    }
  }
  if (candidates.length === 0) {
    return { input, status: "not_found", alternatives: [], similarity: 0, method: "top_result", note: "Qloo has no match; not used." };
  }
  const exact = candidates.filter((c) => normaliseName(c.name) === normaliseName(query));
  if (exact.length >= 1) {
    const ranked = [...exact].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const chosen = ranked[0];
    const otherTypes = new Set(ranked.slice(1).map(typeOf).filter((t) => t !== typeOf(chosen)));
    return {
      input,
      status: otherTypes.size > 0 ? "ambiguous" : "resolved",
      chosen: compact(chosen),
      alternatives: candidates.filter((c) => c !== chosen).slice(0, 4).map(compact),
      similarity: 1,
      method: opts.typeHint ? "type_hint" : "exact",
      note:
        otherTypes.size > 0
          ? `Same name exists as ${[...otherTypes].map((t) => t.replace("urn:entity:", "")).join(", ")}; picked the most popular. Add a hint like "(show)" or pin another.`
          : undefined,
    };
  }
  const scored = candidates
    .map((c) => ({ c, s: similarity(query, c.name) }))
    .sort((a, b) => b.s - a.s || (b.c.popularity ?? 0) - (a.c.popularity ?? 0));
  const best = scored[0];
  if (best.s < MIN_USABLE_SIMILARITY) {
    return {
      input,
      status: "not_found",
      alternatives: scored.slice(0, 4).map((x) => compact(x.c)),
      similarity: best.s,
      method: "top_result",
      note: `Closest match "${best.c.name}" is too different to trust; not used. Pin a candidate if it is right.`,
    };
  }
  return {
    input,
    status: best.s >= 0.8 ? "resolved" : "ambiguous",
    chosen: compact(best.c),
    alternatives: scored.slice(1, 5).map((x) => compact(x.c)),
    similarity: best.s,
    method: opts.typeHint ? "type_hint" : "top_result",
    note: best.s < 0.8 ? `Closest match only; check it is the right "${query}".` : undefined,
  };
}

export async function resolveLove(
  qloo: QlooClient,
  input: string,
  pinnedId?: string,
): Promise<Resolution> {
  const { query, typeHint } = parseLove(input);
  let candidates = await qloo.search(query, { types: typeHint, take: 6 });
  if (typeHint && candidates.length === 0) candidates = await qloo.search(query, { take: 6 });
  return chooseCandidate(input, candidates, { typeHint, pinnedId });
}
