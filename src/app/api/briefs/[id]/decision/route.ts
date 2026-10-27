import { NextResponse } from "next/server";
import { recordDecision } from "@/lib/agent";
import { getStore } from "@/lib/store";
import { jsonError, loadBrief } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const body = (await req.json().catch(() => ({}))) as { lineId?: string; status?: string; revisedTo?: string; note?: string };
  if (!body.lineId || !["accepted", "revised", "proposed"].includes(body.status ?? "")) return jsonError("lineId and a valid status are required.");
  if (body.status === "revised" && !body.revisedTo?.trim()) return jsonError("Say what the line was revised to.");
  try {
    const next = await recordDecision(brief, body.lineId, body.status as "accepted" | "revised" | "proposed", body.revisedTo, body.note);
    await getStore().put(next);
    return NextResponse.json({ brief: next });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err));
  }
}
