// Persistence over the embedded database (src/lib/db). Briefs are stored as one
// compressed blob plus the handful of columns we list, filter and aggregate on.
//
// Every listing is owner-scoped: a visitor can only enumerate their own briefs.
// A client share link stores only the SHA-256 of its token.

import { getDb } from "./db";
import { pack, unpack } from "./db/codec";
import { sha256Hex } from "./ledger";
import type { Brief } from "./types";

export interface BriefSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  project: string;
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
  shared: boolean;
  bytes: number;
}

export function summarize(b: Brief): Omit<BriefSummary, "shared" | "bytes" | "updatedAt"> & { updatedAt: string } {
  const audit = b.llmBaseline?.audit;
  return {
    id: b.id,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    project: b.input.project ?? "",
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

/** What a non-owner may see: no owner hash, no raw client message. */
export function publicView(b: Brief): Brief {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ownerHash, ...rest } = b;
  return { ...rest, input: { ...rest.input, sourceText: undefined } };
}

export const ID_RE = /^b-[0-9a-f]{24}$|^b-[a-z0-9]{6,12}-[a-z0-9]{6,10}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

interface SummaryRow {
  id: string;
  created_at: string;
  updated_at: string;
  project: string;
  client_label: string;
  words: string;
  asked: number;
  answered: number;
  trade: BriefSummary["trade"];
  room: BriefSummary["room"];
  city: string;
  status: BriefSummary["status"];
  data_mode: BriefSummary["dataMode"];
  evidence_mode: BriefSummary["evidenceMode"];
  lines: number;
  literal_diffs: number;
  accepted: number;
  revised: number;
  llm_agreement: number | null;
  rating: number | null;
  share_hash: string | null;
  bytes: number;
}

function toSummary(r: SummaryRow): BriefSummary {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    project: r.project,
    clientLabel: r.client_label,
    trade: r.trade,
    room: r.room,
    city: r.city,
    words: safeJson<string[]>(r.words, []),
    dataMode: r.data_mode,
    evidenceMode: r.evidence_mode,
    status: r.status,
    lines: Number(r.lines),
    accepted: Number(r.accepted),
    revised: Number(r.revised),
    asked: Boolean(r.asked),
    answered: Boolean(r.answered),
    literalDiffs: Number(r.literal_diffs),
    llmAgreement: r.llm_agreement ?? undefined,
    rating: r.rating ?? undefined,
    shared: Boolean(r.share_hash),
    bytes: Number(r.bytes),
  };
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

const SUMMARY_COLS =
  "id, created_at, updated_at, project, client_label, words, asked, answered, trade, room, city, status, data_mode, evidence_mode, lines, literal_diffs, accepted, revised, llm_agreement, rating, share_hash, bytes";

export const briefs = {
  async get(id: string): Promise<Brief | undefined> {
    if (!ID_RE.test(id)) return undefined;
    const db = await getDb();
    const row = await db.get<{ body: Uint8Array }>("SELECT body FROM briefs WHERE id = ?", [id]);
    return row ? unpack<Brief>(row.body) : undefined;
  },

  async put(b: Brief): Promise<void> {
    if (!ID_RE.test(b.id)) throw new Error("invalid brief id");
    const db = await getDb();
    const s = summarize(b);
    const body = pack(b);
    await db.run(
      `INSERT INTO briefs (id, owner_hash, project, created_at, updated_at, client_label, words, asked, answered, trade, room, city, status, data_mode, evidence_mode,
                           lines, literal_diffs, accepted, revised, llm_agreement, rating, head_hash, bytes, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project = excluded.project, updated_at = excluded.updated_at, client_label = excluded.client_label, words = excluded.words,
         asked = excluded.asked, answered = excluded.answered, status = excluded.status, evidence_mode = excluded.evidence_mode,
         lines = excluded.lines, literal_diffs = excluded.literal_diffs, accepted = excluded.accepted, revised = excluded.revised,
         llm_agreement = excluded.llm_agreement, rating = excluded.rating, head_hash = excluded.head_hash, bytes = excluded.bytes, body = excluded.body`,
      [
        b.id,
        b.ownerHash ?? "",
        s.project,
        s.createdAt,
        s.updatedAt,
        s.clientLabel,
        JSON.stringify(s.words),
        s.asked ? 1 : 0,
        s.answered ? 1 : 0,
        s.trade,
        s.room,
        s.city,
        s.status,
        s.dataMode,
        s.evidenceMode,
        s.lines,
        s.literalDiffs,
        s.accepted,
        s.revised,
        s.llmAgreement ?? null,
        s.rating ?? null,
        b.ledger.at(-1)?.hash ?? null,
        body.byteLength,
        body,
      ],
    );
  },

  async delete(id: string, ownerHash: string): Promise<boolean> {
    if (!ID_RE.test(id) || !HASH_RE.test(ownerHash)) return false;
    const db = await getDb();
    const owned = await db.get<{ id: string }>("SELECT id FROM briefs WHERE id = ? AND owner_hash = ?", [id, ownerHash]);
    if (!owned) return false;
    // Explicit, not reliant on foreign_keys being enabled on every server.
    await db.tx([
      { sql: "DELETE FROM events WHERE brief_id = ?", args: [id] },
      { sql: "DELETE FROM generations WHERE brief_id = ?", args: [id] },
      { sql: "DELETE FROM revisions WHERE owner_hash = ? AND (root_brief_id = ? OR from_brief_id = ? OR to_brief_id = ?)", args: [ownerHash, id, id, id] },
      { sql: "DELETE FROM briefs WHERE id = ? AND owner_hash = ?", args: [id, ownerHash] },
    ]);
    return true;
  },

  async list(ownerHash: string, limit = 100): Promise<BriefSummary[]> {
    if (!HASH_RE.test(ownerHash)) return [];
    const db = await getDb();
    const rows = await db.all<SummaryRow>(`SELECT ${SUMMARY_COLS} FROM briefs WHERE owner_hash = ? ORDER BY created_at DESC LIMIT ?`, [ownerHash, Math.min(500, limit)]);
    return rows.map(toSummary);
  },

  /** Create (or rotate) the client share link. Returns the raw token; only its hash is stored. */
  async share(id: string, ownerHash: string): Promise<string | undefined> {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    const db = await getDb();
    const r = await db.run("UPDATE briefs SET share_hash = ? WHERE id = ? AND owner_hash = ?", [await sha256Hex(`share:${token}`), id, ownerHash]);
    return r.changes > 0 ? token : undefined;
  },

  async unshare(id: string, ownerHash: string): Promise<boolean> {
    const db = await getDb();
    const r = await db.run("UPDATE briefs SET share_hash = NULL WHERE id = ? AND owner_hash = ?", [id, ownerHash]);
    return r.changes > 0;
  },

  async isShared(id: string): Promise<boolean> {
    const db = await getDb();
    const r = await db.get<{ s: string | null }>("SELECT share_hash AS s FROM briefs WHERE id = ?", [id]);
    return Boolean(r?.s);
  },

  async byShareToken(token: string): Promise<Brief | undefined> {
    if (!TOKEN_RE.test(token)) return undefined;
    const db = await getDb();
    const row = await db.get<{ body: Uint8Array }>("SELECT body FROM briefs WHERE share_hash = ?", [await sha256Hex(`share:${token}`)]);
    return row ? unpack<Brief>(row.body) : undefined;
  },
};

export interface BriefEvent {
  id: number;
  at: string;
  kind: string;
  actor: "designer" | "client" | "agent";
  payload: Record<string, unknown>;
}

export const events = {
  async add(briefId: string, kind: string, actor: BriefEvent["actor"], payload: Record<string, unknown> = {}): Promise<number> {
    const db = await getDb();
    const r = await db.get<{ id: number }>("INSERT INTO events (brief_id, at, kind, actor, payload) VALUES (?, ?, ?, ?, ?) RETURNING id", [
      briefId,
      new Date().toISOString(),
      kind,
      actor,
      JSON.stringify(payload).slice(0, 4000),
    ]);
    return Number(r?.id ?? 0);
  },
  async since(briefId: string, afterId = 0, limit = 50): Promise<BriefEvent[]> {
    const db = await getDb();
    const rows = await db.all<{ id: number; at: string; kind: string; actor: BriefEvent["actor"]; payload: string }>(
      "SELECT id, at, kind, actor, payload FROM events WHERE brief_id = ? AND id > ? ORDER BY id ASC LIMIT ?",
      [briefId, Math.max(0, Math.floor(afterId)), limit],
    );
    return rows.map((r) => ({ ...r, id: Number(r.id), payload: safeJson(r.payload, {}) }));
  },
  async latestId(briefId: string): Promise<number> {
    const db = await getDb();
    const r = await db.get<{ id: number | null }>("SELECT MAX(id) AS id FROM events WHERE brief_id = ?", [briefId]);
    return Number(r?.id ?? 0);
  },
};

export const generations = {
  async get<T>(briefId: string, layer: string): Promise<{ model: string; createdAt: string; value: T } | undefined> {
    const db = await getDb();
    const r = await db.get<{ model: string; created_at: string; body: Uint8Array }>("SELECT model, created_at, body FROM generations WHERE brief_id = ? AND layer = ?", [briefId, layer]);
    return r ? { model: r.model, createdAt: r.created_at, value: unpack<T>(r.body) } : undefined;
  },
  async put(briefId: string, layer: string, model: string, value: unknown): Promise<void> {
    const db = await getDb();
    await db.run(
      "INSERT INTO generations (brief_id, layer, model, created_at, body) VALUES (?, ?, ?, ?, ?) ON CONFLICT(brief_id, layer) DO UPDATE SET model = excluded.model, created_at = excluded.created_at, body = excluded.body",
      [briefId, layer, model, new Date().toISOString(), pack(value)],
    );
  },
  async clear(briefId: string): Promise<void> {
    const db = await getDb();
    await db.run("DELETE FROM generations WHERE brief_id = ?", [briefId]);
  },
};

export const cache = {
  async get<T>(ns: string, key: string): Promise<T | undefined> {
    const db = await getDb();
    const r = await db.get<{ body: Uint8Array }>("SELECT body FROM cache WHERE ns = ? AND key = ? AND expires_at > ?", [ns, key, Date.now()]);
    return r ? unpack<T>(r.body) : undefined;
  },
  async put(ns: string, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const db = await getDb();
    await db.run(
      "INSERT INTO cache (ns, key, expires_at, body) VALUES (?, ?, ?, ?) ON CONFLICT(ns, key) DO UPDATE SET expires_at = excluded.expires_at, body = excluded.body",
      [ns, key, Date.now() + ttlSeconds * 1000, pack(value)],
    );
  },
};

export async function storeInfo() {
  const db = await getDb();
  const r = await db.get<{ n: number; b: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM briefs");
  return { kind: db.kind, durable: db.durable, location: db.location, briefs: Number(r?.n ?? 0), storedBytes: Number(r?.b ?? 0) };
}

/** Aggregate, non-identifying numbers for the landing page. */
export async function publicStats() {
  const db = await getDb();
  const live = await db.get<{ n: number; lines: number; diffs: number }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(lines), 0) AS lines, COALESCE(SUM(literal_diffs), 0) AS diffs FROM briefs WHERE data_mode = 'live' AND status IN ('COMPLETE', 'NEEDS_CLARIFICATION')",
  );
  const all = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM briefs");
  return {
    briefs: Number(all?.n ?? 0),
    liveBriefs: Number(live?.n ?? 0),
    liveChangedShare: live && Number(live.lines) > 0 ? Number(live.diffs) / Number(live.lines) : undefined,
  };
}

let lastPrune = 0;

/** Retention: drop briefs untouched for TASTESPEC_RETENTION_DAYS (default 180) and expired cache. At most every 6 h per process. */
export async function maybePrune(force = false) {
  if (!force && Date.now() - lastPrune < 6 * 3600_000) return;
  lastPrune = Date.now();
  const db = await getDb();
  const days = Math.max(1, Number(process.env.TASTESPEC_RETENTION_DAYS ?? 180));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  await db.run("DELETE FROM briefs WHERE updated_at < ?", [cutoff]);
  await db.run("DELETE FROM events WHERE brief_id NOT IN (SELECT id FROM briefs)");
  await db.run("DELETE FROM generations WHERE brief_id NOT IN (SELECT id FROM briefs)");
  await db.run("DELETE FROM cache WHERE expires_at <= ?", [Date.now()]);
  if (db.kind === "sqlite") await db.exec("PRAGMA incremental_vacuum;");
}

// ---------------------------------------------------------------- revisions

export type RevisionStatus = "proposed" | "accepted" | "rejected" | "reverted";

export interface RevisionRow {
  id: string;
  rootBriefId: string;
  fromBriefId: string;
  toBriefId: string;
  createdAt: string;
  decidedAt?: string;
  status: RevisionStatus;
  changes: Record<string, unknown>;
  fromVersion: string;
  toVersion: string;
}

interface RevisionDb {
  id: string;
  root_brief_id: string;
  from_brief_id: string;
  to_brief_id: string;
  created_at: string;
  decided_at: string | null;
  status: RevisionStatus;
  changes: string;
  from_version: string;
  to_version: string;
  diff?: Uint8Array;
}

const toRevision = (r: RevisionDb): RevisionRow => ({ id: r.id, rootBriefId: r.root_brief_id, fromBriefId: r.from_brief_id, toBriefId: r.to_brief_id, createdAt: r.created_at, ...(r.decided_at ? { decidedAt: r.decided_at } : {}), status: r.status, changes: JSON.parse(r.changes), fromVersion: r.from_version, toVersion: r.to_version });
const REV_COLS = "id, root_brief_id, from_brief_id, to_brief_id, created_at, decided_at, status, changes, from_version, to_version";

/** Revisions of a specification. Always owner-scoped: another visitor never sees them, even with a brief link. */
export const revisions = {
  async create(r: { rootBriefId: string; fromBriefId: string; toBriefId: string; ownerHash: string; changes: Record<string, unknown>; diff: unknown; fromVersion: string; toVersion: string }): Promise<RevisionRow> {
    const db = await getDb();
    const id = `r-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const createdAt = new Date().toISOString();
    await db.run(`INSERT INTO revisions (${REV_COLS.replace(", decided_at", "").replace(", diff", "")}, owner_hash, diff) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, r.rootBriefId, r.fromBriefId, r.toBriefId, createdAt, "proposed", JSON.stringify(r.changes).slice(0, 4000), r.fromVersion, r.toVersion, r.ownerHash, pack(r.diff)]);
    return { id, rootBriefId: r.rootBriefId, fromBriefId: r.fromBriefId, toBriefId: r.toBriefId, createdAt, status: "proposed", changes: r.changes, fromVersion: r.fromVersion, toVersion: r.toVersion };
  },
  async get(id: string, ownerHash: string): Promise<(RevisionRow & { diff: unknown }) | undefined> {
    if (!/^r-[0-9a-f]{20}$/.test(id) || !HASH_RE.test(ownerHash)) return undefined;
    const db = await getDb();
    const row = await db.get<RevisionDb>(`SELECT ${REV_COLS}, diff FROM revisions WHERE id = ? AND owner_hash = ?`, [id, ownerHash]);
    return row ? { ...toRevision(row), diff: unpack(row.diff!) } : undefined;
  },
  async list(rootBriefId: string, ownerHash: string): Promise<RevisionRow[]> {
    if (!ID_RE.test(rootBriefId) || !HASH_RE.test(ownerHash)) return [];
    const db = await getDb();
    return (await db.all<RevisionDb>(`SELECT ${REV_COLS} FROM revisions WHERE root_brief_id = ? AND owner_hash = ? ORDER BY created_at, rowid`, [rootBriefId, ownerHash])).map(toRevision);
  },
  /** The revision that produced this brief, if any. */
  async producing(toBriefId: string, ownerHash: string): Promise<RevisionRow | undefined> {
    if (!ID_RE.test(toBriefId) || !HASH_RE.test(ownerHash)) return undefined;
    const db = await getDb();
    const row = await db.get<RevisionDb>(`SELECT ${REV_COLS} FROM revisions WHERE to_brief_id = ? AND owner_hash = ?`, [toBriefId, ownerHash]);
    return row ? toRevision(row) : undefined;
  },
  async decide(id: string, ownerHash: string, status: Exclude<RevisionStatus, "proposed">): Promise<RevisionRow | undefined> {
    const cur = await this.get(id, ownerHash);
    if (!cur) return undefined;
    const allowed: Record<RevisionStatus, RevisionStatus[]> = { proposed: ["accepted", "rejected"], accepted: ["reverted"], rejected: [], reverted: [] };
    if (!allowed[cur.status].includes(status)) throw new Error(`A ${cur.status} revision can't become ${status}.`);
    const db = await getDb();
    await db.run("UPDATE revisions SET status = ?, decided_at = ? WHERE id = ? AND owner_hash = ?", [status, new Date().toISOString(), id, ownerHash]);
    return { ...cur, status, decidedAt: new Date().toISOString() };
  },
};

/** The brief that is current for a project: the latest accepted revision's result, or the original. */
export function headOf(rootBriefId: string, list: RevisionRow[]): string {
  const live = list.filter((r) => r.status === "accepted");
  return live.length ? live[live.length - 1].toBriefId : rootBriefId;
}
