import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/agent";
import { getStore, publicView } from "@/lib/store";
import { jsonError, loadOwnedBrief, rateLimited, readJson, WRITE_LIMIT } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "write", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const body = await readJson<{ answer?: string }>(req, 1024);
  if (!body.ok) return body.res;
  const answer = body.value.answer;
  if (answer !== "A" && answer !== "B" && answer !== "neither") return jsonError("answer must be A, B or neither.");
  try {
    const next = await answerQuestion(r.brief, answer);
    await getStore().put(next);
    return NextResponse.json({ brief: publicView(next) });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
