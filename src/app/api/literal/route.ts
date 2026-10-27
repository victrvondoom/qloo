import { NextResponse } from "next/server";
import { computeLiteral } from "@/lib/agent";
import { jsonError, rateLimited, readJson } from "@/lib/http";
import { RULEBOOK_VERSION } from "@/lib/rulebooks";
import type { BriefInput } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * B0, computed fresh: the spec from the client's words and hard constraints
 * only, through the same rulebook, with no Qloo call. The Proof Lab's
 * "Without Qloo" control uses this, so the comparison is computed, not stored.
 */
export async function POST(req: Request) {
  if (rateLimited(req, "literal", 200)) return jsonError("Too many requests.", 429);
  const body = await readJson<BriefInput>(req, 8192);
  if (!body.ok) return body.res;
  return NextResponse.json({ system: "B0 literal (no Qloo)", rulebookVersion: RULEBOOK_VERSION, computedAt: new Date().toISOString(), qlooCalls: 0, lines: computeLiteral(body.value) });
}
