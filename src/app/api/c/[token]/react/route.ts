import { NextResponse } from "next/server";
import { jsonError, rateLimited, readJson, saveWithEvent, WRITE_LIMIT } from "@/lib/http";
import { briefs } from "@/lib/store";
import { clientView, recordReaction, REACTIONS } from "@/lib/share";
import type { ClientReaction } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The client reacts to one line: love it, unsure, or wants it changed (with an optional note). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (rateLimited(req, "client", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const brief = await briefs.byShareToken((await params).token);
  if (!brief) return jsonError("This link has expired or was revoked.", 404);
  const body = await readJson<{ lineId?: string; reaction?: string; note?: string }>(req, 2048);
  if (!body.ok) return body.res;
  const { lineId, reaction, note } = body.value;
  if (typeof lineId !== "string" || !REACTIONS.includes(reaction as ClientReaction["reaction"])) return jsonError("lineId and a reaction (love, unsure, change) are required.");
  try {
    const next = await recordReaction(brief, lineId, reaction as ClientReaction["reaction"], typeof note === "string" ? note : undefined);
    await saveWithEvent(next, "reaction", "client", { lineId, reaction, category: next.spec.find((l) => l.id === lineId)?.category });
    return NextResponse.json({ view: clientView(next) });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err));
  }
}
