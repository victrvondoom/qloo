import { NextResponse } from "next/server";
import { recordOutcome } from "@/lib/agent";
import { getStore, publicView } from "@/lib/store";
import { jsonError, loadOwnedBrief, rateLimited, readJson, WRITE_LIMIT } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "write", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const body = await readJson<{ rating?: number; note?: string }>(req, 2048);
  if (!body.ok) return body.res;
  const { rating, note } = body.value;
  if (typeof rating !== "number" || rating < 1 || rating > 5) return jsonError("rating must be 1-5.");
  const next = await recordOutcome(r.brief, rating, typeof note === "string" ? note : undefined);
  await getStore().put(next);
  return NextResponse.json({ brief: publicView(next) });
}
