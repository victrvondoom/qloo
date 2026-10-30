import { NextResponse } from "next/server";
import { recordDecision } from "@/lib/agent";
import { publicView } from "@/lib/store";
import { jsonError, loadOwnedBrief, rateLimited, readJson, saveWithEvent, WRITE_LIMIT } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "write", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  if (r.brief.review?.approval) return jsonError("This version is approved and locked. Make a revision to change it.", 409);
  const body = await readJson<{ lineId?: string; status?: string; revisedTo?: string; note?: string }>(req, 4096);
  if (!body.ok) return body.res;
  const b = body.value;
  if (typeof b.lineId !== "string" || !["accepted", "revised", "proposed"].includes(b.status ?? "")) return jsonError("lineId and a valid status are required.");
  if (b.status === "revised" && !(typeof b.revisedTo === "string" && b.revisedTo.trim())) return jsonError("Say what the line was revised to.");
  try {
    const next = await recordDecision(r.brief, b.lineId, b.status as "accepted" | "revised" | "proposed", b.revisedTo, typeof b.note === "string" ? b.note : undefined);
    await saveWithEvent(next, "decision", "designer", { lineId: b.lineId, status: b.status });
    return NextResponse.json({ brief: publicView(next) });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err));
  }
}
