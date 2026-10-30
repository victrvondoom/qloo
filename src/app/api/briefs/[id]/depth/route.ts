import { NextResponse } from "next/server";
import { AgentError, transportForBrief } from "@/lib/agent";
import { exploreDepth } from "@/lib/depth";
import { applyDepth } from "@/lib/refine";
import { jsonError, loadOwnedBrief, rateLimited, readJson, saveWithEvent } from "@/lib/http";
import { isLocked } from "@/lib/review";
import { publicView } from "@/lib/store";
import { QlooError } from "@/lib/qloo/client";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Go a level deeper: the same taste question restricted to less popular places
 * (crowd and baseline alike). `apply: true` also rebuilds the spec from that
 * level; `level: 0` with `apply` returns to the main run.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "depth", 40)) return jsonError("Too many depth requests; try again shortly.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const body = await readJson<{ level?: number; apply?: boolean }>(req, 512);
  if (!body.ok) return body.res;
  const level = body.value.level;
  if (level !== 0 && level !== 1 && level !== 2) return jsonError("level must be 0, 1 or 2.");
  if (body.value.apply && isLocked(r.brief)) return jsonError("This version is approved and locked. Propose a revision instead.", 409);
  let brief = r.brief;
  try {
    if (level > 0 && !brief.depth?.some((d) => d.level === level)) {
      const explored = await exploreDepth(brief, level as 1 | 2, transportForBrief(brief), { signal: req.signal });
      brief = explored.brief;
      await saveWithEvent(brief, "depth_explored", "designer", { level, usable: explored.layer.usable, crowdN: explored.layer.crowdN, method: explored.layer.method });
    }
    let changed: string[] = [];
    if (body.value.apply) {
      const applied = await applyDepth(brief, level as 0 | 1 | 2);
      brief = applied.brief;
      changed = applied.changed;
      await saveWithEvent(brief, "depth_applied", "designer", { level, changed });
    }
    return NextResponse.json({ brief: publicView(brief), changed });
  } catch (err) {
    if (err instanceof QlooError) return jsonError(`Qloo couldn't answer for this depth (${err.kind}). Nothing was changed.`, 502);
    if (err instanceof AgentError) return jsonError(err.message, 503);
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
