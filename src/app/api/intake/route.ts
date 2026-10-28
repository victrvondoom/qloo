import { NextResponse } from "next/server";
import { jsonError, rateLimited, readJson } from "@/lib/http";
import { groundDraft, parseIntakeHeuristic, type IntakeDraft } from "@/lib/intake";
import { llmAvailable, llmIntake, llmModel } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * One pasted client message → a draft brief. The heuristic parser always runs;
 * with a model key, Claude reads the message too and its draft is grounded
 * (anything not in the message is dropped), then gaps are filled from the
 * heuristic. Nothing is saved and nothing is sent to Qloo here.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "intake", 60)) return jsonError("Too many requests; slow down.", 429);
  const body = await readJson<{ text?: string }>(req, 12_000);
  if (!body.ok) return body.res;
  const text = typeof body.value.text === "string" ? body.value.text.trim() : "";
  if (text.length < 12) return jsonError("Paste the client's message (a sentence or two at least).");
  const heuristic = parseIntakeHeuristic(text);
  if (!llmAvailable()) return NextResponse.json({ draft: heuristic, method: "heuristic", dropped: [] });
  try {
    const raw = await llmIntake(text, AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]));
    const { draft, dropped } = groundDraft(text, raw);
    const merged: IntakeDraft = {
      ...draft,
      city: draft.city || heuristic.city,
      words: draft.words.length ? draft.words : heuristic.words,
      loves: draft.loves.length >= 2 ? draft.loves : [...new Set([...draft.loves, ...heuristic.loves])].slice(0, 10),
      clientLabel: draft.clientLabel !== "Client" ? draft.clientLabel : heuristic.clientLabel,
      room: draft.found.room ? draft.room : heuristic.room,
    };
    merged.notes = [
      ...(merged.city ? [] : ["No city found: add one so the evidence compares with what's typical where they live."]),
      ...(merged.words.length ? [] : ["No style words found (like warm, modern, cozy)."]),
      ...(merged.loves.length >= 2 ? [] : ["Fewer than two things they love."]),
    ];
    merged.found = { city: Boolean(merged.city), room: draft.found.room || heuristic.found.room, words: merged.words.length > 0, loves: merged.loves.length > 0 };
    return NextResponse.json({ draft: merged, method: "model", model: llmModel(), dropped });
  } catch (err) {
    return NextResponse.json({ draft: heuristic, method: "heuristic", dropped: [], note: `Model reading unavailable (${err instanceof Error ? err.message.slice(0, 100) : "error"}); used the built-in parser.` });
  }
}
