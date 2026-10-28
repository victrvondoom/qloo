import { NextResponse } from "next/server";
import { jsonError, loadBrief, loadOwnedBrief } from "@/lib/http";
import { briefs, publicView } from "@/lib/store";
import { currentOwnerHash, isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

/** Read by link (96-bit id, read-only). Never returns the owner hash or the pasted message. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const canEdit = isOwner(brief.ownerHash, await currentOwnerHash());
  return NextResponse.json({ brief: canEdit ? { ...publicView(brief), input: brief.input } : publicView(brief), canEdit, shared: canEdit ? await briefs.isShared(brief.id) : undefined });
}

/** Retention control: the owner can delete a brief, its evidence, activity and generated text. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  await briefs.delete(r.brief.id, r.owner);
  return NextResponse.json({ deleted: r.brief.id });
}
