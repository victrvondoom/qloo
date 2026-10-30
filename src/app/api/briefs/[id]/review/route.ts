import { NextResponse } from "next/server";
import { challengeWhyNot } from "@/lib/challenge";
import { compileSpec } from "@/lib/compiler";
import { jsonError, loadOwnedBrief, rateLimited, readJson, saveWithEvent, WRITE_LIMIT } from "@/lib/http";
import { approveSpecification, reviewLine, ReviewError, TRANSITIONS } from "@/lib/review";
import { publicView } from "@/lib/store";
import { verifySpec } from "@/lib/verify-spec";
import type { ReviewAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Review one line (accept, request clarification, propose alternative, reject, reopen) or give final approval.
 * Owner only. An alternative is evaluated by the challenge engine first; an invalid one changes nothing and
 * comes back with the requirements it fails.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "review", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const body = await readJson<{ lineId?: string; action?: string; note?: string; alternative?: string; approve?: boolean }>(req, 4000);
  if (!body.ok) return body.res;
  const b = body.value;
  try {
    const spec = await compileSpec(r.brief);
    const v = await verifySpec(spec, { brief: r.brief });
    if (b.approve) {
      const next = await approveSpecification(r.brief, spec, v, b.note);
      await saveWithEvent(next, "decision", "designer", { approved: spec.versionId });
      return NextResponse.json({ brief: publicView(next) });
    }
    if (typeof b.lineId !== "string" || !(b.action && b.action in TRANSITIONS)) return jsonError("lineId and a valid action are required.", 400);
    let after: string | undefined;
    if (b.action === "propose_alternative") {
      const a = await challengeWhyNot(r.brief, spec, b.lineId, String(b.alternative ?? ""));
      if (a.verdict !== "ALLOWED" || !a.normalised) return NextResponse.json({ error: "That alternative can't be proposed.", answer: a }, { status: 422 });
      after = a.normalised;
    }
    const next = await reviewLine(r.brief, spec, v, { lineId: b.lineId, action: b.action as ReviewAction, note: b.note, after });
    await saveWithEvent(next, "decision", "designer", { lineId: b.lineId, review: b.action });
    return NextResponse.json({ brief: publicView(next) });
  } catch (err) {
    if (err instanceof ReviewError) return jsonError(err.message, 409);
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}
