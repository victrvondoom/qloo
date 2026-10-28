import { NextResponse } from "next/server";
import { buildDeepBrief } from "@/lib/deep/build";
import { factsKey, writeProse, type DeepProse } from "@/lib/deep/prose";
import { jsonError, loadBrief, loadOwnedBrief, ndjson, rateLimited, requestId } from "@/lib/http";
import { jsonCall, llmAvailable, llmModel } from "@/lib/llm";
import { events, generations } from "@/lib/store";
import { log } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** The cached Claude prose for this brief, if any, and whether it still matches the brief. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const cached = await generations.get<DeepProse>(brief.id, "prose");
  const key = factsKey(buildDeepBrief(brief).facts);
  return NextResponse.json({ prose: cached?.value ?? null, current: cached ? cached.value.key === key : false, llm: llmAvailable() ? llmModel() : null });
}

/**
 * Write the prose layer with Claude (owner only): three grounded pieces in
 * parallel, streamed as each finishes. The deterministic deep brief needs no
 * call and is complete without this.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "prose", 20)) return jsonError("Too many prose requests; try again shortly.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  if (!llmAvailable()) return jsonError("Claude prose needs ANTHROPIC_API_KEY on the server. The deep brief is complete without it.", 501);
  const rid = requestId(req);
  const deep = buildDeepBrief(r.brief);
  return ndjson(rid, async (send) => {
    send({ type: "start", fields: ["direction", "clientNote", "references"], facts: deep.facts.length });
    try {
      const prose = await writeProse(deep, jsonCall, llmModel(), (f) => send({ type: "field", ...f }), AbortSignal.any([req.signal, AbortSignal.timeout(50_000)]));
      await generations.put(r.brief.id, "prose", prose.model, prose);
      await events.add(r.brief.id, "prose_written", "agent", { fields: prose.fields.map((f) => `${f.field}:${f.status}`) });
      send({ type: "prose", prose });
      log("prose_ok", { rid, id: r.brief.id, fields: prose.fields.map((f) => f.status) });
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
}
