import { AgentError, runBrief } from "@/lib/agent";
import { getStore, publicView } from "@/lib/store";
import { ensureOwnerHash } from "@/lib/owner";
import { jsonError, rateLimited, readJson, requestId, RUN_LIMIT } from "@/lib/http";
import { log } from "@/lib/env";
import type { AgentEvent, BriefInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Runs the agent and streams its steps as NDJSON; the last line carries the saved brief. */
export async function POST(req: Request) {
  const rid = requestId(req);
  if (rateLimited(req, "run", RUN_LIMIT)) return jsonError("Too many briefs from this address in the last 10 minutes. Try again shortly.", 429);
  const body = await readJson<Partial<BriefInput>>(req);
  if (!body.ok) return body.res;
  const ownerHash = await ensureOwnerHash();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        // req.signal aborts when the browser disconnects or presses Cancel: Qloo and model calls stop.
        const brief = await runBrief(body.value, send, { signal: req.signal, ownerHash });
        const t = Date.now();
        await getStore().put(brief);
        brief.trace.push({ seq: brief.trace.length, state: "PERSIST", tool: `store:${getStore().kind}`, decision: "saved", rationale: getStore().durable ? "durable store" : "non-durable store (configure KV)", inputs: {}, output: { id: brief.id }, validation: getStore().durable ? "pass" : "warn", ms: Date.now() - t, retries: 0, evidence: [] });
        await getStore().put(brief);
        send({ type: "brief", brief: publicView(brief) });
        log("run_ok", { rid, id: brief.id, status: brief.status });
      } catch (err) {
        const state = err instanceof AgentError ? err.state : "FAILED";
        log("run_failed", { rid, state, message: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        send({ type: "error", message: err instanceof Error ? err.message : String(err), state });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Request-Id": rid },
  });
}
