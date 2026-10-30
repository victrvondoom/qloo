// Shared by the specification routes: build, verify and (for the owner) compare a brief's specification.

import { compileSpec, type CompiledSpec } from "./compiler";
import { currentOwnerHash, isOwner } from "./owner";
import { sensitivityFromBrief, type SensitivityReport } from "./sensitivity";
import { diffSpecs, type SpecDiff } from "./spec-diff";
import { briefs, publicView, revisions, type RevisionRow } from "./store";
import { verifySpec, type Verification } from "./verify-spec";
import type { Brief } from "./types";

export interface SpecReport {
  spec: CompiledSpec;
  verification: Verification;
  revision?: { row: RevisionRow; diff: SpecDiff };
  sensitivity?: SensitivityReport;
  canEdit: boolean;
}

/** Owners see their revision history; anyone with the link sees only this brief's own specification, without the pasted message. */
export async function specReport(brief: Brief): Promise<SpecReport> {
  const owner = await currentOwnerHash();
  const canEdit = isOwner(brief.ownerHash, owner);
  const view = canEdit ? brief : publicView(brief);
  let previous: CompiledSpec | undefined;
  let row: RevisionRow | undefined;
  let version = 1;
  if (canEdit && owner) {
    row = await revisions.producing(brief.id, owner);
    if (row) {
      const prev = await briefs.get(row.fromBriefId);
      if (prev) previous = await compileSpec(prev);
      version = (await revisions.list(row.rootBriefId, owner)).findIndex((r) => r.id === row!.id) + 2;
    }
  }
  const spec = await compileSpec(view, { version, parentVersionId: previous?.versionId });
  const verification = await verifySpec(spec, { brief: view, previous });
  let sensitivity: SensitivityReport | undefined;
  if (view.influence) {
    try {
      sensitivity = sensitivityFromBrief(view);
    } catch {
      sensitivity = undefined;
    }
  }
  return { spec, verification, ...(row && previous ? { revision: { row, diff: diffSpecs(previous, spec) } } : {}), ...(sensitivity ? { sensitivity } : {}), canEdit };
}
