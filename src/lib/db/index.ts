// Database selection:
//   DATABASE_URL=libsql://… / https://…  → libSQL/Turso over HTTP (DATABASE_AUTH_TOKEN)
//   DATABASE_URL=file:/path/to.db or TASTESPEC_DB_PATH → that SQLite file
//   otherwise                            → ./.data/tastespec.db (SQLite, any OS)

import { migrate } from "./schema";
import { openLibsql } from "./libsql";
import { openSqlite } from "./sqlite";
import type { Db } from "./types";

export type { Db, SqlValue, Stmt } from "./types";

let ready: Promise<Db> | undefined;

export function dbTarget(env: NodeJS.ProcessEnv = process.env): { driver: "sqlite" | "libsql"; url: string } {
  const url = (env.DATABASE_URL ?? "").trim();
  if (/^(libsql|https?):\/\//i.test(url)) return { driver: "libsql", url };
  if (url.startsWith("file:")) return { driver: "sqlite", url: url.slice(5) };
  return { driver: "sqlite", url: (env.TASTESPEC_DB_PATH ?? "").trim() };
}

async function open(): Promise<Db> {
  const target = dbTarget();
  const db = target.driver === "libsql" ? await openLibsql(target.url, process.env.DATABASE_AUTH_TOKEN) : openSqlite(target.url || undefined);
  await migrate(db);
  return db;
}

/** The shared database, opened and migrated once per process. */
export function getDb(): Promise<Db> {
  ready ??= open().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

/** Tests: use a specific (migrated) database, or pass nothing to return to env-based selection. */
export function setDbForTests(db?: Db) {
  ready = db ? Promise.resolve(db) : undefined;
}
