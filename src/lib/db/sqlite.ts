// node:sqlite driver: built into Node 22.13+, no native add-on to compile, so the
// same code runs on Windows, macOS and Linux with nothing extra to install.

import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Db, SqlValue, Stmt } from "./types";

type SqliteModule = typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;

let cached: SqliteModule | undefined;

/** Load node:sqlite at runtime (keeps bundlers away from it) and silence its one-time ExperimentalWarning. */
export function loadSqlite(): SqliteModule {
  if (cached) return cached;
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning?.message ?? "";
    if (/SQLite is an experimental feature/i.test(text)) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    const mod = process.getBuiltinModule?.("node:sqlite") as SqliteModule | undefined;
    if (!mod?.DatabaseSync) throw new Error("node:sqlite is unavailable");
    cached = mod;
    return mod;
  } catch {
    throw new Error("Tastespec needs Node.js 22.13 or newer (built-in node:sqlite). Install a current Node LTS, or set DATABASE_URL to a libSQL/Turso database.");
  } finally {
    process.emitWarning = original;
  }
}

function params(args: SqlValue[] = []) {
  return args.map((a) => (typeof a === "boolean" ? Number(a) : a)) as (string | number | bigint | null | Uint8Array)[];
}

function plain<T>(row: unknown): T {
  // node:sqlite returns null-prototype objects; normalise so callers can spread/compare freely.
  return { ...(row as Record<string, unknown>) } as T;
}

export class SqliteDb implements Db {
  readonly kind = "sqlite" as const;
  readonly durable: boolean;
  readonly location: string;
  private readonly db: DatabaseSync;

  constructor(file: string, opts: { durable?: boolean } = {}) {
    const { DatabaseSync } = loadSqlite();
    const memory = file === ":memory:";
    if (!memory) mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.location = memory ? ":memory:" : file;
    this.durable = !memory && (opts.durable ?? true);
    // auto_vacuum only takes effect before the first table exists; harmless afterwards.
    this.db.exec("PRAGMA auto_vacuum = INCREMENTAL;");
    this.db.exec("PRAGMA busy_timeout = 4000; PRAGMA foreign_keys = ON;");
    if (!memory) this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  }

  async exec(sql: string) {
    this.db.exec(sql);
  }

  async run(sql: string, args?: SqlValue[]) {
    const r = this.db.prepare(sql).run(...params(args));
    return { changes: Number(r.changes) };
  }

  async all<T>(sql: string, args?: SqlValue[]) {
    return this.db.prepare(sql).all(...params(args)).map((r) => plain<T>(r));
  }

  async get<T>(sql: string, args?: SqlValue[]) {
    const r = this.db.prepare(sql).get(...params(args));
    return r === undefined ? undefined : plain<T>(r);
  }

  async tx(stmts: Stmt[]) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const s of stmts) this.db.prepare(s.sql).run(...params(s.args));
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async close() {
    this.db.close();
  }
}

/** Resolve the database file: explicit path, else ./.data/tastespec.db, else the OS temp dir (not durable). */
export function openSqlite(explicit?: string): SqliteDb {
  if (explicit === ":memory:") return new SqliteDb(":memory:");
  const preferred = explicit || path.join(process.cwd(), ".data", "tastespec.db");
  try {
    mkdirSync(path.dirname(preferred), { recursive: true });
    return new SqliteDb(preferred, { durable: !process.env.VERCEL });
  } catch {
    // Read-only filesystem (serverless): keep working, but say the data is ephemeral.
    return new SqliteDb(path.join(os.tmpdir(), "tastespec", "tastespec.db"), { durable: false });
  }
}
