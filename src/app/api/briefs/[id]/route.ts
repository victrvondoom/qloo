import { NextResponse } from "next/server";
import { jsonError, loadBrief, loadOwnedBrief } from "@/lib/http";
import { getStore, publicView } from "@/lib/store";
import { currentOwnerHash, isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

/** Read by share link (96-bit id). Never returns the owner hash. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  return NextResponse.json({ brief: publicView(brief), canEdit: isOwner(brief.ownerHash, await currentOwnerHash()) });
}

/** Retention control: the owner can delete a brief and its evidence. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  await getStore().delete(r.brief.id, r.owner);
  return NextResponse.json({ deleted: r.brief.id });
}
