// The database contract. Two drivers implement it with the same SQL (SQLite dialect):
//   sqlite  Node's built-in node:sqlite, a single file on any OS (default)
//   libsql  libSQL / Turso over HTTP, for serverless hosts where the disk is ephemeral

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface Stmt {
  sql: string;
  args?: SqlValue[];
}

export interface Db {
  readonly kind: "sqlite" | "libsql";
  /** False when data won't survive a restart (temp dir fallback, in-memory). */
  readonly durable: boolean;
  /** Where the data lives, without credentials (for /api/health). */
  readonly location: string;
  /** Run one or more statements without parameters (schema, pragmas). */
  exec(sql: string): Promise<void>;
  run(sql: string, args?: SqlValue[]): Promise<{ changes: number }>;
  all<T = Record<string, unknown>>(sql: string, args?: SqlValue[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, args?: SqlValue[]): Promise<T | undefined>;
  /** Run statements atomically: all apply or none do. */
  tx(stmts: Stmt[]): Promise<void>;
  close(): Promise<void>;
}
