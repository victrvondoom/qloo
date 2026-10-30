// Studio tools: pure functions over a finished brief. No network.
//   quantityPlan     lumen-method estimate of fixtures for a room size
//   dayClock         which scene, colour and level is on at each hour
//   fixtureScheduleCsv / specJson   exports for an electrician or a lighting tool
//   specHistory      the brief's life, read from its ledger
//   tasteAxes        three readable axes for the 3D taste space
//   similarity       cosine over atmosphere scores (for "clients like this one")
//   mergeDuet        two people, one room: agreement, clashes, compromise

import { buildDeepBrief } from "./deep/build";
import { applyClientAnswer } from "./fingerprint";
import { cctRange, layeringOf, roomVisual, scenesOf } from "./render";
import { decodeWords } from "./refine";
import { ROOM_LABEL, TRADE_LABEL } from "./rulebooks";
import { buildSpec } from "./spec";
import type { Brief, DimensionId, DimensionScore } from "./types";

// ---------------------------------------------------------------- quantities

export interface QuantityPlan {
  areaM2: number;
  targetLux: number;
  /** Lumens needed at the working plane, before losses. */
  lumensAtPlane: number;
  /** Installed lumens after utilisation and maintenance factors. */
  lumensInstalled: number;
  ambient: { kind: string; lumensEach: number; count: number; spacingM?: number; note: string };
  extras: { kind: string; count: number; note: string }[];
  assumptions: string[];
}

const UF = 0.5; // utilisation factor, typical residential room with mid-reflectance surfaces
const MF = 0.8; // maintenance factor

/** Lumen method: N = E × A / (Φ × UF × MF). An estimate to sanity-check a layout, not a lighting calculation. */
export function quantityPlan(brief: Pick<Brief, "spec" | "input">, room: { lengthM: number; widthM: number; heightM: number }): QuantityPlan {
  const L = Math.max(1, Math.min(40, room.lengthM));
  const Wd = Math.max(1, Math.min(40, room.widthM));
  const Ht = Math.max(2.1, Math.min(8, room.heightM));
  const area = +(L * Wd).toFixed(1);
  const level = brief.spec.find((l) => l.id === "level")?.value ?? "";
  const targetLux = Number(level.match(/~(\d+)\s*lux/)?.[1] ?? 150);
  const atPlane = Math.round(targetLux * area);
  const installed = Math.round(atPlane / (UF * MF));
  const layering = layeringOf(brief.spec);
  const per = { lamps: 800, even: 900, concealed: 650, track: 900 }[layering];
  const kind = { lamps: "Glare-shielded downlights (task zones) + lamps", even: "Downlights + perimeter cove", concealed: "Trimless recessed downlights + LED tape", track: "Adjustable track heads" }[layering];
  // Lamp-led rooms get a share of their light from lamps and wall-washers.
  const lampShare = layering === "lamps" ? 0.45 : layering === "even" ? 0.2 : 0;
  const count = Math.max(2, Math.ceil((installed * (1 - lampShare)) / per));
  const spacing = +Math.min(Ht * 1.2, Math.sqrt(area / count)).toFixed(1);
  const extras: QuantityPlan["extras"] = [];
  if (layering === "lamps") extras.push({ kind: "Table and floor lamps (≈450–800 lm each)", count: Math.max(3, Math.ceil((installed * lampShare) / 600)), note: "at least four sources at different heights" });
  if (layering === "even" || layering === "concealed") extras.push({ kind: "Linear LED for coves / shelving (metres)", count: Math.round(2 * (L + Wd) * 0.6), note: "≈ perimeter of the main runs" });
  return {
    areaM2: area,
    targetLux,
    lumensAtPlane: atPlane,
    lumensInstalled: installed,
    ambient: { kind, lumensEach: per, count, spacingM: spacing, note: `about ${spacing} m apart; keep spacing ≤ 1.2 × ceiling height (${(Ht * 1.2).toFixed(1)} m)` },
    extras,
    assumptions: [
      `Target ${targetLux} lux from the spec's light-level line (${ROOM_LABEL[brief.input.room].toLowerCase()} range).`,
      `Utilisation factor ${UF} and maintenance factor ${MF}: typical mid-reflectance room. Dark walls need more.`,
      `${per} lm per ambient fitting. Swap in the real fittings' photometry before ordering.`,
      "An estimate to sanity-check quantities, not a lighting calculation.",
    ],
  };
}

// ---------------------------------------------------------------- day clock

export interface ClockHour {
  hour: number;
  scene: string;
  kelvin: number;
  percent: number;
  hex: string;
  daylight: boolean;
}

/** Which scene is on at each hour: day 07–17, evening scene 18–21, late scene 22–00, night path 01–06. */
export function dayClock(brief: Pick<Brief, "spec" | "dimensions" | "input">): ClockHour[] {
  const scenes = [...scenesOf(brief.spec)].sort((a, b) => b.level - a.level);
  const vis = (id: (typeof scenes)[number]["id"]) => roomVisual({ spec: brief.spec, dims: brief.dimensions, trade: brief.input.trade, room: brief.input.room, scene: id });
  const day = vis(scenes[0].id);
  const evening = vis(scenes[1]?.id ?? scenes[0].id);
  const late = vis((scenes[2] ?? scenes[1] ?? scenes[0]).id);
  return Array.from({ length: 24 }, (_, h) => {
    const v = h >= 7 && h <= 17 ? day : h >= 18 && h <= 21 ? evening : h >= 22 || h === 0 ? late : undefined;
    if (!v) return { hour: h, scene: "Night path", kelvin: 1900, percent: 3, hex: "#ff8a2a", daylight: false };
    return { hour: h, scene: v.sceneLabel, kelvin: v.kelvin, percent: v.percent, hex: v.lightRgb, daylight: v === day };
  });
}

// ---------------------------------------------------------------- exports

const csvCell = (s: string | number) => {
  const t = String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Fixture schedule: one row per item, with the colour, rendering and control requirements from the spec. */
export function fixtureScheduleCsv(brief: Brief): string {
  const deep = buildDeepBrief(brief);
  const cct = brief.spec.find((l) => l.id === "cct")?.value ?? "";
  const cri = brief.spec.find((l) => l.id === "cri")?.value ?? "";
  const dimming = brief.spec.find((l) => l.id === "dimming")?.value ?? "";
  const head = ["Ref", "Item", "Quantity", "Specification", "Colour temperature", "Colour rendering", "Control", "Basis", "Spec line"];
  const rows = deep.shopping.map((s, i) => [`F${String(i + 1).padStart(2, "0")}`, s.item, s.qty, s.spec, cct, cri, dimming, s.basis.replace("_", " "), s.ref ?? ""]);
  const meta = [
    `# Tastespec fixture schedule · ${brief.input.clientLabel} · ${TRADE_LABEL[brief.input.trade]} · ${ROOM_LABEL[brief.input.room]} · ${brief.input.city}`,
    `# Brief ${brief.id} · ${brief.rulebookVersion} · ${brief.dataMode === "fixture" ? "SYNTHETIC DEMO DATA" : "live Qloo evidence"} · ledger head ${brief.ledger.at(-1)?.hash ?? ""}`,
  ];
  return [...meta, head.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

/** The spec as structured data (no owner, no pasted message, no ledger bodies). */
export function specJson(brief: Brief) {
  const cct = cctRange(brief.spec);
  return {
    format: "tastespec-spec/1",
    brief: brief.id,
    dataMode: brief.dataMode,
    rulebookVersion: brief.rulebookVersion,
    client: brief.input.clientLabel,
    trade: brief.input.trade,
    room: brief.input.room,
    city: brief.input.city,
    words: brief.input.words,
    colourTemperatureK: { day: cct.day, dimmed: cct.dimmed, task: cct.task ?? null },
    scenes: scenesOf(brief.spec),
    lines: brief.spec.map((l) => ({ id: l.id, category: l.category, value: l.status === "revised" && l.revisedTo ? l.revisedTo : l.value, proposed: l.value, basis: l.basis, confidence: l.confidence, status: l.status, constraints: l.constraints, evidenceLedger: l.evidenceLedger })),
    ledgerHead: brief.ledger.at(-1)?.hash ?? null,
  };
}

// ---------------------------------------------------------------- history

export interface HistoryItem {
  seq: number;
  at: string;
  actor: "agent" | "designer" | "client";
  label: string;
  kind: "run" | "answer" | "depth" | "decision" | "reaction" | "outcome" | "analysis";
}

/** The brief's life from its ledger: every spec-changing or review event, in order. */
export function specHistory(brief: Brief): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const e of brief.ledger) {
    const via = (e.detail as { via?: string }).via === "client" ? "client" : "designer";
    if (e.kind === "computation" && e.summary.startsWith("Spec drafted")) out.push({ seq: e.seq, at: e.ts, actor: "agent", kind: "run", label: `Spec drafted (${(e.detail as { differsFromLiteralReading?: number }).differsFromLiteralReading ?? "?"} lines differ from literal)` });
    else if (e.kind === "client_input" && e.summary.startsWith("Client answered")) out.push({ seq: e.seq, at: e.ts, actor: via, kind: "answer", label: e.summary });
    else if (e.kind === "computation" && e.summary.startsWith("Re-scored")) {
      const changed = (e.detail as { changedLines?: string[] }).changedLines ?? [];
      out.push({ seq: e.seq, at: e.ts, actor: "agent", kind: "answer", label: changed.length ? `Re-scored: ${changed.join(", ")} changed` : "Re-scored: no line changed" });
    } else if (e.kind === "decision" && e.summary.startsWith("Spec switched to depth")) out.push({ seq: e.seq, at: e.ts, actor: "designer", kind: "depth", label: e.summary });
    else if (e.kind === "client_input" && e.summary.startsWith("Client reacted")) out.push({ seq: e.seq, at: e.ts, actor: "client", kind: "reaction", label: e.summary.replace("Client reacted to", "Reacted to") });
    else if (e.kind === "client_input" && e.summary.startsWith("Outcome")) out.push({ seq: e.seq, at: e.ts, actor: "designer", kind: "outcome", label: e.summary });
    else if (e.kind === "client_input" && /: (accepted|revised|proposed)/.test(e.summary)) out.push({ seq: e.seq, at: e.ts, actor: "designer", kind: "decision", label: e.summary });
    else if (e.kind === "computation" && /^(Influence map|Taste anatomy|Depth ")/.test(e.summary)) out.push({ seq: e.seq, at: e.ts, actor: "agent", kind: "analysis", label: e.summary });
  }
  return out;
}

// ---------------------------------------------------------------- taste space

type Vec = Partial<Record<DimensionId, number>>;
const g = (v: Vec, k: DimensionId) => v[k] ?? 0;

/** Three readable axes: warm ↔ cool, characterful ↔ minimal, social ↔ calm (each roughly −1..1). */
export function tasteAxes(v: Vec): { warm: number; character: number; social: number } {
  const c = (x: number) => Math.max(-1, Math.min(1, x));
  return {
    warm: c((g(v, "low_glow") + 0.5 * g(v, "vintage_character") + 0.5 * g(v, "natural_organic") - g(v, "bright_airy") - 0.6 * g(v, "clean_minimal")) / 1.6),
    character: c((g(v, "vintage_character") + 0.7 * g(v, "industrial_raw") + 0.4 * g(v, "refined_luxe") - g(v, "clean_minimal") - 0.4 * g(v, "calm_quiet")) / 1.6),
    social: c((g(v, "energetic_social") - g(v, "calm_quiet")) / 1.2),
  };
}

export function similarity(a: Pick<DimensionScore, "id" | "score">[], b: Pick<DimensionScore, "id" | "score">[]): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (const d of a) {
    const o = b.find((x) => x.id === d.id)?.score ?? 0;
    ab += d.score * o;
    aa += d.score * d.score;
    bb += o * o;
  }
  return aa && bb ? +(ab / Math.sqrt(aa * bb)).toFixed(3) : 0;
}

// ---------------------------------------------------------------- duet

export interface Duet {
  a: { id: string; name: string };
  b: { id: string; name: string };
  room: Brief["input"]["room"];
  trade: Brief["input"]["trade"];
  agreement: number;
  dims: DimensionScore[];
  lines: { lineId: string; category: string; a: string; b: string; together: string; verdict: "agree" | "leans A" | "leans B" | "middle ground" }[];
  shared: DimensionId[];
  pulls: { name: string; toward: DimensionId[] }[];
}

const effective = (b: Brief) => {
  const q = b.question;
  if (!q?.answer || q.answer === "neither") return b.dimensions;
  const chosen = q.answer === "A" ? q.optionA : q.optionB;
  const rejected = q.answer === "A" ? q.optionB : q.optionA;
  return applyClientAnswer(b.dimensions, chosen.carries, rejected.carries);
};

/** Two people, one room: average their measured atmospheres (equal weight), keep both people's words and constraints, build one spec. */
export function mergeDuet(a: Brief, b: Brief): Duet {
  const usable = (x: Brief) => x.status === "COMPLETE" || x.status === "NEEDS_CLARIFICATION";
  if (!usable(a) || !usable(b)) throw new Error("Both briefs need usable evidence to merge.");
  const da = effective(a);
  const db = effective(b);
  const dims: DimensionScore[] = da.map((d) => {
    const o = db.find((x) => x.id === d.id)!;
    return { ...d, score: +((d.score + o.score) / 2).toFixed(4), clientAdjusted: undefined, exemplars: [...d.exemplars.slice(0, 2), ...o.exemplars.slice(0, 2)] };
  });
  const words = [...new Set([...a.input.words, ...b.input.words])];
  const decoded = decodeWords({ ...a, input: { ...a.input, words } }, dims);
  // Both people's written ranges must hold; where they don't overlap neither is silently dropped, so none is applied and the note says so.
  const ra = a.input.cctRange;
  const rb = b.input.cctRange;
  const cctRange = ra && rb ? (Math.max(ra.min, rb.min) <= Math.min(ra.max, rb.max) ? { min: Math.max(ra.min, rb.min), max: Math.min(ra.max, rb.max) } : undefined) : ra ?? rb;
  const together = buildSpec(a.input.trade, a.input.room, dims, decoded, words, undefined, { evidenceUsable: true, evidenceLedger: [], signalEntityIds: [], cctRange });
  const specA = buildSpec(a.input.trade, a.input.room, da, decodeWords(a, da), a.input.words, undefined, { evidenceUsable: true, evidenceLedger: [], signalEntityIds: [] });
  const specB = buildSpec(a.input.trade, a.input.room, db, decodeWords({ ...b, input: { ...b.input, trade: a.input.trade, room: a.input.room } }, db), b.input.words, undefined, { evidenceUsable: true, evidenceLedger: [], signalEntityIds: [] });
  const lines = together.map((l) => {
    const va = specA.find((x) => x.id === l.id)?.value ?? "";
    const vb = specB.find((x) => x.id === l.id)?.value ?? "";
    const verdict: Duet["lines"][number]["verdict"] = va === vb ? "agree" : l.value === va ? "leans A" : l.value === vb ? "leans B" : "middle ground";
    return { lineId: l.id, category: l.category, a: va, b: vb, together: l.value, verdict };
  });
  const top = (d: DimensionScore[]) => new Set([...d].sort((x, y) => y.score - x.score).filter((x) => x.score > 0.2).slice(0, 3).map((x) => x.id));
  const ta = top(da);
  const tb = top(db);
  return {
    a: { id: a.id, name: a.input.clientLabel },
    b: { id: b.id, name: b.input.clientLabel },
    room: a.input.room,
    trade: a.input.trade,
    agreement: similarity(da, db),
    dims,
    lines,
    shared: [...ta].filter((x) => tb.has(x)),
    pulls: [
      { name: a.input.clientLabel, toward: [...ta].filter((x) => !tb.has(x)) },
      { name: b.input.clientLabel, toward: [...tb].filter((x) => !ta.has(x)) },
    ],
  };
}
