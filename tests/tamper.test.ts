// Evidence tampering, provenance cross-checks and store isolation.
import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyLedger } from "@/lib/ledger";
import { runBrief } from "@/lib/agent";
import { evidenceReport } from "@/lib/evidence";
import { getStore, resetStoreForTests, publicView } from "@/lib/store";
import type { Brief } from "@/lib/types";

const maya = { clientLabel: "Maya", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
let brief: Brief;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  brief = await runBrief(maya, () => {});
});

describe("ledger tampering", () => {
  it("detects modified content", async () => {
    const l = structuredClone(brief.ledger);
    const i = l.findIndex((e) => e.kind === "qloo_call");
    (l[i].detail as Record<string, unknown>).status = 200.5;
    expect((await verifyLedger(l)).firstBadSeq).toBe(i);
  });

  it("detects reordering", async () => {
    const l = structuredClone(brief.ledger);
    [l[2], l[3]] = [l[3], l[2]];
    expect((await verifyLedger(l)).ok).toBe(false);
  });

  it("detects a removed middle entry", async () => {
    const l = structuredClone(brief.ledger);
    l.splice(4, 1);
    expect((await verifyLedger(l)).ok).toBe(false);
  });

  it("detects truncation only against a committed head", async () => {
    const head = brief.ledger.at(-1)!.hash;
    const l = structuredClone(brief.ledger).slice(0, -2);
    expect((await verifyLedger(l)).ok).toBe(true); // internally consistent…
    const r = await verifyLedger(l, head); // …but not the chain that was issued
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/committed head/);
  });

  it("detects a re-hashed forgery against a committed head", async () => {
    const head = brief.ledger.at(-1)!.hash;
    const l = structuredClone(brief.ledger);
    l[1].summary = "forged";
    expect((await verifyLedger(l, head)).ok).toBe(false);
  });

  it("rejects malformed input", async () => {
    expect((await verifyLedger("nope" as never)).ok).toBe(false);
    expect((await verifyLedger([null as never])).ok).toBe(false);
  });
});

describe("evidence report cross-checks citations", () => {
  it("classifies an untouched brief with no unsupported lines", () => {
    const r = evidenceReport(brief);
    expect(r.counts.unsupported).toBe(0);
    expect(r.lines.length).toBe(brief.spec.length);
  });

  it("flags lines citing nonexistent or failed Qloo requests", () => {
    const b = structuredClone(brief);
    const line = b.spec.find((l) => l.basis === "qloo_evidence")!;
    line.evidenceLedger = [99999];
    const r = evidenceReport(b);
    expect(r.lines.find((l) => l.lineId === line.id)?.class).toBe("unsupported");

    const c = structuredClone(brief);
    const cl = c.spec.find((l) => l.basis === "qloo_evidence")!;
    const seq = cl.evidenceLedger[0];
    (c.ledger[seq].detail as Record<string, unknown>).ok = false;
    expect(evidenceReport(c).lines.find((l) => l.lineId === cl.id)?.class).toBe("unsupported");
  });

  it("flags an evidence line with its evidence stripped", () => {
    const b = structuredClone(brief);
    const line = b.spec.find((l) => l.basis === "qloo_evidence")!;
    line.evidence = [];
    expect(evidenceReport(b).lines.find((l) => l.lineId === line.id)?.problems.join()).toMatch(/no atmosphere evidence/);
  });
});

describe("store isolation (no cross-visitor leakage)", () => {
  it("lists and deletes only the owner's briefs; public view hides the owner", async () => {
    process.env.TASTESPEC_DATA_DIR = mkdtempSync(path.join(tmpdir(), "ts-store-"));
    delete process.env.KV_REST_API_URL;
    resetStoreForTests();
    const store = getStore();
    const ownerA = "a".repeat(64);
    const ownerB = "b".repeat(64);
    await store.put({ ...brief, ownerHash: ownerA });
    expect((await store.list(ownerA)).map((s) => s.id)).toContain(brief.id);
    expect(await store.list(ownerB)).toEqual([]);
    expect(await store.delete(brief.id, ownerB)).toBe(false);
    expect(await store.get(brief.id)).toBeDefined();
    expect("ownerHash" in publicView((await store.get(brief.id))!)).toBe(false);
    expect(await store.delete(brief.id, ownerA)).toBe(true);
    expect(await store.get(brief.id)).toBeUndefined();
    expect(await store.get("../../etc/passwd")).toBeUndefined();
    resetStoreForTests();
  });
});
