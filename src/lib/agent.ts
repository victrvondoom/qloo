// The Tastespec agent. It runs a fixed sequence of steps, but makes real choices
// along the way, and records every choice in the ledger:
//   - which Qloo candidate each "love" means, and whether it is safe to use
//   - whether the client's city has enough evidence, or the search must widen
//   - how to read each vague word, given the evidence
//   - whether to ask the client a question, and which one (by simulating
//     both answers and asking only if the spec would change)
// It streams each step to the UI as it happens.

import { Ledger } from "./ledger";
import { computeDimensions, classifyVenue, hasText, applyClientAnswer } from "./fingerprint";
import { DIMENSION_BY_ID } from "./dimensions";
import { HttpTransport, QlooClient, HACKATHON_BASE_URL, type Params, type Transport } from "./qloo/client";
import { FixtureTransport } from "./qloo/fixture";
import { resolveLove } from "./resolve";
import { buildSpec, planQuestion, specMenu } from "./spec";
import { decodeWord, lexiconFor, normaliseWord } from "./words";
import { llmAvailable, llmBaselineSpec, llmMapWord, llmModel, llmNarrative } from "./llm";
import { ROOM_LABEL, TRADE_LABEL } from "./rulebooks";
import type { AgentEvent, Brief, BriefInput, DecodedWord, DimensionScore, LlmBaseline, QlooEntity, Resolution } from "./types";

const PLACE = "urn:entity:place";
const TAKE = 50;
/** Below this many tagged venues, the city is too thin to fingerprint. */
const MIN_TAGGED = Number(process.env.TASTESPEC_MIN_TAGGED ?? 12);

export function makeTransport(): Transport {
  if (process.env.QLOO_MODE === "fixture") return new FixtureTransport();
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_API_KEY is not set. Add it to the environment (or set QLOO_MODE=fixture for synthetic test data).");
  return new HttpTransport(key, process.env.QLOO_BASE_URL || HACKATHON_BASE_URL);
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `b-${Date.now().toString(36)}-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8)}`;
}

export function cleanInput(raw: Partial<BriefInput>): BriefInput {
  const words = (raw.words ?? [])
    .flatMap((w) => String(w).split(/[,/]| and /))
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 1 && w.length < 30)
    .slice(0, 5);
  const loves = (raw.loves ?? [])
    .map((l) => String(l).trim())
    .filter((l) => l.length > 1 && l.length < 80)
    .slice(0, 10);
  return {
    clientLabel: String(raw.clientLabel ?? "Client").trim().slice(0, 40) || "Client",
    trade: raw.trade === "finishes" ? "finishes" : "lighting",
    room: raw.room && raw.room in ROOM_LABEL ? raw.room : "living_room",
    city: String(raw.city ?? "").trim().slice(0, 60),
    words,
    loves,
    pinned: raw.pinned && typeof raw.pinned === "object" ? raw.pinned : undefined,
  };
}

type Emit = (e: AgentEvent) => void;

async function decodeWords(
  words: string[],
  dims: DimensionScore[],
  ledger: Ledger,
  emit: Emit,
  cache: Map<string, Awaited<ReturnType<typeof llmMapWord>>>,
): Promise<DecodedWord[]> {
  const out: DecodedWord[] = [];
  for (const w of words) {
    if (lexiconFor(w)) {
      out.push(decodeWord(w, dims));
      continue;
    }
    const key = normaliseWord(w);
    if (!cache.has(key) && llmAvailable()) {
      try {
        const readings = await llmMapWord(w);
        cache.set(key, readings);
        await ledger.append("llm_call", `Mapped unfamiliar word "${w}" onto dimensions`, { model: llmModel(), word: w, readings });
        emit({ type: "decision", label: `"${w}" isn't in the lexicon`, detail: `Asked ${llmModel()} for its possible readings; the evidence still decides between them.` });
      } catch (err) {
        await ledger.append("llm_call", `Could not map "${w}"`, { error: String(err) });
      }
    }
    const readings = cache.get(key);
    out.push(readings?.length ? decodeWord(w, dims, readings, "llm") : decodeWord(w, dims));
  }
  return out;
}

function auditBaseline(baseline: LlmBaseline, spec: Brief["spec"]): LlmBaseline {
  if (!baseline.lines) return baseline;
  return {
    ...baseline,
    audit: baseline.lines.map((l) => {
      const line = spec.find((s) => s.category === l.category);
      return { category: l.category, llmValue: l.value, evidenceValue: line?.value ?? "", agrees: line?.value === l.value };
    }),
  };
}

export async function runBrief(rawInput: Partial<BriefInput>, emit: Emit): Promise<Brief> {
  const input = cleanInput(rawInput);
  const ledger = new Ledger();
  const warnings: string[] = [];
  const step = (id: string, label: string, status: "running" | "done" | "warn" | "error", detail?: string) =>
    emit({ type: "step", id, label, status, detail });

  if (!input.city) throw new Error("A city is required: the evidence compares the client's taste with what's typical where they live.");
  if (input.loves.length < 2) throw new Error("Give at least two things the client loves.");
  if (input.words.length < 1) throw new Error("Give at least one word the client used.");

  const transport = makeTransport();
  const qloo = new QlooClient(transport, ledger);
  await ledger.append("client_input", `Brief for ${input.clientLabel}: ${TRADE_LABEL[input.trade]}, ${ROOM_LABEL[input.room]}, ${input.city}`, {
    words: input.words,
    loves: input.loves,
    pinned: input.pinned ?? {},
    dataMode: transport.mode,
  });

  // The LLM-only baseline runs alongside the Qloo work; it never sees Qloo data.
  const menu = specMenu(input.trade, input.room);
  const baselinePromise: Promise<LlmBaseline> = llmAvailable()
    ? llmBaselineSpec({ trade: TRADE_LABEL[input.trade], room: ROOM_LABEL[input.room], words: input.words, loves: input.loves, menu })
        .then(async (lines) => {
          await ledger.append("llm_call", "LLM-only baseline: picked spec values from words + loves, no Qloo data", { model: llmModel(), lines });
          return {
            available: true,
            model: llmModel(),
            lines: lines.map((l) => ({ category: menu[l.id].category, value: l.value })),
          };
        })
        .catch(async (err) => {
          await ledger.append("llm_call", "LLM-only baseline failed", { error: String(err) });
          return { available: false, reason: `Baseline call failed: ${String(err).slice(0, 160)}` };
        })
    : Promise.resolve({ available: false, reason: "No ANTHROPIC_API_KEY configured, so the LLM-only comparison was skipped." });

  // 1. Resolve loves
  step("resolve", "Resolving what they love in Qloo's graph", "running");
  const resolutions: Resolution[] = await Promise.all(input.loves.map((l) => resolveLove(qloo, l, input.pinned?.[l])));
  const usable = resolutions.filter((r) => r.chosen && r.status !== "not_found");
  for (const r of resolutions) {
    if (r.status === "ambiguous" || r.status === "not_found") {
      const label = r.status === "not_found" ? `Dropped "${r.input}"` : `"${r.input}" is ambiguous`;
      emit({ type: "decision", label, detail: r.note ?? "" });
      await ledger.append("decision", label, { input: r.input, status: r.status, chosen: r.chosen, similarity: r.similarity, note: r.note });
    }
  }
  if (usable.length === 0) throw new Error("None of the loves could be matched in Qloo. Try more specific names, or add a hint like \"(show)\".");
  step("resolve", "Resolving what they love in Qloo's graph", usable.length < resolutions.length ? "warn" : "done", `${usable.length} of ${resolutions.length} matched`);
  const signalIds = usable.map((r) => r.chosen!.entity_id);

  // 2. Crowd: places their taste neighbourhood chooses
  step("crowd", `Finding the rooms people with this taste choose in ${input.city}`, "running");
  const scopes: { label: string; crowd: Params; base: Params }[] = [
    {
      label: `within ${input.city}`,
      crowd: { "filter.type": PLACE, "signal.interests.entities": signalIds, "filter.location.query": input.city, take: TAKE },
      base: { "filter.type": PLACE, "filter.location.query": input.city, take: TAKE },
    },
    {
      label: `weighted toward ${input.city}`,
      crowd: { "filter.type": PLACE, "signal.interests.entities": signalIds, "signal.location.query": input.city, take: TAKE },
      base: { "filter.type": PLACE, "signal.location.query": input.city, take: TAKE },
    },
    {
      label: "with no location limit",
      crowd: { "filter.type": PLACE, "signal.interests.entities": signalIds, take: TAKE },
      base: { "filter.type": PLACE, "signal.location.query": input.city, take: TAKE },
    },
  ];
  let crowdRaw: QlooEntity[] = [];
  let scope = scopes[0];
  for (const s of scopes) {
    scope = s;
    try {
      crowdRaw = await qloo.insightsEntities(s.crowd, `Taste-matched places ${s.label}`);
    } catch (err) {
      crowdRaw = [];
      await ledger.append("decision", `Scope "${s.label}" failed`, { error: String(err) });
    }
    const tagged = crowdRaw.filter(hasText).length;
    if (tagged >= MIN_TAGGED) break;
    if (s !== scopes.at(-1)) {
      const detail = `Only ${tagged} tagged places ${s.label}; widening the search so the fingerprint isn't built on noise.`;
      emit({ type: "decision", label: "Not enough local evidence", detail });
      await ledger.append("decision", "Widened search scope", { from: s.label, taggedPlaces: tagged, minimum: MIN_TAGGED });
    }
  }
  // A loved place can't be evidence for itself.
  const crowd = crowdRaw.filter((e) => hasText(e) && !signalIds.includes(e.entity_id)).map(classifyVenue);
  step("crowd", `Finding the rooms people with this taste choose in ${input.city}`, crowd.length < MIN_TAGGED ? "warn" : "done", `${crowd.length} tagged places ${scope.label}`);
  if (crowd.length < MIN_TAGGED) warnings.push(`Thin evidence: only ${crowd.length} tagged places matched this taste. Treat the spec as a starting point.`);

  // 3. Base: what's typical in the same scope, and cross-domain taste tags
  step("base", `Measuring what's typical in ${input.city} (no taste signal)`, "running");
  step("tags", "Reading cross-domain taste tags (music, film, books…)", "running");
  const [baseRaw, tasteTags] = await Promise.all([
    qloo.insightsEntities(scope.base, `City baseline ${scope.label}`).catch(async (err) => {
      await ledger.append("decision", "Baseline query failed", { error: String(err) });
      return [] as QlooEntity[];
    }),
    qloo.insightsTags({ "signal.interests.entities": signalIds, take: 40 }, "Cross-domain taste tags").catch(async (err) => {
      await ledger.append("decision", "Taste-tag query failed; continuing on places only", { error: String(err) });
      return [];
    }),
  ]);
  const base = baseRaw.filter(hasText).map(classifyVenue);
  step("base", `Measuring what's typical in ${input.city} (no taste signal)`, base.length < MIN_TAGGED ? "warn" : "done", `${base.length} tagged places`);
  step("tags", "Reading cross-domain taste tags (music, film, books…)", "done", `${tasteTags.length} tags`);
  if (base.length < MIN_TAGGED) warnings.push(`Thin baseline: only ${base.length} tagged places in the comparison set, so lifts are less certain.`);

  // 4. Fingerprint
  step("fingerprint", "Computing the atmosphere fingerprint (lift vs. city)", "running");
  const dims = computeDimensions(crowd, base, tasteTags);
  await ledger.append("computation", "Atmosphere fingerprint", {
    method: "Beta(1,1) posterior lift of crowd share over baseline share; score = clamp(log2(lift)/1.5)·|2P−1| + capped taste-tag boost",
    crowdN: crowd.length,
    baseN: base.length,
    dimensions: dims.map((d) => ({ id: d.id, crowd: `${d.crowdHits}/${d.crowdN}`, base: `${d.baseHits}/${d.baseN}`, lift: +d.lift.toFixed(3), pGreater: +d.pGreater.toFixed(3), score: +d.score.toFixed(3) })),
  });
  const top = [...dims].sort((a, b) => b.score - a.score).slice(0, 2);
  step("fingerprint", "Computing the atmosphere fingerprint (lift vs. city)", "done", top.map((d) => `${DIMENSION_BY_ID[d.id].short} ×${d.lift.toFixed(1)}`).join(", "));

  // 5. Words
  step("words", `Decoding "${input.words.join('", "')}"`, "running");
  const wordCache = new Map<string, Awaited<ReturnType<typeof llmMapWord>>>();
  const words = await decodeWords(input.words, dims, ledger, emit, wordCache);
  for (const w of words) {
    if (!w.known) warnings.push(`"${w.word}" couldn't be mapped to an atmosphere, so it doesn't affect the spec.`);
    else if (w.chosen && !w.chosen.isDictionaryDefault) {
      const literal = w.readings.find((r) => r.isDictionaryDefault);
      emit({ type: "decision", label: `"${w.word}" doesn't mean what it says`, detail: `Evidence favours "${w.chosen.meaning}" (${Math.round(w.chosen.weight * 100)}%) over the literal "${literal?.meaning}".` });
    }
  }
  await ledger.append("computation", "Decoded client words", {
    words: words.map((w) => ({ word: w.word, source: w.source, chosen: w.chosen?.dimension, readings: w.readings.map((r) => ({ d: r.dimension, w: +r.weight.toFixed(3) })) })),
  });
  step("words", `Decoding "${input.words.join('", "')}"`, "done", words.map((w) => `${w.word} → ${w.chosen ? DIMENSION_BY_ID[w.chosen.dimension].short : "unmapped"}`).join("; "));

  // 6. Spec
  step("spec", `Drafting the ${TRADE_LABEL[input.trade].toLowerCase()} spec`, "running");
  const spec = buildSpec(input.trade, input.room, dims, words, input.words);
  const diffs = spec.filter((l) => l.value !== l.literalValue).length;
  await ledger.append("computation", "Spec drafted from rulebook", {
    trade: input.trade,
    room: input.room,
    lines: spec.map((l) => ({ id: l.id, value: l.value, confidence: l.confidence, drivers: l.evidence.map((e) => e.dimension) })),
    differsFromLiteralReading: diffs,
  });
  step("spec", `Drafting the ${TRADE_LABEL[input.trade].toLowerCase()} spec`, "done", `${spec.length} lines, ${diffs} differ from the literal reading`);

  // 7. Question planning
  step("question", "Deciding whether one question would change the spec", "running");
  const rescore = (d: DimensionScore[]) => input.words.map((w) => {
    const cached = wordCache.get(normaliseWord(w));
    return cached?.length ? decodeWord(w, d, cached, "llm") : decodeWord(w, d);
  });
  const question = planQuestion(input.trade, input.room, dims, crowd, rescore, input.clientLabel, input.words);
  if (question) {
    await ledger.append("decision", "Planned a clarifying question", {
      contrast: [question.dimension, question.versus],
      optionA: question.optionA,
      optionB: question.optionB,
      linesThatDependOnAnswer: question.expectedImpact,
    });
    step("question", "Deciding whether one question would change the spec", "done", `Yes: the answer moves ${question.expectedImpact} lines`);
  } else {
    await ledger.append("decision", "No clarifying question", { reason: "No single contrast would change two or more spec lines, or no real venue pair was available." });
    step("question", "Deciding whether one question would change the spec", "done", "Not needed");
  }

  // 8. LLM-only audit
  step("baseline", "Auditing an LLM-only answer against the evidence", "running");
  const baseline = auditBaseline(await baselinePromise, spec);
  if (baseline.audit) {
    const agree = baseline.audit.filter((a) => a.agrees).length;
    step("baseline", "Auditing an LLM-only answer against the evidence", "done", `Agrees on ${agree} of ${baseline.audit.length} lines`);
  } else {
    step("baseline", "Auditing an LLM-only answer against the evidence", "warn", baseline.reason);
  }

  // 9. Client note (optional, may only restate evidence)
  let narrative: string | undefined;
  if (llmAvailable()) {
    step("note", "Writing the note to the client", "running");
    const facts = [
      `Client: ${input.clientLabel}. Room: ${ROOM_LABEL[input.room]} in ${input.city}. They said: ${input.words.join(", ")}.`,
      `They love: ${usable.map((r) => r.chosen!.name).join(", ")}.`,
      ...words.filter((w) => w.chosen).map((w) => `When they say "${w.word}", the evidence suggests they mean: ${w.chosen!.meaning}.`),
      ...top.map((d) => `Places people with their taste choose are ${d.lift.toFixed(1)}x as likely as typical ${input.city} places to be "${DIMENSION_BY_ID[d.id].label.toLowerCase()}", e.g. ${d.exemplars.slice(0, 2).map((e) => e.name).join(" and ")}.`),
      ...spec.slice(0, 3).map((l) => `${l.category}: ${l.value}`),
    ].join("\n");
    try {
      narrative = await llmNarrative(facts);
      await ledger.append("llm_call", "Client note written from evidence facts only", { model: llmModel(), facts, note: narrative });
      step("note", "Writing the note to the client", "done");
    } catch (err) {
      await ledger.append("llm_call", "Client note failed", { error: String(err) });
      step("note", "Writing the note to the client", "warn", "Skipped");
    }
  }

  const now = new Date().toISOString();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    input,
    dataMode: transport.mode,
    resolutions,
    crowdVenues: crowd,
    baseVenues: base,
    dimensions: dims,
    words,
    spec,
    question,
    llmBaseline: baseline,
    narrative,
    warnings,
    ledger: ledger.entries,
  };
}

/** Apply the client's answer: no new Qloo calls, just an explicit signal. */
export async function answerQuestion(brief: Brief, answer: "A" | "B" | "neither"): Promise<Brief> {
  if (!brief.question) throw new Error("This brief has no question.");
  if (brief.question.answer) throw new Error("The question was already answered.");
  const ledger = new Ledger(brief.ledger);
  const q = brief.question;
  let dims = brief.dimensions;
  if (answer !== "neither") {
    const chosen = answer === "A" ? q.optionA : q.optionB;
    const rejected = answer === "A" ? q.optionB : q.optionA;
    dims = applyClientAnswer(dims, chosen.carries, rejected.carries);
  }
  await ledger.append("client_input", `Client answered: ${answer === "neither" ? "neither" : answer === "A" ? q.optionA.name : q.optionB.name}`, {
    answer,
    contrast: [q.dimension, q.versus],
  });
  const words = brief.words.map((w) => {
    const readings = w.source === "llm" ? w.readings.map((r) => ({ dimension: r.dimension, meaning: r.meaning, isDictionaryDefault: r.isDictionaryDefault })) : undefined;
    return decodeWord(w.word, dims, readings, w.source === "llm" ? "llm" : "lexicon");
  });
  const spec = buildSpec(brief.input.trade, brief.input.room, dims, words, brief.input.words, brief.spec);
  const changed = spec.filter((l) => brief.spec.find((p) => p.id === l.id)?.value !== l.value).map((l) => l.category);
  await ledger.append("computation", "Re-scored after client answer", {
    dimensions: dims.filter((d) => d.clientAdjusted).map((d) => ({ id: d.id, score: +d.score.toFixed(3), adjusted: +(d.clientAdjusted ?? 0).toFixed(3) })),
    changedLines: changed,
  });
  return {
    ...brief,
    updatedAt: new Date().toISOString(),
    dimensions: dims,
    words,
    spec,
    question: { ...q, answer },
    llmBaseline: auditBaseline(brief.llmBaseline, spec),
    ledger: ledger.entries,
  };
}

export async function recordDecision(
  brief: Brief,
  lineId: string,
  status: "accepted" | "revised" | "proposed",
  revisedTo?: string,
  note?: string,
): Promise<Brief> {
  const line = brief.spec.find((l) => l.id === lineId);
  if (!line) throw new Error("Unknown spec line.");
  const ledger = new Ledger(brief.ledger);
  const clean = (s?: string) => (s ? s.trim().slice(0, 300) : undefined);
  await ledger.append("client_input", `${line.category}: ${status}${revisedTo ? ` → "${clean(revisedTo)}"` : ""}`, {
    lineId,
    status,
    proposed: line.value,
    revisedTo: clean(revisedTo),
    note: clean(note),
    confidence: line.confidence,
  });
  return {
    ...brief,
    updatedAt: new Date().toISOString(),
    spec: brief.spec.map((l) => (l.id === lineId ? { ...l, status, revisedTo: status === "revised" ? clean(revisedTo) : undefined, note: clean(note) } : l)),
    ledger: ledger.entries,
  };
}

export async function recordOutcome(brief: Brief, rating: number, note?: string): Promise<Brief> {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  const ledger = new Ledger(brief.ledger);
  const clean = note?.trim().slice(0, 500);
  await ledger.append("client_input", `Outcome recorded: ${r}/5`, { rating: r, note: clean });
  return { ...brief, updatedAt: new Date().toISOString(), outcome: { rating: r, note: clean, at: new Date().toISOString() }, ledger: ledger.entries };
}
