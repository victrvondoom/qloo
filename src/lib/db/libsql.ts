// libSQL / Turso driver over HTTP (pure JavaScript, no native module), for hosts
// whose disk doesn't persist (Vercel, other serverless). Same SQL as the sqlite driver.

import type { Db, SqlValue, Stmt } from "./types";

interface ResultSetLike {
  columns: string[];
  rows: ArrayLike<unknown>[];
  rowsAffected: number;
}

/** The subset of @libsql/client's Client that we use (lets tests inject the node client). */
export interface LibsqlClientLike {
  execute(stmt: { sql: string; args: SqlValue[] }): Promise<ResultSetLike>;
  batch(stmts: { sql: string; args: SqlValue[] }[], mode?: "write" | "read" | "deferred"): Promise<unknown>;
  executeMultiple(sql: string): Promise<void>;
  close(): void;
}

function normalise(v: unknown): unknown {
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof v === "bigint") return Number(v);
  return v;
}

function rowsOf<T>(rs: ResultSetLike): T[] {
  return rs.rows.map((row) => {
    const o: Record<string, unknown> = {};
    rs.columns.forEach((c, i) => (o[c] = normalise((row as ArrayLike<unknown>)[i])));
    return o as T;
  });
}

export class LibsqlDb implements Db {
  readonly kind = "libsql" as const;
  readonly durable = true;
  constructor(
    private readonly client: LibsqlClientLike,
    readonly location: string,
  ) {}

  async exec(sql: string) {
    await this.client.executeMultiple(sql);
  }
  async run(sql: string, args: SqlValue[] = []) {
    const rs = await this.client.execute({ sql, args });
    return { changes: rs.rowsAffected };
  }
  async all<T>(sql: string, args: SqlValue[] = []) {
    return rowsOf<T>(await this.client.execute({ sql, args }));
  }
  async get<T>(sql: string, args: SqlValue[] = []) {
    return (await this.all<T>(sql, args))[0];
  }
  async tx(stmts: Stmt[]) {
    await this.client.batch(stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })), "write");
  }
  async close() {
    this.client.close();
  }
}

/** Connect to a remote libSQL database (libsql://, https:// or http:// URL). */
export async function openLibsql(url: string, authToken?: string): Promise<LibsqlDb> {
  const { createClient } = await import("@libsql/client/http");
  const client = createClient({ url, authToken, intMode: "number" }) as unknown as LibsqlClientLike;
  const host = (() => {
    try {
      return new URL(url.replace(/^libsql:/, "https:")).host;
    } catch {
      return "remote";
    }
  })();
  return new LibsqlDb(client, `libsql://${host}`);
}
