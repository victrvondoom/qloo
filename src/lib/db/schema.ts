// Schema, applied as numbered migrations. Kept deliberately small: a brief's
// full evidence (spec, ledger, trace, venues) is one brotli-compressed blob, and
// only the columns we filter, sort or aggregate on are broken out.

import type { Db } from "./types";

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS briefs (
        id            TEXT PRIMARY KEY,
        owner_hash    TEXT NOT NULL,
        share_hash    TEXT,
        project       TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        client_label  TEXT NOT NULL,
        words         TEXT NOT NULL DEFAULT '[]',
        asked         INTEGER NOT NULL DEFAULT 0,
        answered      INTEGER NOT NULL DEFAULT 0,
        trade         TEXT NOT NULL,
        room          TEXT NOT NULL,
        city          TEXT NOT NULL,
        status        TEXT NOT NULL,
        data_mode     TEXT NOT NULL,
        evidence_mode TEXT NOT NULL,
        lines         INTEGER NOT NULL DEFAULT 0,
        literal_diffs INTEGER NOT NULL DEFAULT 0,
        accepted      INTEGER NOT NULL DEFAULT 0,
        revised       INTEGER NOT NULL DEFAULT 0,
        llm_agreement REAL,
        rating        INTEGER,
        head_hash     TEXT,
        bytes         INTEGER NOT NULL DEFAULT 0,
        body          BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS briefs_owner ON briefs(owner_hash, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS briefs_share ON briefs(share_hash) WHERE share_hash IS NOT NULL;

      CREATE TABLE IF NOT EXISTS events (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
        at       TEXT NOT NULL,
        kind     TEXT NOT NULL,
        actor    TEXT NOT NULL,
        payload  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_brief ON events(brief_id, id);

      CREATE TABLE IF NOT EXISTS generations (
        brief_id   TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
        layer      TEXT NOT NULL,
        model      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        body       BLOB NOT NULL,
        PRIMARY KEY (brief_id, layer)
      );

      CREATE TABLE IF NOT EXISTS cache (
        ns         TEXT NOT NULL,
        key        TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        body       BLOB NOT NULL,
        PRIMARY KEY (ns, key)
      );
      CREATE INDEX IF NOT EXISTS cache_expiry ON cache(expires_at);
    `,
  },
  {
    version: 2,
    // Human preference study. Anonymous by construction: no names, emails or IPs; a participant is a random session hash.
    sql: `
      CREATE TABLE IF NOT EXISTS study_assignments (
        id           TEXT PRIMARY KEY,
        session_hash TEXT NOT NULL,
        case_id      TEXT NOT NULL,
        case_version TEXT NOT NULL,
        left_system  TEXT NOT NULL,
        right_system TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        used         INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS study_assign_once ON study_assignments(session_hash, case_id);

      CREATE TABLE IF NOT EXISTS study_responses (
        id              TEXT PRIMARY KEY,
        assignment_id   TEXT NOT NULL,
        session_hash    TEXT NOT NULL,
        case_id         TEXT NOT NULL,
        case_version    TEXT NOT NULL,
        data_mode       TEXT NOT NULL,
        rulebook        TEXT NOT NULL,
        left_system     TEXT NOT NULL,
        right_system    TEXT NOT NULL,
        reflects        TEXT NOT NULL,
        designer        TEXT NOT NULL,
        clarity         TEXT NOT NULL,
        constraints     TEXT NOT NULL,
        confidence      INTEGER NOT NULL,
        consent_version TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS study_resp_once ON study_responses(session_hash, case_id);
    `,
  },
  {
    version: 3,
    // Revisions of a specification: each one links the brief it started from to the brief it produced.
    // The brief rows keep their own owner and share rules; this table only records the relationship and the designer's decision.
    sql: `
      CREATE TABLE IF NOT EXISTS revisions (
        id            TEXT PRIMARY KEY,
        root_brief_id TEXT NOT NULL,
        from_brief_id TEXT NOT NULL,
        to_brief_id   TEXT NOT NULL,
        owner_hash    TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        decided_at    TEXT,
        status        TEXT NOT NULL DEFAULT 'proposed',
        changes       TEXT NOT NULL,
        diff          BLOB NOT NULL,
        from_version  TEXT NOT NULL,
        to_version    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS revisions_root ON revisions(root_brief_id, created_at);
      CREATE INDEX IF NOT EXISTS revisions_owner ON revisions(owner_hash);
    `,
  },
];

export async function migrate(db: Db): Promise<number> {
  await db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = await db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
  let version = row ? Number(row.value) : 0;
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    await db.exec(m.sql);
    await db.run("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(m.version)]);
    version = m.version;
  }
  return version;
}
