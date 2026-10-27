// Brief persistence. Upstash Redis / Vercel KV over REST when configured,
// otherwise JSON files under .data/ (fine locally and on single-instance hosts;
// NOT durable on serverless, which /api/health and the UI report).
//
// Listing is always per owner: a visitor can only enumerate their own briefs.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Brief } from "./types";

export interface BriefSummary {
  id: string;
  createdAt: string;
  clientLabel: string;
  trade: Brief["input"]["trade"];
  room: Brief["input"]["room"];
  city: string;
  words: string[];
  dataMode: Brief["dataMode"];
  evidenceMode: Brief["evidenceMode"];
  status: Brief["status"];
  lines: number;
  accepted: number;
  revised: number;
  asked: boolean;
  answered: boolean;
  literalDiffs: number;
  llmAgreement?: number;
  rating?: number;
}

export function summarize(b: Brief): BriefSummary {
  const audit = b.llmBaseline.audit;
  return {
    id: b.id,
    createdAt: b.createdAt,
    clientLabel: b.input.clientLabel,
    trade: b.input.trade,
    room: b.input.room,
    city: b.input.city,
    words: b.input.words,
    dataMode: b.dataMode,
    evidenceMode: b.evidenceMode ?? "complete",
    status: b.status ?? "COMPLETE",
    lines: b.spec.length,
    accepted: b.spec.filter((l) => l.status === "accepted").length,
    revised: b.spec.filter((l) => l.status === "revised").length,
    asked: Boolean(b.question),
    answered: Boolean(b.question?.answer),
    literalDiffs: b.spec.filter((l) => l.value !== l.literalValue).length,
    llmAgreement: audit?.length ? audit.filter((a) => a.agrees).length / audit.length : undefined,
    rating: b.outcome?.rating,
  };
}

/** What a non-owner may see: everything except the owner hash. */
export function publicView(b: Brief): Brief {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ownerHash, ...rest } = b;
  return rest;
}

export interface Store {
  kind: "kv" | "file";
  durable: boolean;
  get(id: string): Promise<Brief | undefined>;
  put(b: Brief): Promise<void>;
  delete(id: string, ownerHash: string): Promise<boolean>;
  list(ownerHash: string, limit?: number): Promise<BriefSummary[]>;
}

export const ID_RE = /^b-[0-9a-f]{24}$|^b-[a-z0-9]{6,12}-[a-z0-9]{6,10}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

class KvStore implements Store {
  kind = "kv" as const;
  durable = true;
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async cmd(args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`KV ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  }
  async get(id: string) {
    if (!ID_RE.test(id)) return undefined;
    const raw = await this.cmd(["GET", `brief:${id}`]);
    return typeof raw === "string" ? (JSON.parse(raw) as Brief) : undefined;
  }
  async put(b: Brief) {
    await this.cmd(["SET", `brief:${b.id}`, JSON.stringify(b)]);
    await this.cmd(["SET", `summary:${b.id}`, JSON.stringify(summarize(b))]);
    if (b.ownerHash) await this.cmd(["ZADD", `briefs:${b.ownerHash}`, Date.parse(b.createdAt), b.id]);
  }
  async delete(id: string, ownerHash: string) {
    const b = await this.get(id);
    if (!b || b.ownerHash !== ownerHash) return false;
    await this.cmd(["DEL", `brief:${id}`, `summary:${id}`]);
    await this.cmd(["ZREM", `briefs:${ownerHash}`, id]);
    return true;
  }
  async list(ownerHash: string, limit = 100) {
    if (!HASH_RE.test(ownerHash)) return [];
    const ids = (await this.cmd(["ZRANGE", `briefs:${ownerHash}`, 0, limit - 1, "REV"])) as string[];
    if (!ids?.length) return [];
    const raws = (await this.cmd(["MGET", ...ids.map((id) => `summary:${id}`)])) as (string | null)[];
    return raws.filter((r): r is string => Boolean(r)).map((r) => JSON.parse(r) as BriefSummary);
  }
}

class FileStore implements Store {
  kind = "file" as const;
  durable = !process.env.VERCEL;
  private dir = process.env.TASTESPEC_DATA_DIR || path.join(process.cwd(), ".data", "briefs");
  private async ensure() {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch {
      // Read-only filesystem (serverless): fall back to /tmp, which is not durable.
      this.dir = path.join("/tmp", "tastespec-briefs");
      this.durable = false;
      await fs.mkdir(this.dir, { recursive: true });
    }
  }
  async get(id: string) {
    if (!ID_RE.test(id)) return undefined;
    await this.ensure();
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, `${id}.json`), "utf8")) as Brief;
    } catch {
      return undefined;
    }
  }
  async put(b: Brief) {
    if (!ID_RE.test(b.id)) throw new Error("invalid brief id");
    await this.ensure();
    await fs.writeFile(path.join(this.dir, `${b.id}.json`), JSON.stringify(b));
  }
  async delete(id: string, ownerHash: string) {
    const b = await this.get(id);
    if (!b || b.ownerHash !== ownerHash) return false;
    await fs.rm(path.join(this.dir, `${id}.json`), { force: true });
    return true;
  }
  async list(ownerHash: string, limit = 100) {
    if (!HASH_RE.test(ownerHash)) return [];
    await this.ensure();
    const files = (await fs.readdir(this.dir)).filter((f) => f.endsWith(".json"));
    const briefs = await Promise.all(files.map((f) => this.get(f.replace(/\.json$/, ""))));
    return briefs
      .filter((b): b is Brief => Boolean(b) && b!.ownerHash === ownerHash)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(summarize);
  }
}

let store: Store | undefined;
export function getStore(): Store {
  if (store) return store;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  store = url && token ? new KvStore(url, token) : new FileStore();
  return store;
}

/** Test hook. */
export function resetStoreForTests() {
  store = undefined;
}
