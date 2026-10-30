import { NextResponse } from "next/server";
import { jsonError, loadOwnedBrief } from "@/lib/http";
import { headOf, revisions } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The owner's revisions for a project, oldest first, and which brief is current. Pass any brief in the chain. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const producing = await revisions.producing(r.brief.id, r.owner);
  const root = producing?.rootBriefId ?? r.brief.id;
  const list = await revisions.list(root, r.owner);
  if (!list.length && root !== r.brief.id) return jsonError("No revisions found.", 404);
  return NextResponse.json({ rootBriefId: root, currentBriefId: headOf(root, list), revisions: list });
}
