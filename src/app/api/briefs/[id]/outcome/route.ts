import { NextResponse } from "next/server";
import { recordOutcome } from "@/lib/agent";
import { getStore } from "@/lib/store";
import { jsonError, loadBrief } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const body = (await req.json().catch(() => ({}))) as { rating?: number; note?: string };
  if (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5) return jsonError("rating must be 1-5.");
  const next = await recordOutcome(brief, body.rating, body.note);
  await getStore().put(next);
  return NextResponse.json({ brief: next });
}
