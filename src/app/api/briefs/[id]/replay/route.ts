import { NextResponse } from "next/server";
import { jsonError, loadBrief } from "@/lib/http";
import { replayBrief } from "@/lib/replay";

export const dynamic = "force-dynamic";

/** Rebuild the spec from the brief's stored evidence and compare line by line. No Qloo or model calls. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  return NextResponse.json(await replayBrief(brief));
}
