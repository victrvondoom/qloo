import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/agent";
import { getStore } from "@/lib/store";
import { jsonError, loadBrief } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const { answer } = (await req.json().catch(() => ({}))) as { answer?: string };
  if (answer !== "A" && answer !== "B" && answer !== "neither") return jsonError("answer must be A, B or neither.");
  try {
    const next = await answerQuestion(brief, answer);
    await getStore().put(next);
    return NextResponse.json({ brief: next });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
