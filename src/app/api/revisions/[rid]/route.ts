import { NextResponse } from "next/server";
import { jsonError, rateLimited, readJson } from "@/lib/http";
import { currentOwnerHash } from "@/lib/owner";
import { headOf, revisions } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One revision with its semantic diff. Owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ rid: string }> }) {
  const owner = await currentOwnerHash();
  if (!owner) return jsonError("Revision not found.", 404);
  const rev = await revisions.get((await params).rid, owner);
  if (!rev) return jsonError("Revision not found.", 404);
  return NextResponse.json({ revision: rev });
}

/** accept | reject (a proposed revision) or revert (an accepted one: return to the previous version). Owner only. */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  if (rateLimited(req, "revision-decide", 120)) return jsonError("Too many requests.", 429);
  const owner = await currentOwnerHash();
  if (!owner) return jsonError("Revision not found.", 404);
  const body = await readJson<{ action?: string }>(req, 200);
  if (!body.ok) return body.res;
  const status = { accept: "accepted", reject: "rejected", revert: "reverted" }[String(body.value.action)] as "accepted" | "rejected" | "reverted" | undefined;
  if (!status) return jsonError("Action must be accept, reject or revert.", 400);
  const { rid } = await params;
  try {
    const rev = await revisions.decide(rid, owner, status);
    if (!rev) return jsonError("Revision not found.", 404);
    // Returning to a previous version also withdraws any later accepted revision built on top of it.
    if (status === "reverted") for (const later of (await revisions.list(rev.rootBriefId, owner)).filter((x) => x.status === "accepted" && x.createdAt >= rev.createdAt && x.id !== rev.id)) await revisions.decide(later.id, owner, "reverted");
    const list = await revisions.list(rev.rootBriefId, owner);
    return NextResponse.json({ revision: rev, currentBriefId: headOf(rev.rootBriefId, list) });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
