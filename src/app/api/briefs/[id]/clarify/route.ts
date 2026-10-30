import { NextResponse } from "next/server";
import { explainClarification } from "@/lib/clarify";
import { jsonError, loadOwnedBrief } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Why the agent asked the question it asked (or none), which lines each answer changes, and what it held back. Owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  if (r.brief.status !== "COMPLETE" && r.brief.status !== "NEEDS_CLARIFICATION") return jsonError("No usable evidence, so there is nothing to clarify.", 409);
  return NextResponse.json(explainClarification(r.brief));
}
