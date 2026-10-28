import { AgentError, runBrief } from "@/lib/agent";
import { briefs, events, publicView, storeInfo } from "@/lib/store";
import { ensureOwnerHash } from "@/lib/owner";
import { jsonError, ndjson, rateLimited, readJson, requestId, RUN_LIMIT } from "@/lib/http";
import { defaultTagMapper } from "@/lib/tagmap";
import { log } from "@/lib/env";
import type { AgentEvent, BriefInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Runs the agent and streams its steps (and its growing graph) as NDJSON; the last line carries the saved brief. */
export async function POST(req: Request) {
  const rid = requestId(req);
  if (rateLimited(req, "run", RUN_LIMIT)) return jsonError("Too many briefs from this address in the last 10 minutes. Try again shortly.", 429);
  const body = await readJson<Partial<BriefInput>>(req, 24_000);
  if (!body.ok) return body.res;
  const ownerHash = await ensureOwnerHash();
  return ndjson(rid, async (send: (e: AgentEvent) => void) => {
    try {
      // req.signal aborts when the browser disconnects or presses Cancel: Qloo and model calls stop.
      const brief = await runBrief(body.value, send, { signal: req.signal, ownerHash, tagMapper: defaultTagMapper() });
      const t = Date.now();
      const info = await storeInfo();
      brief.trace.push({
        seq: brief.trace.length,
        state: "PERSIST",
        tool: `db:${info.kind}`,
        decision: "saved",
        rationale: info.durable ? `durable ${info.kind} database` : `${info.kind} database in a temporary location (set DATABASE_URL for durable storage)`,
        inputs: {},
        output: { id: brief.id },
        validation: info.durable ? "pass" : "warn",
        ms: Date.now() - t,
        retries: 0,
        evidence: [],
      });
      await briefs.put(brief);
      await events.add(brief.id, "created", "agent", { status: brief.status, lines: brief.spec.length });
      send({ type: "brief", brief: publicView(brief) });
      log("run_ok", { rid, id: brief.id, status: brief.status });
    } catch (err) {
      const state = err instanceof AgentError ? err.state : "FAILED";
      log("run_failed", { rid, state, message: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      send({ type: "error", message: err instanceof Error ? err.message : String(err), state });
    }
  });
}
