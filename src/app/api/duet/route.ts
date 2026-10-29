import { NextResponse } from "next/server";
import { jsonError, loadBrief, rateLimited, readJson } from "@/lib/http";
import { mergeDuet } from "@/lib/studio";

export const dynamic = "force-dynamic";

/** Two people, one room: merge two briefs' measured taste into one spec. Read-only; no Qloo calls. */
export async function POST(req: Request) {
  if (rateLimited(req, "duet", 120)) return jsonError("Too many requests.", 429);
  const body = await readJson<{ a?: string; b?: string }>(req, 512);
  if (!body.ok) return body.res;
  const [a, b] = await Promise.all([loadBrief(String(body.value.a ?? "")), loadBrief(String(body.value.b ?? ""))]);
  if (!a || !b) return jsonError("Both briefs must exist.", 404);
  try {
    return NextResponse.json({ duet: mergeDuet(a, b) });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
