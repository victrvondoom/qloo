import { NextResponse } from "next/server";
import { loadOwnedBrief } from "@/lib/http";
import { events } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The brief's activity feed (owner only). Poll with ?after=<last id>. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  const list = await events.since(r.brief.id, Number.isFinite(after) ? after : 0, 100);
  return NextResponse.json({ events: list, updatedAt: r.brief.updatedAt }, { headers: { "Cache-Control": "no-store" } });
}
