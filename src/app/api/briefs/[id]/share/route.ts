import { NextResponse } from "next/server";
import { jsonError, loadOwnedBrief, rateLimited, WRITE_LIMIT } from "@/lib/http";
import { briefs, events } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Create or rotate the client link. The token is shown once; only its hash is stored. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "write", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const token = await briefs.share(r.brief.id, r.owner);
  if (!token) return jsonError("Could not create a link.", 500);
  await events.add(r.brief.id, "shared", "designer", {});
  return NextResponse.json({ token, path: `/c/${token}` });
}

/** Revoke the client link: the old URL stops working immediately. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "write", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  await briefs.unshare(r.brief.id, r.owner);
  await events.add(r.brief.id, "unshared", "designer", {});
  return NextResponse.json({ revoked: true });
}
