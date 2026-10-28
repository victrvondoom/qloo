import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { briefs, generations } from "@/lib/store";
import { clientView } from "@/lib/share";
import { buildDeepBrief } from "@/lib/deep/build";
import { applyProse, type DeepProse } from "@/lib/deep/prose";

export const dynamic = "force-dynamic";

/** The client's view of a shared brief. Revoking the link makes this 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const brief = await briefs.byShareToken((await params).token);
  if (!brief) return jsonError("This link has expired or was revoked. Ask your designer for a new one.", 404);
  const prose = await generations.get<DeepProse>(brief.id, "prose");
  // Designer-internal parts (open risks, the raw fact sheet) stay with the designer.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { risks, facts, ...deep } = applyProse(buildDeepBrief(brief), prose?.value);
  return NextResponse.json({ view: clientView(brief), deep }, { headers: { "Cache-Control": "no-store" } });
}
