// The client's side of a brief. A designer creates a revocable share link; the
// client opening it sees the direction in plain language, the room drawn from
// the spec, the places behind it, and can do exactly two things: answer the
// clarifying question and react to lines. Every client action is ledgered and
// lands in the designer's activity feed.
//
// The view deliberately leaves out the brief id (which is a permanent read
// link), the owner hash, the pasted message, the ledger and the trace, so
// revoking the share link really does end the client's access.

import { DIMENSION_BY_ID } from "./dimensions";
import { Ledger } from "./ledger";
import { ROOM_LABEL, TRADE_LABEL } from "./rulebooks";
import type { Brief, ClientReaction, DimensionId, ReferenceRoom } from "./types";

export interface ClientView {
  clientLabel: string;
  project?: string;
  trade: Brief["input"]["trade"];
  tradeLabel: string;
  room: Brief["input"]["room"];
  roomLabel: string;
  city: string;
  words: string[];
  createdAt: string;
  updatedAt: string;
  status: Brief["status"];
  dataMode: Brief["dataMode"];
  evidenceMode: Brief["evidenceMode"];
  depthLabel: string;
  spec: { id: string; category: string; value: string; proposed: string; why: string; basis: Brief["spec"][number]["basis"]; confidence: Brief["spec"][number]["confidence"]; status: Brief["spec"][number]["status"] }[];
  question?: { prompt: string; optionA: { name: string }; optionB: { name: string }; answer?: "A" | "B" | "neither" };
  narrative?: string;
  atmospheres: { id: DimensionId; label: string; score: number; lift: number; exemplars: string[] }[];
  dims: { id: DimensionId; score: number }[];
  decoded: { word: string; meaning?: string; literal?: string }[];
  references: ReferenceRoom[];
  loves: string[];
  feedback: Record<string, ClientReaction>;
}

export function clientView(b: Brief): ClientView {
  const level = b.appliedDepth ?? 0;
  const layer = b.depth?.find((d) => d.level === level);
  const personalised = b.status === "COMPLETE" || b.status === "NEEDS_CLARIFICATION";
  return {
    clientLabel: b.input.clientLabel,
    project: b.input.project,
    trade: b.input.trade,
    tradeLabel: TRADE_LABEL[b.input.trade],
    room: b.input.room,
    roomLabel: ROOM_LABEL[b.input.room],
    city: b.input.city,
    words: b.input.words,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    status: b.status,
    dataMode: b.dataMode,
    evidenceMode: b.evidenceMode,
    depthLabel: layer?.label ?? "Mainstream",
    spec: b.spec.map((l) => ({
      id: l.id,
      category: l.category,
      value: l.status === "revised" && l.revisedTo ? l.revisedTo : l.value,
      proposed: l.value,
      why: l.why,
      basis: l.basis,
      confidence: l.confidence,
      status: l.status,
    })),
    question: b.question
      ? { prompt: b.question.prompt, optionA: { name: b.question.optionA.name }, optionB: { name: b.question.optionB.name }, answer: b.question.answer }
      : undefined,
    narrative: b.narrative,
    atmospheres: personalised
      ? [...b.dimensions]
          .filter((d) => d.score > 0.15)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((d) => ({ id: d.id, label: DIMENSION_BY_ID[d.id].label, score: d.score, lift: d.lift, exemplars: d.exemplars.slice(0, 3).map((e) => e.name) }))
      : [],
    dims: b.dimensions.map((d) => ({ id: d.id, score: d.score })),
    decoded: b.words.map((w) => ({ word: w.word, meaning: w.chosen?.meaning, literal: w.readings.find((r) => r.isDictionaryDefault)?.meaning })),
    references: personalised ? (layer?.references ?? []).slice(0, 6) : [],
    loves: b.resolutions.filter((r) => r.usedAsSignal && r.chosen).map((r) => r.chosen!.name),
    feedback: b.clientFeedback ?? {},
  };
}

export const REACTIONS: ClientReaction["reaction"][] = ["love", "unsure", "change"];

export async function recordReaction(brief: Brief, lineId: string, reaction: ClientReaction["reaction"], note?: string): Promise<Brief> {
  const line = brief.spec.find((l) => l.id === lineId);
  if (!line) throw new Error("Unknown spec line.");
  if (!REACTIONS.includes(reaction)) throw new Error("Unknown reaction.");
  const clean = note?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 400) || undefined;
  const ledger = new Ledger(brief.ledger);
  await ledger.append("client_input", `Client reacted to ${line.category}: ${reaction}`, { lineId, reaction, value: line.value, note: clean, via: "client" });
  const at = new Date().toISOString();
  return {
    ...brief,
    updatedAt: at,
    clientFeedback: { ...(brief.clientFeedback ?? {}), [lineId]: { reaction, note: clean, at, value: line.value } },
    ledger: ledger.entries,
  };
}
