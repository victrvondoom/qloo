import { runBrief } from "@/lib/agent";
import { getStore } from "@/lib/store";
import { jsonError, rateLimited } from "@/lib/http";
import type { AgentEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Runs the agent and streams its steps as NDJSON; the last line carries the saved brief. */
export async function POST(req: Request) {
  if (rateLimited(req)) return jsonError("Too many briefs from this address in the last 10 minutes. Try again shortly.", 429);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Body must be JSON.");
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const brief = await runBrief(body as Record<string, unknown>, send);
        await getStore().put(brief);
        send({ type: "brief", brief });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
