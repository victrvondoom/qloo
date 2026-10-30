// The professional review board: a per-line review state machine and a final human
// approval, kept on the brief with the evidence ledger. An AI recommendation is
// never approved by default: every line starts DRAFT or NEEDS_REVIEW and only a
// human action moves it. Approval means a person reviewed this exact version; it
// is not a professional certification, and it locks the version (changes become a
// new revision).

import { recordDecision } from "./agent";
import type { CompiledSpec } from "./compiler";
import { Ledger } from "./ledger";
import type { Verification } from "./verify-spec";
import type { Brief, ReviewAction, ReviewBoard, ReviewEntry, ReviewState } from "./types";

export const TRANSITIONS: Record<ReviewAction, { from: ReviewState[]; to: ReviewState; needsNote?: boolean }> = {
  accept: { from: ["DRAFT", "NEEDS_REVIEW", "REVISION_REQUESTED"], to: "APPROVED" },
  request_clarification: { from: ["DRAFT", "NEEDS_REVIEW", "APPROVED"], to: "REVISION_REQUESTED", needsNote: true },
  propose_alternative: { from: ["DRAFT", "NEEDS_REVIEW", "REVISION_REQUESTED"], to: "NEEDS_REVIEW" },
  reject: { from: ["DRAFT", "NEEDS_REVIEW", "APPROVED", "REVISION_REQUESTED"], to: "REJECTED", needsNote: true },
  reopen: { from: ["REJECTED", "APPROVED", "REVISION_REQUESTED"], to: "NEEDS_REVIEW" },
};

export class ReviewError extends Error {}

export const isLocked = (b: Pick<Brief, "review">) => Boolean(b.review?.approval);

/** The state of a line: its last review action, or where it starts (NEEDS_REVIEW if verification has something open on it). */
export function lineStates(brief: Pick<Brief, "review" | "spec">, v: Verification): Record<string, ReviewState> {
  const out: Record<string, ReviewState> = {};
  for (const l of brief.spec) {
    const last = [...(brief.review?.entries ?? [])].reverse().find((e) => e.lineId === l.id);
    out[l.id] = last ? last.to : v.diagnostics.some((d) => d.lineId === l.id && (d.severity === "ERROR" || d.severity === "NEEDS_REVIEW")) ? "NEEDS_REVIEW" : "DRAFT";
  }
  return out;
}

export interface ReviewInput {
  lineId: string;
  action: ReviewAction;
  note?: string;
  /** For propose_alternative: the already evaluated, allowed value to record. */
  after?: string;
}

/** Applies one review action. Pure with respect to storage: returns the new brief. Throws ReviewError for impossible transitions. */
export async function reviewLine(brief: Brief, spec: CompiledSpec, v: Verification, input: ReviewInput): Promise<Brief> {
  if (isLocked(brief)) throw new ReviewError("This version is approved and locked. Make a revision to change it.");
  const line = spec.lines.find((l) => l.id === input.lineId);
  if (!line) throw new ReviewError("That line is not in this specification.");
  const rule = TRANSITIONS[input.action];
  if (!rule) throw new ReviewError("Unknown review action.");
  const state = lineStates(brief, v)[input.lineId];
  if (!rule.from.includes(state)) throw new ReviewError(`A line that is ${state.replace(/_/g, " ").toLowerCase()} can't be ${input.action.replace(/_/g, " ")}ed. Allowed from: ${rule.from.join(", ")}.`);
  const note = input.note?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 400);
  if (rule.needsNote && !note) throw new ReviewError("Give a reason.");
  if (input.action === "accept" && v.diagnostics.some((d) => d.lineId === input.lineId && d.severity === "ERROR")) throw new ReviewError("This line has verification errors. Repair it or reject it; it can't be accepted as it is.");
  let next = brief;
  if (input.action === "propose_alternative") {
    if (!input.after) throw new ReviewError("An alternative must be evaluated and allowed before it can be proposed.");
    next = await recordDecision(brief, input.lineId, "revised", input.after, note ?? "Designer alternative");
  }
  const ledger = new Ledger(next.ledger);
  const entry: ReviewEntry = {
    seq: (brief.review?.entries.length ?? 0),
    at: new Date().toISOString(),
    lineId: input.lineId,
    category: line.category,
    action: input.action,
    from: state,
    to: rule.to,
    specVersionId: spec.versionId,
    before: line.requirement,
    ...(input.after ? { after: input.after } : {}),
    ...(note ? { note } : {}),
    verification: v.documentStatus,
    evidenceIds: line.evidenceIds,
    findings: v.diagnostics.filter((d) => d.lineId === input.lineId && d.severity !== "PASS").map((d) => `${d.severity}: ${d.code}`),
  };
  const e = await ledger.append("decision", `Review: ${input.action.replace(/_/g, " ")} · ${line.category} (${state} → ${rule.to})`, { lineId: input.lineId, action: input.action, from: state, to: rule.to, specVersionId: spec.versionId, note, after: input.after });
  entry.ledgerSeq = e.seq;
  const board: ReviewBoard = { ...(next.review ?? { entries: [] }), entries: [...(next.review?.entries ?? []), entry] };
  return { ...next, updatedAt: entry.at, review: board, ledger: ledger.entries };
}

/** Final approval of this exact version by a human. Every line must be approved and verification must have no errors. */
export async function approveSpecification(brief: Brief, spec: CompiledSpec, v: Verification, note?: string): Promise<Brief> {
  if (isLocked(brief)) throw new ReviewError("This version is already approved.");
  const states = lineStates(brief, v);
  const open = Object.entries(states).filter(([, s]) => s !== "APPROVED").map(([id]) => spec.lines.find((l) => l.id === id)?.category ?? id);
  if (open.length) throw new ReviewError(`Every line must be approved first. Still open: ${open.join(", ")}.`);
  if (v.counts.ERROR > 0) throw new ReviewError(`Verification has ${v.counts.ERROR} error(s). Repair them before approving.`);
  const ledger = new Ledger(brief.ledger);
  const at = new Date().toISOString();
  const clean = note?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 400);
  const e = await ledger.append("decision", `Specification approved by a human reviewer (version ${spec.versionId})`, { specVersionId: spec.versionId, note: clean, notACertification: true });
  return { ...brief, updatedAt: at, review: { ...(brief.review ?? { entries: [] }), approval: { at, specVersionId: spec.versionId, ...(clean ? { note: clean } : {}), ledgerSeq: e.seq } }, ledger: ledger.entries };
}

/** Approval is valid only for the version it was given to. */
export const approvalValid = (b: Pick<Brief, "review">, versionId: string) => b.review?.approval?.specVersionId === versionId;
