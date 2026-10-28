// A minimal libSQL "Hrana over HTTP" v2 server for tests, executing against
// node:sqlite. It lets the official @libsql/client/http talk to a real HTTP
// endpoint, so the cloud database path is exercised end to end without Turso.
// Implements: GET /v3-protobuf → 404 (forces JSON v2), POST /v2/pipeline with
// execute / batch (with conditions) / sequence / close / get_autocommit.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadSqlite } from "@/lib/db/sqlite";

type HValue = { type: "null" } | { type: "integer"; value: string } | { type: "float"; value: number } | { type: "text"; value: string } | { type: "blob"; base64: string };

interface HStmt {
  sql?: string;
  sql_id?: number;
  args?: HValue[];
  named_args?: { name: string; value: HValue }[];
  want_rows?: boolean;
}

type HCond = { type: "ok" | "error"; step: number } | { type: "not"; cond: HCond } | { type: "and" | "or"; conds: HCond[] } | { type: "is_autocommit" };

function decodeValue(v: HValue): string | number | bigint | null | Uint8Array {
  switch (v.type) {
    case "null":
      return null;
    case "integer":
      return BigInt(v.value);
    case "float":
      return v.value;
    case "text":
      return v.value;
    case "blob":
      return new Uint8Array(Buffer.from(v.base64, "base64"));
  }
}

function encodeValue(v: unknown): HValue {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  if (typeof v === "string") return { type: "text", value: v };
  if (v instanceof Uint8Array) return { type: "blob", base64: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
}

export async function startHranaServer(file = ":memory:") {
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(file);
  // Worst case for a hosted server: no foreign-key enforcement, so cascades must be explicit.
  db.exec("PRAGMA foreign_keys = OFF;");
  let requests = 0;
  // SQL registered with store_sql and referenced by sql_id (the client does this for batches).
  const stored = new Map<number, string>();

  function execute(stmt: HStmt) {
    const sql = stmt.sql ?? (stmt.sql_id !== undefined ? stored.get(stmt.sql_id) : undefined);
    if (sql === undefined) throw new Error(`unknown sql_id ${stmt.sql_id}`);
    const s = db.prepare(sql);
    const args = (stmt.args ?? []).map(decodeValue);
    const returnsRows = /^\s*(select|pragma|with|explain)\b/i.test(sql) || /\breturning\b/i.test(sql);
    if (returnsRows) {
      const rows = s.all(...(args as never[])) as Record<string, unknown>[];
      const cols = rows.length ? Object.keys(rows[0]) : [];
      return { cols: cols.map((name) => ({ name })), rows: rows.map((r) => cols.map((c) => encodeValue(r[c]))), affected_row_count: 0, last_insert_rowid: null };
    }
    const r = s.run(...(args as never[]));
    return { cols: [], rows: [], affected_row_count: Number(r.changes), last_insert_rowid: String(r.lastInsertRowid) };
  }

  function evalCond(c: HCond | undefined, ok: boolean[], err: boolean[]): boolean {
    if (!c) return true;
    switch (c.type) {
      case "ok":
        return ok[c.step] === true;
      case "error":
        return err[c.step] === true;
      case "not":
        return !evalCond(c.cond, ok, err);
      case "and":
        return c.conds.every((x) => evalCond(x, ok, err));
      case "or":
        return c.conds.some((x) => evalCond(x, ok, err));
      case "is_autocommit":
        return !db.isTransaction;
    }
  }

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "GET") {
        res.writeHead(req.url === "/v2" ? 200 : 404).end();
        return;
      }
      if (req.method !== "POST" || req.url !== "/v2/pipeline") {
        res.writeHead(404).end();
        return;
      }
      requests++;
      const msg = JSON.parse(body) as { baton?: string; requests: ({ type: string } & Record<string, unknown>)[] };
      let closed = false;
      const results = msg.requests.map((r) => {
        try {
          switch (r.type) {
            case "execute":
              return { type: "ok", response: { type: "execute", result: execute(r.stmt as HStmt) } };
            case "sequence":
              db.exec(String(r.sql));
              return { type: "ok", response: { type: "sequence" } };
            case "batch": {
              const steps = (r.batch as { steps: { condition?: HCond; stmt: HStmt }[] }).steps;
              const ok: boolean[] = [];
              const err: boolean[] = [];
              const step_results: unknown[] = [];
              const step_errors: unknown[] = [];
              steps.forEach((st, i) => {
                if (!evalCond(st.condition, ok, err)) {
                  step_results.push(null);
                  step_errors.push(null);
                  return;
                }
                try {
                  step_results.push(execute(st.stmt));
                  step_errors.push(null);
                  ok[i] = true;
                } catch (e) {
                  step_results.push(null);
                  step_errors.push({ message: (e as Error).message });
                  err[i] = true;
                }
              });
              return { type: "ok", response: { type: "batch", result: { step_results, step_errors } } };
            }
            case "get_autocommit":
              return { type: "ok", response: { type: "get_autocommit", is_autocommit: !db.isTransaction } };
            case "store_sql":
              stored.set(Number(r.sql_id), String(r.sql));
              return { type: "ok", response: { type: "store_sql" } };
            case "close_sql":
              stored.delete(Number(r.sql_id));
              return { type: "ok", response: { type: "close_sql" } };
            case "close":
              closed = true;
              return { type: "ok", response: { type: "close" } };
            default:
              return { type: "ok", response: { type: r.type } };
          }
        } catch (e) {
          return { type: "error", error: { message: (e as Error).message, code: "SQLITE_ERROR" } };
        }
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ baton: closed ? null : "b", base_url: null, results }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => requests,
    close: () => new Promise<void>((r) => server.close(() => (db.close(), r()))),
  };
}
