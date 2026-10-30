// Server side of the study: case loading, anonymous sessions, assignments and responses.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { sha256Hex } from "./ledger";
import { CHOICES, CONSENT_VERSION, CRITERIA, distinctPairs, pickPair, summarize, validCases, type Choice, type ResponseRow, type StudyCase, type StudySystem } from "./study";

export const STUDY_COOKIE = "ts_study";
const SESSION_RE = /^[0-9a-f]{32}$/;
let cases: Promise<StudyCase[]> | undefined;

/** Cases whose content still matches their hash. Empty if the file is missing or edited. */
export function loadCases(): Promise<StudyCase[]> {
  cases ??= readFile(path.join(process.cwd(), "study", "cases.json"), "utf8").then((t) => validCases(JSON.parse(t))).catch(() => []);
  return cases;
}

/** Tests: reset the cache. */
export function resetCases() {
  cases = undefined;
}

export async function studyStatus() {
  const db = await getDb();
  const all = await loadCases();
  const usable = all.filter((c) => distinctPairs(c).length > 0);
  return {
    // Collecting responses needs storage that survives; without it the study is off rather than quietly losing data.
    enabled: db.durable && usable.length > 0,
    durable: db.durable,
    reason: !db.durable ? "This deployment has no durable storage, so responses would be lost. Set DATABASE_URL or run it locally." : usable.length === 0 ? "No study cases have been built (npm run study:cases)." : undefined,
    consentVersion: CONSENT_VERSION,
    cases: usable.map((c) => ({ id: c.id, title: c.title, dataMode: c.dataMode })),
  };
}

export async function sessionHash(create: boolean): Promise<string | undefined> {
  const jar = await cookies();
  let v = jar.get(STUDY_COOKIE)?.value;
  if (!v || !SESSION_RE.test(v)) {
    if (!create) return undefined;
    v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    jar.set(STUDY_COOKIE, v, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return sha256Hex(`study:${v}`);
}

export const withdrawCode = (session: string) => session.slice(0, 12);

/** Creates (or returns) the blinded assignment for this participant and case. Blinded: the system names never leave the server. */
export async function assign(session: string, caseId: string) {
  const all = await loadCases();
  const c = all.find((x) => x.id === caseId);
  if (!c) return { error: "Unknown case.", status: 404 as const };
  const db = await getDb();
  const done = await db.get("SELECT 1 AS x FROM study_responses WHERE session_hash = ? AND case_id = ?", [session, caseId]);
  if (done) return { answered: true as const };
  let row = await db.get<{ id: string; left_system: StudySystem; right_system: StudySystem; case_version: string }>("SELECT id, left_system, right_system, case_version FROM study_assignments WHERE session_hash = ? AND case_id = ?", [session, caseId]);
  if (!row || row.case_version !== c.version) {
    const pair = pickPair(distinctPairs(c));
    if (!pair) return { error: "This case has no pair of different specifications.", status: 409 as const };
    const id = crypto.randomUUID();
    await db.run("DELETE FROM study_assignments WHERE session_hash = ? AND case_id = ?", [session, caseId]);
    await db.run("INSERT INTO study_assignments (id, session_hash, case_id, case_version, left_system, right_system, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, session, caseId, c.version, pair.left, pair.right, new Date().toISOString()]);
    row = { id, left_system: pair.left, right_system: pair.right, case_version: c.version };
  }
  return { assignmentId: row.id, brief: c.brief, dataMode: c.dataMode, title: c.title, left: c.candidates[row.left_system]!, right: c.candidates[row.right_system]! };
}

export interface RespondBody {
  assignmentId?: unknown;
  consent?: unknown;
  answers?: Record<string, unknown>;
  confidence?: unknown;
}

export async function respond(session: string, body: RespondBody) {
  if (body.consent !== true) return { error: "Consent is required to submit a response.", status: 400 as const };
  if (typeof body.assignmentId !== "string" || body.assignmentId.length > 64) return { error: "Missing assignment.", status: 400 as const };
  const answers = body.answers ?? {};
  for (const c of CRITERIA) if (!CHOICES.includes(answers[c] as Choice)) return { error: `Answer every question (missing: ${c}).`, status: 400 as const };
  const conf = body.confidence;
  if (typeof conf !== "number" || !Number.isInteger(conf) || conf < 1 || conf > 5) return { error: "Confidence must be 1 to 5.", status: 400 as const };
  const db = await getDb();
  const a = await db.get<{ id: string; case_id: string; case_version: string; left_system: StudySystem; right_system: StudySystem; used: number }>("SELECT * FROM study_assignments WHERE id = ? AND session_hash = ?", [body.assignmentId, session]);
  if (!a) return { error: "That assignment isn't yours or has expired. Reload the case.", status: 404 as const };
  if (a.used) return { error: "That case was already answered.", status: 409 as const };
  const c = (await loadCases()).find((x) => x.id === a.case_id && x.version === a.case_version);
  if (!c) return { error: "This case was updated since you opened it. Reload to continue.", status: 409 as const };
  try {
    await db.tx([
      {
        sql: "INSERT INTO study_responses (id, assignment_id, session_hash, case_id, case_version, data_mode, rulebook, left_system, right_system, reflects, designer, clarity, constraints, confidence, consent_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [crypto.randomUUID(), a.id, session, a.case_id, a.case_version, c.dataMode, c.rulebook, a.left_system, a.right_system, answers.reflects as string, answers.designer as string, answers.clarity as string, answers.constraints as string, conf, CONSENT_VERSION, new Date().toISOString()],
      },
      { sql: "UPDATE study_assignments SET used = 1 WHERE id = ?", args: [a.id] },
    ]);
  } catch {
    return { error: "That case was already answered.", status: 409 as const };
  }
  return { ok: true as const, withdrawCode: withdrawCode(session) };
}

/** Deletes everything from this browser's session, or from a withdraw code. Returns how many responses went. */
export async function withdraw(session: string | undefined, code?: string) {
  const db = await getDb();
  const prefix = code && /^[0-9a-f]{12}$/.test(code) ? code : undefined;
  if (!session && !prefix) return 0;
  const where = prefix ? "session_hash LIKE ?" : "session_hash = ?";
  const arg = prefix ? `${prefix}%` : session!;
  const n = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM study_responses WHERE ${where}`, [arg]);
  await db.tx([
    { sql: `DELETE FROM study_responses WHERE ${where}`, args: [arg] },
    { sql: `DELETE FROM study_assignments WHERE ${where}`, args: [arg] },
  ]);
  return Number(n?.n ?? 0);
}

export async function allResponses(): Promise<ResponseRow[]> {
  const db = await getDb();
  return db.all<ResponseRow>("SELECT case_id, case_version, data_mode, left_system, right_system, reflects, designer, clarity, constraints, confidence FROM study_responses ORDER BY created_at");
}

export async function results() {
  return summarize(await allResponses());
}
