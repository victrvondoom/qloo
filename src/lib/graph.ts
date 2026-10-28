// The narrowing graph. The agent keeps no memory between clients; everything it
// knows about this one is on this graph, which narrows left to right:
//
//   said → what it could mean → rooms their taste chooses → atmospheres → decisions → spec
//
// Each spec line can be traced back along its edges to the client's own words
// and references. Built from a brief (or a partial one while the agent runs).

import { DIMENSIONS, DIMENSION_BY_ID } from "./dimensions";
import type { Brief, GraphColumn, GraphEdge, GraphNode, TasteGraph } from "./types";

export type GraphSource = Pick<Brief, "input"> & Partial<Pick<Brief, "resolutions" | "crowdVenues" | "dimensions" | "words" | "spec" | "question" | "status">>;

export const COLUMN_TITLES: Record<GraphColumn, string> = {
  said: "What they said",
  means: "What it could mean",
  rooms: "Rooms their taste chooses",
  atmospheres: "Atmospheres",
  decisions: "Decisions",
  spec: "Spec",
};

const MAX_PLACES = 16;

function short(s: string, n = 46) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function buildTasteGraph(src: GraphSource): TasteGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const add = (n: GraphNode) => nodes.push(n);
  const link = (e: GraphEdge) => edges.push(e);

  // 1. said
  for (const w of src.input.words) add({ id: `w:${w}`, column: "said", label: `“${w}”`, kind: "word", weight: 1 });
  for (const l of src.input.loves) add({ id: `r:${l}`, column: "said", label: l, kind: "reference", weight: 1 });

  // 2. means: readings of each word, and what each reference resolved to
  for (const w of src.words ?? []) {
    for (const r of w.readings) {
      const id = `m:${w.word}:${r.dimension}`;
      add({ id, column: "means", label: r.meaning, sub: `${Math.round(r.weight * 100)}%${r.isDictionaryDefault ? " · literal" : ""}`, kind: "reading", weight: r.weight, dimension: r.dimension, muted: w.chosen?.dimension !== r.dimension });
      link({ from: `w:${w.word}`, to: id, weight: r.weight, kind: "reading" });
    }
  }
  for (const r of src.resolutions ?? []) {
    if (r.usedAsSignal && r.chosen) {
      const id = `e:${r.chosen.entity_id}`;
      if (!nodes.some((n) => n.id === id)) add({ id, column: "means", label: r.chosen.name, sub: r.chosen.type.replace("urn:entity:", ""), kind: "entity", weight: r.confidence ?? 1 });
      link({ from: `r:${r.input}`, to: id, weight: r.confidence ?? 1, kind: "resolves" });
    } else {
      const id = `x:${r.input}`;
      add({ id, column: "means", label: r.input, sub: r.status === "not_found" ? "not found" : "abstained", kind: "abstained", weight: 0.2, muted: true });
      link({ from: `r:${r.input}`, to: id, weight: 0.2, kind: "resolves" });
    }
  }

  // 3. rooms: the taste-matched places (top by affinity)
  const crowd = [...(src.crowdVenues ?? [])].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  const shown = crowd.slice(0, MAX_PLACES);
  const maxAff = Math.max(1e-9, ...shown.map((v) => v.affinity ?? 0));
  const entityIds = nodes.filter((n) => n.kind === "entity").map((n) => n.id);
  for (const v of shown) {
    const id = `p:${v.entity_id}`;
    add({ id, column: "rooms", label: v.name, sub: v.dimensions.map((d) => DIMENSION_BY_ID[d].short).join(" · ") || "no atmosphere terms", kind: "place", weight: (v.affinity ?? 0) / maxAff, dimension: v.dimensions[0], muted: v.dimensions.length === 0 });
    for (const e of entityIds) link({ from: e, to: id, weight: ((v.affinity ?? 0) / maxAff) / Math.max(1, entityIds.length), kind: "affinity" });
  }

  // 4. atmospheres
  if (src.dimensions?.length) {
    for (const d of [...src.dimensions].sort((a, b) => b.score - a.score)) {
      const id = `a:${d.id}`;
      add({ id, column: "atmospheres", label: DIMENSION_BY_ID[d.id].short, sub: `×${d.lift.toFixed(1)} · ${d.crowdHits}/${d.crowdN} vs ${d.baseHits}/${d.baseN}`, kind: "atmosphere", weight: Math.min(1, Math.abs(d.score)), dimension: d.id, muted: d.score <= 0.1 });
    }
    for (const v of shown) for (const dim of v.dimensions) link({ from: `p:${v.entity_id}`, to: `a:${dim}`, weight: 0.5, kind: "carries" });
  }

  // 5. decisions: the reading each word resolved to, constraints, the question
  const decisionIds = new Set<string>();
  for (const w of src.words ?? []) {
    if (!w.chosen) continue;
    const id = `d:${w.word}`;
    add({ id, column: "decisions", label: `“${w.word}” = ${short(w.chosen.meaning, 34)}`, sub: w.chosen.isDictionaryDefault ? "literal sense" : "not the literal sense", kind: "decision", weight: w.chosen.weight, dimension: w.chosen.dimension });
    decisionIds.add(id);
    link({ from: `m:${w.word}:${w.chosen.dimension}`, to: id, weight: w.chosen.weight, kind: "selects" });
    if (src.dimensions?.length) link({ from: `a:${w.chosen.dimension}`, to: id, weight: 0.6, kind: "selects" });
  }
  const constraints = new Set<string>();
  for (const l of src.spec ?? []) for (const c of l.constraints) if (c.startsWith("warm-floor")) constraints.add("warm-floor");
  if (constraints.has("warm-floor")) {
    add({ id: "c:warm-floor", column: "decisions", label: "Never cooler than 3000K", sub: "they asked for warm", kind: "constraint", weight: 1 });
    for (const w of src.input.words) if (/^(warm|cozy|cosy|moody|inviting|sexy|homey|calm|elegant|luxurious)$/.test(w)) link({ from: `w:${w}`, to: "c:warm-floor", weight: 0.6, kind: "bounds" });
  }
  if (src.question) {
    const q = src.question;
    const answered = q.answer && q.answer !== "neither" ? (q.answer === "A" ? q.optionA : q.optionB) : undefined;
    add({
      id: "q:question",
      column: "decisions",
      label: answered ? `Prefers ${short(answered.name, 26)}` : `${short(q.optionA.name, 18)} or ${short(q.optionB.name, 18)}?`,
      sub: answered ? `client answer → ${DIMENSION_BY_ID[answered.carries].short}` : `asked: ${q.expectedChange?.toFixed?.(1) ?? q.expectedImpact} lines depend on it`,
      kind: "question",
      weight: answered ? 1 : 0.5,
      dimension: answered?.carries,
    });
    link({ from: `a:${q.dimension}`, to: "q:question", weight: 0.5, kind: "answers" });
    link({ from: `a:${q.versus}`, to: "q:question", weight: 0.5, kind: "answers" });
  }

  // 6. spec
  for (const l of src.spec ?? []) {
    const id = `s:${l.id}`;
    add({ id, column: "spec", label: l.category, sub: short(l.value, 52), kind: "line", weight: l.confidence === "high" ? 1 : l.confidence === "medium" ? 0.66 : 0.33 });
    for (const e of l.evidence) link({ from: `a:${e.dimension}`, to: id, weight: Math.abs(2 * e.pGreater - 1), kind: "drives" });
    for (const d of decisionIds) {
      const dim = nodes.find((n) => n.id === d)?.dimension;
      if (dim && l.evidence.some((e) => e.dimension === dim)) link({ from: d, to: id, weight: 0.5, kind: "drives" });
    }
    if (l.constraints.some((c) => c.startsWith("warm-floor")) && constraints.has("warm-floor")) link({ from: "c:warm-floor", to: id, weight: 1, kind: "bounds" });
    if (l.basis === "client_answer" && src.question) link({ from: "q:question", to: id, weight: 1, kind: "answers" });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const countOf = (c: GraphColumn) => nodes.filter((n) => n.column === c).length;
  const significant = src.dimensions?.filter((d) => d.score > 0.1).length ?? 0;
  return {
    columns: [
      { id: "said", title: COLUMN_TITLES.said, count: countOf("said") },
      { id: "means", title: COLUMN_TITLES.means, count: countOf("means") },
      { id: "rooms", title: COLUMN_TITLES.rooms, count: crowd.length, note: crowd.length > shown.length ? `top ${shown.length} of ${crowd.length}` : undefined },
      { id: "atmospheres", title: COLUMN_TITLES.atmospheres, count: src.dimensions?.length ? significant : 0, note: src.dimensions?.length ? `${significant} of ${DIMENSIONS.length} stand out` : undefined },
      { id: "decisions", title: COLUMN_TITLES.decisions, count: countOf("decisions") },
      { id: "spec", title: COLUMN_TITLES.spec, count: countOf("spec") },
    ],
    nodes,
    edges: validEdges,
  };
}

/** Everything upstream and downstream of a node: the pathway a line (or a word) travels. */
export function tracePath(g: TasteGraph, nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const key = (e: GraphEdge) => `${e.from}->${e.to}`;
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  const walk = (dir: "up" | "down") => {
    const queue = [nodeId];
    const seen = new Set<string>([nodeId]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of g.edges) {
        const next = dir === "up" ? (e.to === cur ? e.from : undefined) : e.from === cur ? e.to : undefined;
        if (!next) continue;
        edges.add(key(e));
        nodes.add(next);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  };
  walk("up");
  walk("down");
  return { nodes, edges };
}

export const edgeKey = (e: GraphEdge) => `${e.from}->${e.to}`;
