import { NextResponse } from "next/server";
import { AgentError } from "@/lib/agent";
import { compileSpec } from "@/lib/compiler";
import { jsonError, loadOwnedBrief, rateLimited, readJson, RUN_LIMIT } from "@/lib/http";
import { QlooError } from "@/lib/qloo/client";
import { ReviseError, runRevision, type Changes } from "@/lib/revise";
import { diffSpecs } from "@/lib/spec-diff";
import { briefs, events, revisions } from "@/lib/store";
import { defaultTagMapper } from "@/lib/tagmap";
import { verifySpec } from "@/lib/verify-spec";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const KEYS = ["replaceLove", "addLove", "removeLove", "words", "cctRange", "criMin", "dimTo", "luxTarget", "sentence", "pin", "removeEvidence"];

/**
 * What if the client changes their mind? Runs the real agent on the modified brief, saves the result as a new
 * brief, and records a PROPOSED revision with its semantic diff. Nothing replaces the current version until the
 * designer accepts it. Owner only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (rateLimited(req, "revise", RUN_LIMIT)) return jsonError("Too many revisions from this address in the last 10 minutes. Try again shortly.", 429);
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const body = await readJson<{ changes?: Changes }>(req, 6000);
  if (!body.ok) return body.res;
  const changes = body.value.changes;
  if (!changes || typeof changes !== "object" || !Object.keys(changes).length) return jsonError("Say what to change.", 400);
  const unknown = Object.keys(changes).filter((k) => !KEYS.includes(k));
  if (unknown.length) return jsonError(`Unknown change: ${unknown.join(", ")}.`, 400);
  try {
    const existing = await revisions.producing(r.brief.id, r.owner);
    const rootBriefId = existing?.rootBriefId ?? r.brief.id;
    const { brief: next } = await runRevision(r.brief, changes, { signal: req.signal, ownerHash: r.owner, tagMapper: defaultTagMapper() });
    await briefs.put(next);
    const before = await compileSpec(r.brief);
    const after = await compileSpec(next, { version: (await revisions.list(rootBriefId, r.owner)).length + 2, parentVersionId: before.versionId });
    const diff = diffSpecs(before, after);
    const verification = await verifySpec(after, { brief: next, previous: before });
    const row = await revisions.create({ rootBriefId, fromBriefId: r.brief.id, toBriefId: next.id, ownerHash: r.owner, changes: changes as Record<string, unknown>, diff, fromVersion: before.versionId, toVersion: after.versionId });
    await events.add(next.id, "created", "agent", { status: next.status, lines: next.spec.length, revisionOf: r.brief.id });
    return NextResponse.json({ revision: row, diff, verification, briefId: next.id });
  } catch (err) {
    if (err instanceof ReviseError) return jsonError(err.message, 400);
    if (err instanceof QlooError) return jsonError(`Qloo couldn't answer (${err.kind}). Nothing was changed.`, 502);
    if (err instanceof AgentError) return jsonError(err.message, 422);
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}
