// The deep brief: everything a designer hands on after the spec, built
// deterministically from the brief (no network, no model). Each section is
// narrower than the last: direction → what their words mean → scenes → zones
// → palette → reference places → what to buy → what to check on site → open
// risks. Every item says what it rests on: a spec line, the evidence, the
// client, or a general rule of thumb.
//
// Claude can rewrite the prose fields afterwards (deep/prose.ts), but only
// with wording that passes a grounding check against `facts`.

import { DIMENSION_BY_ID } from "../dimensions";
import { cctRange, layeringOf, opticsOf, roomVisual, scenesOf, type LightSource, type SceneId } from "../render";
import { ROOM_LABEL, TRADE_LABEL } from "../rulebooks";
import type { Brief, DimensionId } from "../types";
import { ROOM_ZONES, SURFACES, type ZoneRole } from "./zones";

export type Basis = "spec" | "evidence" | "client" | "rule_of_thumb";

export interface DeepZone {
  name: string;
  role: ZoneRole;
  purpose: string;
  plan: string;
  guidance: string;
  /** Spec lines that shape this zone's plan. */
  uses: string[];
}

export interface DeepBrief {
  version: "deep/1";
  personalised: boolean;
  title: string;
  subtitle: string;
  summary: string;
  keywords: string[];
  decoded: { word: string; literal?: string; means?: string; changed: boolean }[];
  scenes: { id: SceneId; label: string; percent: number; kelvin: number; hex: string; use: string }[];
  /** Scene programming: per zone, % output in each scene (from the drawn room model). */
  sceneTable: { zone: string; levels: number[] }[];
  fixtureFamily?: string;
  zones: DeepZone[];
  palette: { role: string; hex: string; name: string }[];
  references: { entity_id: string; name: string; city?: string; popularity?: number; atmospheres: string[]; terms: string[]; why: string }[];
  depthLabel: string;
  shopping: { item: string; qty: string; spec: string; basis: Basis; ref?: string }[];
  checklist: { item: string; basis: Basis; ref?: string }[];
  risks: { text: string; level: "info" | "check" | "warn" }[];
  clientNote: string;
  clientNoteSource: "model" | "template";
  /** The fact sheet the prose may draw on (and is checked against). */
  facts: string[];
}

const ADJ: Record<DimensionId, string> = {
  low_glow: "Amber",
  bright_airy: "Sunlit",
  clean_minimal: "Quiet",
  vintage_character: "Collected",
  industrial_raw: "Raw",
  natural_organic: "Earthen",
  refined_luxe: "Polished",
  energetic_social: "Lively",
  calm_quiet: "Still",
};
const NOUN: Record<DimensionId, string> = {
  low_glow: "Hour",
  bright_airy: "Morning",
  clean_minimal: "Line",
  vintage_character: "Parlour",
  industrial_raw: "Loft",
  natural_organic: "Grain",
  refined_luxe: "Salon",
  energetic_social: "Social",
  calm_quiet: "Retreat",
};

/** How each atmosphere reads in a sentence ("should have …", "places with …"). */
export const PHRASE: Record<DimensionId, string> = {
  low_glow: "low, warm light",
  bright_airy: "bright, airy daylight",
  clean_minimal: "clean, minimal lines",
  vintage_character: "vintage character",
  industrial_raw: "raw, industrial materials",
  natural_organic: "natural, earthy materials",
  refined_luxe: "a refined, polished finish",
  energetic_social: "a lively, social buzz",
  calm_quiet: "a calm, quiet mood",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const COLOUR_NAMES: [string, string][] = [
  ["#5b5a3e", "olive"], ["#5a3d2b", "walnut"], ["#3f3a2c", "smoked umber"], ["#7d3b2f", "oxblood"], ["#b08d57", "aged brass"], ["#c2742f", "amber"],
  ["#f3efe6", "warm white"], ["#d9c4a5", "light oak"], ["#ffffff", "pure white"], ["#e9e2d4", "linen"], ["#c9c5bd", "pale stone"], ["#8fb3c9", "sky blue"],
  ["#ecebe7", "soft white"], ["#cfc8bd", "pale greige"], ["#f7f7f5", "crisp white"], ["#b9b6ae", "warm grey"], ["#2b2b2b", "matte black"], ["#4a4a48", "graphite"],
  ["#2f4a3c", "deep green"], ["#6b4a2f", "chestnut"], ["#e6d8bd", "cream"], ["#b8862f", "mustard"], ["#b5893a", "unlacquered brass"], ["#a6452d", "rust"],
  ["#7a7672", "concrete"], ["#8d8a85", "cement"], ["#3a3836", "charcoal"], ["#5c4a3d", "tobacco"], ["#232323", "blackened steel"], ["#a5582c", "copper"],
  ["#d8cdb6", "clay"], ["#a07a52", "oiled oak"], ["#efe7d6", "limewash white"], ["#9c8f6c", "jute"], ["#8a6a4a", "bronze"], ["#6f7d55", "sage"],
  ["#cbbfae", "greige"], ["#e7e1d8", "travertine"], ["#f2ede4", "ivory"], ["#4a3f5c", "aubergine"], ["#c9a45c", "brushed brass"], ["#7d5c3a", "cognac"],
  ["#b6452f", "terracotta red"], ["#4b3a2f", "dark walnut"], ["#f2e3c6", "parchment"], ["#2f5d74", "petrol blue"], ["#c49a3c", "old gold"], ["#e0a83a", "saffron"],
  ["#dfe2db", "mist"], ["#bfae96", "sand"], ["#f4f4ef", "chalk"], ["#a8b3a4", "grey sage"], ["#9a9a94", "pewter"], ["#7f9488", "eucalyptus"], ["#333333", "raw steel"],
];

export function colourName(hex: string): string {
  const exact = COLOUR_NAMES.find(([h]) => h === hex.toLowerCase());
  if (exact) return exact[1];
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = COLOUR_NAMES[0];
  let bestD = Infinity;
  for (const c of COLOUR_NAMES) {
    const [r2, g2, b2] = rgb(c[0]);
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best[1];
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const stripDot = (s: string) => s.replace(/\.\s*$/, "");
const value = (b: Brief, id: string) => b.spec.find((l) => l.id === id)?.value ?? "";

/** Which drawn light sources a zone role maps to, for the scene table. */
const ROLE_SOURCES: Record<ZoneRole, LightSource["kind"][]> = {
  ambient: ["downlight", "cove", "track"],
  decorative: ["pendant", "table_lamp", "floor_lamp"],
  accent: ["wallwash", "track"],
  task: ["downlight", "table_lamp", "track"],
  night: [],
};

const SCENE_USE: Record<string, string> = {
  Day: "Daylight leads; electric light fills the far side of the room and the task surfaces.",
  Dinner: "Lamps and accents carry the room; general downlights near-off. Colour warms as it dims.",
  Late: "Lowest glow: lamps and one accent only, at the warmest colour.",
  "Wind-down": "Soft, even and warm for the last hour; nothing bright in the sightline.",
  Evening: "General light down, accents up, so the room keeps its depth after dark.",
};

function zonePlan(role: ZoneRole, b: Brief, task?: number): { plan: string; uses: string[] } {
  const layering = layeringOf(b.spec);
  const optics = opticsOf(b.spec);
  const cct = cctRange(b.spec);
  switch (role) {
    case "ambient":
      return {
        plan: {
          lamps: "No general ceiling wash: ambient light comes from lamps and light bounced off one long wall.",
          even: "Perimeter cove or linear uplight for an even, shadow-free wash, with daylight-matched downlights to fill.",
          concealed: "Trimless recessed downlights and LED tape hidden in coves and shelving; no visible fittings.",
          track: "Surface track on the exposed run, heads washing walls rather than the floor.",
        }[layering],
        uses: ["layers"],
      };
    case "task":
      return {
        plan: `Task light at ${task ?? cct.task ?? cct.day}K on the working surface, ${optics === "lowglare" || optics === "grid" ? "glare-controlled and out of sightlines" : "shielded so the beam stays on the surface"}.`,
        uses: ["cct", "optics"],
      };
    case "accent":
      return {
        plan: {
          accent: "Narrow 15–25° beams on art and the table, each with glare shielding.",
          sparkle: "Mixed 24–36° beams, plus a few visible decorative sources for sparkle.",
          grid: "Consistent 36° beams on a regular grid, aligned with the architecture.",
          lowglare: "Deep-regressed, low-glare accent light; nothing bright in the main sightlines.",
        }[optics],
        uses: ["optics"],
      };
    case "decorative":
      return {
        plan: {
          lamps: "Lamps and one decorative piece carry this zone; they stay on in every evening scene.",
          even: "One decorative pendant or lamp as the focal point over the even wash.",
          concealed: "A single, quiet decorative piece at most; the light itself comes from concealed sources.",
          track: "A pendant or rail-mounted heads aimed at this zone.",
        }[layering],
        uses: ["layers", "fixtures"],
      };
    case "night":
      return { plan: "Very warm, low-level light on a sensor or its own switch; never part of the main scenes.", uses: [] };
  }
}

function sceneLevel(b: Brief, scene: SceneId, role: ZoneRole): number {
  if (role === "night") return 0;
  const v = roomVisual({ spec: b.spec, dims: b.dimensions, trade: b.input.trade, room: b.input.room, scene });
  const kinds = ROLE_SOURCES[role];
  const on = v.sources.filter((s) => kinds.includes(s.kind)).map((s) => s.intensity);
  if (role === "task") return Math.round(Math.max(v.level, ...on, 0) * 100);
  return Math.round(Math.max(0, ...on) * 100);
}

function references(b: Brief) {
  const level = b.appliedDepth ?? 0;
  const layer = b.depth?.find((d) => d.level === level) ?? b.depth?.[0];
  return {
    depthLabel: layer?.label ?? "Mainstream",
    refs: (layer?.references ?? []).slice(0, 6).map((r) => {
      const atmospheres = r.dimensions.map((d) => PHRASE[d]);
      const terms = r.terms.slice(0, 3);
      return {
        entity_id: r.entity_id,
        name: r.name,
        city: r.city,
        popularity: r.popularity,
        atmospheres,
        terms,
        why: `${cap(atmospheres.slice(0, 2).join(" and "))}${terms.length ? `; tagged “${terms.join("”, “")}”` : ""}.`,
      };
    }),
  };
}

function lightingShopping(b: Brief): DeepBrief["shopping"] {
  const layering = layeringOf(b.spec);
  const fixtures = stripDot(value(b, "fixtures"));
  const optics = stripDot(value(b, "optics"));
  const cct = value(b, "cct");
  const cri = stripDot(value(b, "cri"));
  const out: DeepBrief["shopping"] = [];
  const add = (item: string, qty: string, spec: string, basis: Basis, ref?: string) => out.push({ item, qty, spec, basis, ref });
  if (layering === "lamps") {
    add("Table lamps", "2", fixtures, "spec", "fixtures");
    add("Floor lamp", "1", fixtures, "spec", "fixtures");
    add("Wall-washer or uplight for one long wall", "1–2", "Dimmable, on its own channel", "spec", "layers");
    add("Adjustable accent spots or picture lights", "2–4", optics, "spec", "optics");
    add("Downlights over task zones only", "as the task zones need", "Glare-shielded; none over seating", "spec", "layers");
  } else if (layering === "even") {
    add("Perimeter cove or linear uplight", "to suit the perimeter", "Dimmable LED linear in an aluminium profile with diffuser", "spec", "layers");
    add("Downlights", "from a lighting calculation", optics, "spec", "optics");
    add("Decorative pendant or lamp", "1", fixtures, "spec", "fixtures");
  } else if (layering === "concealed") {
    add("Trimless recessed downlights", "from a lighting calculation", optics, "spec", "optics");
    add("LED tape for coves and shelving", "to suit the joinery", "Aluminium profile with opal diffuser, no visible dots", "spec", "layers");
    add("Remote drivers", "one per circuit", "Matched to the dimming protocol below", "spec", "dimming");
  } else {
    add("Surface track or rail", "to suit the exposed run", "Black or raw finish, mains or low-voltage", "spec", "layers");
    add("Adjustable track heads", "6–10", optics, "spec", "optics");
    add("Decorative pendant", "1–2", fixtures, "spec", "fixtures");
  }
  const room = b.input.room;
  if (room === "kitchen") add("Under-cabinet linear light", "to suit the wall units", `${cctRange(b.spec).task ?? cctRange(b.spec).day}K, continuous, set to the cabinet front`, "rule_of_thumb");
  if (room === "dining_room") add("Pendant or linear over the table", "1", `${fixtures}; bottom about 71–86 cm (28–34 in) above the table`, "rule_of_thumb", "fixtures");
  if (room === "bathroom") add("Mirror side lights", "2", "Diffused, vertical, wet-location rated as your code requires", "rule_of_thumb");
  if (room === "bedroom") {
    add("Bedside reading lights", "2", "Shielded, focused beam, switchable from the bed", "rule_of_thumb");
    add("Night path light", "1–3", "Amber, low-level, motion-triggered", "rule_of_thumb");
  }
  if (room === "home_office") add("Adjustable task lamp and a soft front light for calls", "1 + 1", "Glare-free on the screen", "rule_of_thumb");
  add("LED light sources (all fittings)", "all", `${cct}; ${cri}`, "spec", "cct");
  add("Dimming and scene control", "1 system", stripDot(value(b, "dimming")), "spec", "dimming");
  return out;
}

function finishesShopping(b: Brief): DeepBrief["shopping"] {
  return [
    { item: "Wall and ceiling paint", qty: "walls + ceiling", spec: stripDot(value(b, "walls")), basis: "spec", ref: "walls" },
    { item: "Primary materials (floor, joinery, worktops)", qty: "to suit the room", spec: stripDot(value(b, "material")), basis: "spec", ref: "material" },
    { item: "Hardware and metalwork", qty: "all handles, hinges, fittings", spec: stripDot(value(b, "metal")), basis: "spec", ref: "metal" },
    { item: "Curtains, upholstery, rug", qty: "per window and seat", spec: stripDot(value(b, "textiles")), basis: "spec", ref: "textiles" },
    { item: "Paint sheen schedule", qty: "per surface", spec: stripDot(value(b, "sheen")), basis: "spec", ref: "sheen" },
    { item: "Sample boards", qty: "2–3 options", spec: "Viewed in the room itself, by day and in the evening", basis: "rule_of_thumb" },
  ];
}

function lightingChecklist(b: Brief): DeepBrief["checklist"] {
  const cct = value(b, "cct");
  const out: DeepBrief["checklist"] = [
    { item: `Driver and dimmer pairings: confirm each one on the manufacturers' compatibility lists. The spec asks for ${lower(stripDot(value(b, "dimming")))}.`, basis: "spec", ref: "dimming" },
    { item: "Colour consistency: all LEDs from the same colour bin, within 3 SDCM (MacAdam steps), so no fitting looks pink or green beside another.", basis: "rule_of_thumb" },
    { item: `Ask for full colour-rendering test reports (R1–R15), not just the headline Ra: ${stripDot(value(b, "cri"))}.`, basis: "spec", ref: "cri" },
    { item: `Glare: ${lower(stripDot(value(b, "optics")))}. Check cut-off angles before ordering.`, basis: "spec", ref: "optics" },
    { item: "Flicker: test every circuit at its lowest dim level on site, including on a phone camera; reject visible shimmer.", basis: "rule_of_thumb" },
    { item: `Light levels: verify with a lux meter after installation. Target: ${lower(value(b, "level"))}`, basis: "spec", ref: "level" },
    { item: "Program the scenes in the table above and label the keypad; hand over a one-page scene sheet.", basis: "spec", ref: "dimming" },
  ];
  if (/dim-to-warm/.test(cct)) out.splice(1, 0, { item: "Dim-to-warm: check the chosen LEDs really reach about 2200K at low output, not just 2700K.", basis: "spec", ref: "cct" });
  if (b.input.room === "bathroom") out.push({ item: "Ingress protection: confirm each fitting's rating against the zone it sits in under local code.", basis: "rule_of_thumb" });
  if (b.input.room === "kitchen") out.push({ item: "Under-cabinet light continuous with no dark gaps at cabinet joints; drivers accessible.", basis: "rule_of_thumb" });
  if (b.input.room === "home_office") out.push({ item: "Check screen reflections from the desk position before fixing downlight positions.", basis: "rule_of_thumb" });
  return out;
}

function finishesChecklist(b: Brief): DeepBrief["checklist"] {
  const out: DeepBrief["checklist"] = [
    { item: "Review sample boards in the room under its own light, by day and in the evening, before ordering.", basis: "rule_of_thumb" },
    { item: "Order each paint colour from a single batch; record product codes in the handover file.", basis: "rule_of_thumb" },
    { item: `Sheen schedule: ${lower(stripDot(value(b, "sheen")))}.`, basis: "spec", ref: "sheen" },
  ];
  if (/limewash/i.test(value(b, "walls"))) out.push({ item: "Limewash needs a mineral-compatible substrate or primer; test a patch first.", basis: "rule_of_thumb", ref: "walls" });
  if (/Unlacquered brass/.test(value(b, "metal"))) out.push({ item: "Unlacquered brass darkens and spots with use: confirm the client wants it to age.", basis: "spec", ref: "metal" });
  if (["restaurant", "bar", "retail"].includes(b.input.room)) out.push({ item: "Commercial room: check fire ratings for textiles and wall finishes.", basis: "rule_of_thumb" });
  return out;
}

function risks(b: Brief): DeepBrief["risks"] {
  const out: DeepBrief["risks"] = [];
  if (b.dataMode === "fixture") out.push({ text: "Demo data: built from the synthetic test world, not a real taste neighbourhood. Don't show it to a client as research.", level: "warn" });
  if (b.status === "INSUFFICIENT_EVIDENCE" || b.status === "UPSTREAM_UNAVAILABLE") out.push({ text: "No personalisation: this is the literal reading of the client's words.", level: "warn" });
  if (b.evidenceMode === "degraded") out.push({ text: "Some evidence calls failed during the run; the brief says which.", level: "warn" });
  for (const w of b.warnings.slice(0, 4)) out.push({ text: w, level: "check" });
  if (b.question && !b.question.answer) out.push({ text: `Still to ask: ${b.question.prompt} (${b.question.optionA.name} or ${b.question.optionB.name}). About ${b.question.expectedChange.toFixed(1)} lines depend on it.`, level: "check" });
  for (const l of b.spec.filter((l) => l.confidence === "low" && l.basis !== "literal_fallback").slice(0, 3)) out.push({ text: `Confirm "${l.category}" with the client: the evidence is weak here.`, level: "check" });
  if (b.anatomy) {
    const a = b.anatomy;
    const nm = (id: string) => a.facets.find((f) => f.entity_id === id)?.name ?? id;
    if (a.conflict) out.push({ text: `${nm(a.conflict.a)} and ${nm(a.conflict.b)} pull ${b.input.clientLabel}'s taste in different directions (agreement ${a.conflict.cosine.toFixed(2)}). Bridge rooms: ${(a.bridge?.places ?? []).slice(0, 3).map((p) => p.name).join(", ") || "none found"}.`, level: "check" });
    for (const l of a.stability.lines.filter((x) => x.stable < 0.6)) out.push({ text: `"${l.category}" holds in only ${Math.round(l.stable * 100)}% of resamples of the evidence${l.alternatives[0] ? `; the alternative is ${l.alternatives[0].value}` : ""}.`, level: "check" });
  }
  if (b.influence) {
    const nameOf = (id: string) => b.influence!.references.find((r) => r.entity_id === id)?.name ?? id;
    for (const l of b.influence.lines.filter((x) => !x.robust).slice(0, 3)) {
      out.push({ text: `"${l.category}" changes without ${l.deciders.map(nameOf).join(" or ")}: it hangs on one reference. Worth confirming with ${b.input.clientLabel}.`, level: "check" });
    }
  }
  const layer = b.depth?.find((d) => d.level === (b.appliedDepth ?? 0));
  if (layer?.note) out.push({ text: `${layer.label}: ${layer.note}`, level: "info" });
  if (b.scope && b.scope !== "city") out.push({ text: `The place evidence is ${b.scope === "weighted" ? `weighted toward ${b.input.city}` : "from anywhere"}, not only ${b.input.city}.`, level: "info" });
  if (b.tagMap && Object.keys(b.tagMap.mapped).length) out.push({ text: `${Object.keys(b.tagMap.mapped).length} place terms the lexicon didn't know were mapped by a model; they're labelled "mapped" in the evidence.`, level: "info" });
  for (const [id, f] of Object.entries(b.clientFeedback ?? {})) {
    if (f.reaction === "love") continue;
    const line = b.spec.find((l) => l.id === id);
    if (line) out.push({ text: `${b.input.clientLabel} ${f.reaction === "change" ? "wants to change" : "is unsure about"} "${line.category}"${f.note ? `: “${f.note}”` : "."}`, level: f.reaction === "change" ? "warn" : "check" });
  }
  return out;
}

export function buildDeepBrief(b: Brief): DeepBrief {
  const personalised = b.status === "COMPLETE" || b.status === "NEEDS_CLARIFICATION";
  const ranked = [...b.dimensions].sort((a, c) => c.score - a.score);
  const top = personalised ? ranked.filter((d) => d.score > 0.25).slice(0, 3) : [];
  const [d1, d2] = top;
  const title = d1 ? `${ADJ[d1.id]} ${NOUN[d2 ? d2.id : d1.id === "calm_quiet" ? "low_glow" : "calm_quiet"]}` : "Literal reading";
  const room = ROOM_LABEL[b.input.room];
  const subtitle = `${TRADE_LABEL[b.input.trade]} · ${room} · ${b.input.city}`;
  const decoded = b.words.map((w) => {
    const literal = w.readings.find((r) => r.isDictionaryDefault)?.meaning;
    return { word: w.word, literal, means: w.chosen?.meaning, changed: Boolean(w.chosen && !w.chosen.isDictionaryDefault) };
  });

  const ex = d1?.exemplars.slice(0, 2).map((e) => e.name) ?? [];
  const summary = d1
    ? [
        `${b.input.clientLabel}'s ${room.toLowerCase()} should have ${PHRASE[d1.id]}${d2 ? ` and ${PHRASE[d2.id]}` : ""}.`,
        ex.length ? `People who love what ${b.input.clientLabel} loves choose places like ${ex.join(" and ")}, ${d1.lift.toFixed(1)}× as likely as typical ${b.input.city} places to have ${PHRASE[d1.id]}.` : "",
        decoded.filter((w) => w.means).map((w) => `“${w.word}” here means ${w.means}`).join("; ") + (decoded.some((w) => w.means) ? "." : ""),
      ]
        .filter(Boolean)
        .join(" ")
    : `No usable taste evidence, so this follows the literal reading of “${b.input.words.join("”, “")}”.`;

  // Scenes and the zone × scene table, from the drawn room model (which is the spec drawn).
  const sceneDefs = scenesOf(b.spec);
  const scenes = sceneDefs.map((s) => {
    const v = roomVisual({ spec: b.spec, dims: b.dimensions, trade: b.input.trade, room: b.input.room, scene: s.id });
    return { id: s.id, label: s.label, percent: Math.round(s.level * 100), kelvin: v.kelvin, hex: v.lightRgb, use: SCENE_USE[s.label] ?? "" };
  });

  const templates = ROOM_ZONES[b.input.room];
  const zones: DeepZone[] =
    b.input.trade === "lighting"
      ? templates.map((z) => ({ name: z.name, role: z.role, purpose: z.purpose, guidance: z.guidance, ...zonePlan(z.role, b) }))
      : SURFACES.map((s) => {
          const map: Record<string, [string, string]> = {
            Walls: ["walls", value(b, "walls")],
            Ceiling: ["walls", /single quiet field|across walls and ceiling/.test(value(b, "walls")) ? "Same colour as the walls." : "A lighter tint of the wall colour, matte."],
            "Trim and joinery": ["sheen", value(b, "sheen")],
            Floor: ["material", value(b, "material")],
            Textiles: ["textiles", value(b, "textiles")],
            Metalwork: ["metal", value(b, "metal")],
          };
          const [ref, v] = map[s];
          return { name: s, role: "ambient" as ZoneRole, purpose: "", plan: v, guidance: "", uses: [ref] };
        });
  const sceneTable = b.input.trade === "lighting" ? templates.map((z) => ({ zone: z.name, levels: sceneDefs.map((s) => sceneLevel(b, s.id, z.role)) })) : [];

  const day = roomVisual({ spec: b.spec, dims: b.dimensions, trade: b.input.trade, room: b.input.room, scene: "day" });
  const palette = (Object.entries(day.palette) as [string, string][]).map(([role, hex]) => ({ role: role.charAt(0).toUpperCase() + role.slice(1), hex, name: colourName(hex) }));

  const { depthLabel, refs } = references(b);
  const shopping = b.input.trade === "lighting" ? lightingShopping(b) : finishesShopping(b);
  const checklist = b.input.trade === "lighting" ? lightingChecklist(b) : finishesChecklist(b);

  const note =
    b.narrative ??
    (d1
      ? `Hi ${b.input.clientLabel}, here's the direction for your ${room.toLowerCase()}: “${title}”. ${
          decoded.some((w) => w.means) ? `When you said ${decoded.map((w) => `“${w.word}”`).join(" and ")}, the places people with your taste choose in ${b.input.city} suggest you mean ${decoded.filter((w) => w.means).map((w) => w.means).join(", and ")}. ` : ""
        }Have a look at the reference places and tell me which lines you love and which you're unsure about.`
      : `Hi ${b.input.clientLabel}, here's a first pass for your ${room.toLowerCase()}, based on the words you used. I'd like to learn a little more about what you love before we go further.`);

  const facts = [
    `Client: ${b.input.clientLabel}. Room: ${room} in ${b.input.city}. Trade: ${TRADE_LABEL[b.input.trade]}.`,
    `Client's words: ${b.input.words.join(", ")}.`,
    `Loves (resolved): ${b.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => r.chosen!.name).join(", ") || "none"}.`,
    ...decoded.map((w) => `"${w.word}": dictionary sense "${w.literal ?? "?"}"; evidence favours "${w.means ?? "unmapped"}".`),
    ...top.map((d) => `${DIMENSION_BY_ID[d.id].label} (${PHRASE[d.id]}): ${d.crowdHits}/${d.crowdN} taste-matched vs ${d.baseHits}/${d.baseN} typical places, ${d.lift.toFixed(1)}x lift; examples ${d.exemplars.slice(0, 3).map((e) => e.name).join(", ")}.`),
    ...b.spec.map((l) => `${l.category}: ${l.value}`),
    ...scenes.map((s) => `Scene ${s.label}: ${s.percent}% at ${s.kelvin}K.`),
    ...refs.map((r) => `Reference place: ${r.name}${r.city ? ` (${r.city})` : ""}, ${r.atmospheres.join(" and ")}${r.terms.length ? `, tagged ${r.terms.join(", ")}` : ""}.`),
    `Direction name: ${title}.`,
  ];

  return {
    version: "deep/1",
    personalised,
    title,
    subtitle,
    summary,
    keywords: top.map((d) => DIMENSION_BY_ID[d.id].short),
    decoded,
    scenes,
    sceneTable,
    fixtureFamily: b.input.trade === "lighting" ? stripDot(value(b, "fixtures")) : undefined,
    zones,
    palette,
    references: refs,
    depthLabel,
    shopping,
    checklist,
    risks: risks(b),
    clientNote: note,
    clientNoteSource: b.narrative ? "model" : "template",
    facts,
  };
}
