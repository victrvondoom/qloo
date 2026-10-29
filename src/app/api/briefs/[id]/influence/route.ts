import { NextResponse } from "next/server";
import { AgentError, transportForBrief } from "@/lib/agent";
import { computeInfluence } from "@/lib/influence";
import { jsonError, loadOwnedBrief, rateLimited, saveWithEvent } from "@/lib/http";
import { QlooError } from "@/lib/qloo/client";
import { publicView } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Measure which loves moved which lines (one Qloo query per reference, ledgered). Owner only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "influence", 20)) return jsonError("Too many influence requests; try again shortly.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  try {
    const { brief, influence } = await computeInfluence(r.brief, transportForBrief(r.brief), { signal: req.signal });
    await saveWithEvent(brief, "influence", "designer", { robust: influence.robustLines, lines: influence.lines.length });
    return NextResponse.json({ brief: publicView(brief) });
  } catch (err) {
    if (err instanceof QlooError) return jsonError(`Qloo couldn't answer (${err.kind}). Nothing was changed.`, 502);
    if (err instanceof AgentError) return jsonError(err.message, 503);
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
