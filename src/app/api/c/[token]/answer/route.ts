import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/agent";
import { jsonError, rateLimited, readJson, saveWithEvent, WRITE_LIMIT } from "@/lib/http";
import { briefs } from "@/lib/store";
import { clientView } from "@/lib/share";

export const dynamic = "force-dynamic";

/** The client answers the clarifying question on their link. The spec re-scores; the designer sees it live. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (rateLimited(req, "client", WRITE_LIMIT)) return jsonError("Too many changes; slow down.", 429);
  const brief = await briefs.byShareToken((await params).token);
  if (!brief) return jsonError("This link has expired or was revoked.", 404);
  const body = await readJson<{ answer?: string }>(req, 512);
  if (!body.ok) return body.res;
  const answer = body.value.answer;
  if (answer !== "A" && answer !== "B" && answer !== "neither") return jsonError("answer must be A, B or neither.");
  try {
    const before = brief.spec.map((l) => l.value);
    const next = await answerQuestion(brief, answer, "client");
    const changed = next.spec.filter((l, i) => l.value !== before[i]).map((l) => l.category);
    await saveWithEvent(next, "answered", "client", { answer, changed });
    return NextResponse.json({ view: clientView(next), changed });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
