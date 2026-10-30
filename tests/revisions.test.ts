// Revision history: owner-scoped, real state transitions, return to a previous version, cascade on delete.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openSqlite } from "@/lib/db/sqlite";
import { migrate } from "@/lib/db/schema";
import { setDbForTests, type Db } from "@/lib/db";
import { briefs, headOf, revisions } from "@/lib/store";
import { runBrief } from "@/lib/agent";
import { runRevision } from "@/lib/revise";
import { compileSpec } from "@/lib/compiler";
import { diffSpecs } from "@/lib/spec-diff";

const A = "a".repeat(64);
const B = "b".repeat(64);
let db: Db;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  db = openSqlite(path.join(mkdtempSync(path.join(tmpdir(), "rev-")), "r.db"));
  await migrate(db);
  setDbForTests(db);
});
afterAll(async () => {
  setDbForTests();
  await db.close();
});

const input = { clientLabel: "Jordan", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["modern"], loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };

describe("revisions", () => {
  it("proposes, accepts, reverts, and shows only to the owner; the previous version is restored", async () => {
    const root = await runBrief(input, () => {}, { ownerHash: A });
    await briefs.put(root);
    const r1 = await runRevision(root, { cctRange: { min: 2700, max: 3000 } }, { ownerHash: A });
    await briefs.put(r1.brief);
    const d1 = diffSpecs(await compileSpec(root), await compileSpec(r1.brief));
    const rev1 = await revisions.create({ rootBriefId: root.id, fromBriefId: root.id, toBriefId: r1.brief.id, ownerHash: A, changes: { cctRange: { min: 2700, max: 3000 } }, diff: d1, fromVersion: d1.fromVersionId, toVersion: d1.toVersionId });
    expect(rev1.status).toBe("proposed");
    expect(headOf(root.id, await revisions.list(root.id, A))).toBe(root.id); // a proposal changes nothing
    expect(await revisions.list(root.id, B)).toEqual([]);
    expect(await revisions.get(rev1.id, B)).toBeUndefined();
    await expect(revisions.decide(rev1.id, B, "accepted")).resolves.toBeUndefined();
    await revisions.decide(rev1.id, A, "accepted");
    expect(headOf(root.id, await revisions.list(root.id, A))).toBe(r1.brief.id);
    expect(((await revisions.get(rev1.id, A))!.diff as typeof d1).counts.revised).toBeGreaterThan(0);
    await expect(revisions.decide(rev1.id, A, "accepted")).rejects.toThrow(/can't become/);
    await revisions.decide(rev1.id, A, "reverted");
    expect(headOf(root.id, await revisions.list(root.id, A))).toBe(root.id);
    await expect(revisions.decide(rev1.id, A, "accepted")).rejects.toThrow();
  });
  it("a rejected proposal stays recorded and never becomes current", async () => {
    const root = await runBrief({ ...input, clientLabel: "J2" }, () => {}, { ownerHash: A });
    await briefs.put(root);
    const r = await runRevision(root, { removeEvidence: true }, { ownerHash: A });
    await briefs.put(r.brief);
    const rev = await revisions.create({ rootBriefId: root.id, fromBriefId: root.id, toBriefId: r.brief.id, ownerHash: A, changes: { removeEvidence: true }, diff: {}, fromVersion: "x", toVersion: "y" });
    await revisions.decide(rev.id, A, "rejected");
    const list = await revisions.list(root.id, A);
    expect(list.map((x) => x.status)).toEqual(["rejected"]);
    expect(headOf(root.id, list)).toBe(root.id);
    expect((await revisions.producing(r.brief.id, A))?.id).toBe(rev.id);
  });
  it("deleting a brief removes its revisions", async () => {
    const root = await runBrief({ ...input, clientLabel: "J3" }, () => {}, { ownerHash: A });
    await briefs.put(root);
    const r = await runRevision(root, { addLove: "Norah Jones" }, { ownerHash: A });
    await briefs.put(r.brief);
    await revisions.create({ rootBriefId: root.id, fromBriefId: root.id, toBriefId: r.brief.id, ownerHash: A, changes: {}, diff: {}, fromVersion: "x", toVersion: "y" });
    expect(await briefs.delete(root.id, A)).toBe(true);
    expect(await revisions.list(root.id, A)).toEqual([]);
  });
});
