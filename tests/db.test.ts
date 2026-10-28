// Database layer: both drivers run the same schema and store code.
//   sqlite  node:sqlite, temp file
//   libsql  the official @libsql/client/http against an in-process Hrana v2 server
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openSqlite } from "@/lib/db/sqlite";
import { openLibsql } from "@/lib/db/libsql";
import { migrate, MIGRATIONS } from "@/lib/db/schema";
import { pack, unpack } from "@/lib/db/codec";
import { dbTarget, setDbForTests, type Db } from "@/lib/db";
import { briefs, events, generations, cache, storeInfo, publicStats, maybePrune, publicView } from "@/lib/store";
import { runBrief } from "@/lib/agent";
import { verifyLedger } from "@/lib/ledger";
import type { Brief } from "@/lib/types";
import { startHranaServer } from "./helpers/hrana-server";

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
let sample: Brief;

beforeAll(async () => {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  sample = await runBrief({ clientLabel: "Maya", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Norah Jones"] }, () => {});
});

describe("codec", () => {
  it("round-trips and compresses a brief well below its JSON size", () => {
    const blob = pack(sample);
    const json = JSON.stringify(sample).length;
    expect(unpack<Brief>(blob)).toEqual(JSON.parse(JSON.stringify(sample)));
    expect(blob.byteLength).toBeLessThan(json / 3);
  });
});

describe("target selection", () => {
  it("picks libsql for remote URLs and sqlite otherwise", () => {
    expect(dbTarget({ DATABASE_URL: "libsql://x.turso.io" } as unknown as NodeJS.ProcessEnv).driver).toBe("libsql");
    expect(dbTarget({ DATABASE_URL: "https://x" } as unknown as NodeJS.ProcessEnv).driver).toBe("libsql");
    expect(dbTarget({ DATABASE_URL: "file:/tmp/a.db" } as unknown as NodeJS.ProcessEnv)).toEqual({ driver: "sqlite", url: "/tmp/a.db" });
    expect(dbTarget({} as unknown as NodeJS.ProcessEnv)).toEqual({ driver: "sqlite", url: "" });
  });
});

function storeSuite(name: string, open: () => Promise<{ db: Db; close: () => Promise<void> }>) {
  describe(`store on ${name}`, () => {
    let handle: { db: Db; close: () => Promise<void> };
    beforeAll(async () => {
      handle = await open();
      expect(await migrate(handle.db)).toBe(MIGRATIONS.at(-1)!.version);
      expect(await migrate(handle.db)).toBe(MIGRATIONS.at(-1)!.version); // idempotent
      setDbForTests(handle.db);
    });
    afterAll(async () => {
      setDbForTests();
      await handle.close();
    });

    it("stores, lists by owner only, and round-trips a brief with an intact ledger", async () => {
      const b = { ...sample, ownerHash: OWNER_A };
      await briefs.put(b);
      const got = await briefs.get(b.id);
      expect(got?.spec).toEqual(b.spec);
      expect((await verifyLedger(got!.ledger)).ok).toBe(true);
      expect((await briefs.list(OWNER_A)).map((s) => s.id)).toEqual([b.id]);
      expect(await briefs.list(OWNER_B)).toEqual([]);
      const s = (await briefs.list(OWNER_A))[0];
      expect(s.words).toEqual(["warm", "modern"]);
      expect(s.bytes).toBeGreaterThan(0);
    });

    it("updates in place and keeps the share link across updates", async () => {
      const token = await briefs.share(sample.id, OWNER_A);
      expect(token).toMatch(/^[0-9a-f]{36}$/);
      expect(await briefs.share(sample.id, OWNER_B)).toBeUndefined();
      const updated = { ...sample, ownerHash: OWNER_A, updatedAt: new Date().toISOString(), outcome: { rating: 4 } };
      await briefs.put(updated);
      expect((await briefs.byShareToken(token!))?.outcome?.rating).toBe(4);
      expect(await briefs.byShareToken("x".repeat(36))).toBeUndefined();
      expect(await briefs.isShared(sample.id)).toBe(true);
      expect(await briefs.unshare(sample.id, OWNER_A)).toBe(true);
      expect(await briefs.byShareToken(token!)).toBeUndefined();
    });

    it("records events in order and reads them incrementally", async () => {
      const a = await events.add(sample.id, "client_answered", "client", { answer: "A" });
      const b = await events.add(sample.id, "line_accepted", "designer", { lineId: "cct" });
      expect(b).toBeGreaterThan(a);
      expect((await events.since(sample.id, 0)).map((e) => e.kind)).toEqual(["client_answered", "line_accepted"]);
      expect((await events.since(sample.id, a)).map((e) => e.kind)).toEqual(["line_accepted"]);
      expect(await events.latestId(sample.id)).toBe(b);
    });

    it("stores generations and expiring cache entries", async () => {
      await generations.put(sample.id, "scenes", "template", { scenes: [1, 2, 3] });
      expect((await generations.get<{ scenes: number[] }>(sample.id, "scenes"))?.value.scenes).toEqual([1, 2, 3]);
      await cache.put("qloo", "k1", { hello: "world" }, 60);
      await cache.put("qloo", "k2", { stale: true }, -1);
      expect(await cache.get("qloo", "k1")).toEqual({ hello: "world" });
      expect(await cache.get("qloo", "k2")).toBeUndefined();
    });

    it("reports aggregate stats and info without identifying data", async () => {
      const info = await storeInfo();
      expect(info.briefs).toBe(1);
      expect(info.storedBytes).toBeGreaterThan(0);
      const stats = await publicStats();
      expect(stats.briefs).toBe(1);
      expect(stats.liveBriefs).toBe(0); // fixture briefs never count as live
      expect(JSON.stringify(stats)).not.toContain(OWNER_A);
    });

    it("deletes only for the owner, cascading events and generations", async () => {
      expect(await briefs.delete(sample.id, OWNER_B)).toBe(false);
      expect(await briefs.delete(sample.id, OWNER_A)).toBe(true);
      expect(await briefs.get(sample.id)).toBeUndefined();
      expect(await events.since(sample.id, 0)).toEqual([]);
      expect(await generations.get(sample.id, "scenes")).toBeUndefined();
    });

    it("prunes expired data on demand", async () => {
      await maybePrune(true);
      expect((await storeInfo()).briefs).toBe(0);
    });

    it("rejects malformed ids without touching the database", async () => {
      expect(await briefs.get("../../etc/passwd")).toBeUndefined();
      expect(await briefs.list("not-a-hash")).toEqual([]);
      await expect(briefs.put({ ...sample, id: "nope" })).rejects.toThrow();
    });
  });
}

const dir = mkdtempSync(path.join(tmpdir(), "tastespec-db-"));

storeSuite("node:sqlite (file)", async () => {
  const db = openSqlite(path.join(dir, "a.db"));
  return { db, close: () => db.close() };
});

storeSuite("libSQL over HTTP (official client, in-process server)", async () => {
  const server = await startHranaServer(path.join(dir, "remote.db"));
  const db = await openLibsql(server.url);
  return {
    db,
    close: async () => {
      expect(server.requests()).toBeGreaterThan(5);
      await db.close();
      await server.close();
    },
  };
});

describe("storage footprint", () => {
  it("keeps a brief to a few kilobytes on disk", async () => {
    const file = path.join(dir, "size.db");
    const db = openSqlite(file);
    await migrate(db);
    setDbForTests(db);
    for (let i = 0; i < 20; i++) await briefs.put({ ...sample, id: `b-${String(i).padStart(24, "0")}`, ownerHash: OWNER_A });
    await db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    const perBrief = statSync(file).size / 20;
    setDbForTests();
    await db.close();
    expect(perBrief).toBeLessThan(40_000);
  });

  it("public view strips owner and the raw client message", () => {
    const v = publicView({ ...sample, ownerHash: OWNER_A, input: { ...sample.input, sourceText: "my phone is 555" } });
    expect("ownerHash" in v).toBe(false);
    expect(v.input.sourceText).toBeUndefined();
  });
});
