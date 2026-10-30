import { NextResponse } from "next/server";
import { AgentError, recordDecision } from "@/lib/agent";
import { approvedValue, challengeProve, challengeRepair, challengeWhy, challengeWhyNot, ChallengeError } from "@/lib/challenge";
import { compileSpec } from "@/lib/compiler";
import { jsonError, loadOwnedBrief, rateLimited, readJson, RUN_LIMIT, saveWithEvent, WRITE_LIMIT } from "@/lib/http";
import { QlooError } from "@/lib/qloo/client";
import { isLocked } from "@/lib/review";
import { proposeRevision } from "@/lib/revision-service";
import { ReviseError, type Changes } from "@/lib/revise";
import { publicView } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface Body {
  op?: string;
  lineId?: string;
  alternative?: string;
  mode?: string;
  changes?: Changes;
  note?: string;
}

/**
 * Challenge one specification line. why | why_not | prove | repair compute from the real decision record and change
 * nothing. apply records a designer revision (ledgered) for an evaluated alternative or repair, and only if the
 * version isn't approved. what_if reruns the agent on a changed brief and proposes a revision. Owner only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJson<Body>(req, 6000);
  if (!body.ok) return body.res;
  const b = body.value && typeof body.value === "object" ? body.value : ({} as Body);
  if (rateLimited(req, b.op === "what_if" ? "revise" : "challenge", b.op === "what_if" ? RUN_LIMIT : WRITE_LIMIT)) return jsonError("Too many challenges; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  try {
    if (b.op === "what_if") {
      if (!b.changes || typeof b.changes !== "object" || !Object.keys(b.changes).length) return jsonError("Say what to change.", 400);
      return NextResponse.json({ op: "what_if", ...(await proposeRevision(r.brief, r.owner, b.changes, req.signal)) });
    }
    if (typeof b.lineId !== "string") return jsonError("Name the specification line.", 400);
    const spec = await compileSpec(r.brief);
    if (b.op === "why") return NextResponse.json(await challengeWhy(r.brief, spec, b.lineId));
    if (b.op === "why_not") return NextResponse.json(await challengeWhyNot(r.brief, spec, b.lineId, String(b.alternative ?? "")));
    if (b.op === "prove") return NextResponse.json(await challengeProve(r.brief, spec, b.lineId));
    if (b.op === "repair") return NextResponse.json(await challengeRepair(r.brief, spec, b.lineId));
    if (b.op === "apply") {
      if (isLocked(r.brief)) return jsonError("This version is approved and locked. Propose a revision instead.", 409);
      const mode = b.mode === "repair" ? "repair" : "alternative";
      const value = await approvedValue(r.brief, spec, b.lineId, String(b.alternative ?? ""), mode);
      const note = `${mode === "repair" ? "Repair applied" : "Alternative applied"} after a challenge${typeof b.note === "string" && b.note.trim() ? `: ${b.note.trim()}` : ""}`;
      const next = await recordDecision(r.brief, b.lineId, "revised", value, note);
      await saveWithEvent(next, "decision", "designer", { lineId: b.lineId, status: "revised", via: "challenge" });
      return NextResponse.json({ applied: value, brief: publicView(next) });
    }
    return jsonError("Unknown challenge. Use why, why_not, prove, repair, apply or what_if.", 400);
  } catch (err) {
    if (err instanceof ChallengeError || err instanceof ReviseError) return jsonError(err.message, 400);
    if (err instanceof QlooError) return jsonError(`Qloo couldn't answer (${err.kind}). Nothing was changed.`, 502);
    if (err instanceof AgentError) return jsonError(err.message, 422);
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}
