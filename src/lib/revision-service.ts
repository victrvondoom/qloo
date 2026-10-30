// Proposes a revision: runs the real agent on the modified brief, saves the result as a new brief,
// and records a PROPOSED revision with its semantic diff. Used by the revise route and the "what if" challenge.

import { compileSpec } from "./compiler";
import { QlooError } from "./qloo/client";
import { runRevision, type Changes } from "./revise";
import { diffSpecs } from "./spec-diff";
import { briefs, events, revisions } from "./store";
import { defaultTagMapper } from "./tagmap";
import { verifySpec } from "./verify-spec";
import type { Brief } from "./types";

export async function proposeRevision(prev: Brief, ownerHash: string, changes: Changes, signal?: AbortSignal) {
  const existing = await revisions.producing(prev.id, ownerHash);
  const rootBriefId = existing?.rootBriefId ?? prev.id;
  const { brief: next } = await runRevision(prev, changes, { signal, ownerHash, tagMapper: defaultTagMapper() });
  await briefs.put(next);
  const before = await compileSpec(prev);
  const after = await compileSpec(next, { version: (await revisions.list(rootBriefId, ownerHash)).length + 2, parentVersionId: before.versionId });
  const diff = diffSpecs(before, after);
  const verification = await verifySpec(after, { brief: next, previous: before });
  const row = await revisions.create({ rootBriefId, fromBriefId: prev.id, toBriefId: next.id, ownerHash, changes: changes as Record<string, unknown>, diff, fromVersion: before.versionId, toVersion: after.versionId });
  await events.add(next.id, "created", "agent", { status: next.status, lines: next.spec.length, revisionOf: prev.id });
  return { revision: row, diff, verification, briefId: next.id };
}

export { QlooError };
