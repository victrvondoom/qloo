// The human preference study: blinding, consent, anonymity, duplicates, withdrawal and honest aggregation.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openSqlite } from "@/lib/db/sqlite";
import { migrate } from "@/lib/db/schema";
import { setDbForTests, type Db } from "@/lib/db";
import { assign, allResponses, loadCases, respond, results, withdraw, withdrawCode } from "@/lib/study-store";
import { caseVersion, distinctPairs, pickPair, summarize, validCases, wilson, type ResponseRow, type StudyCase } from "@/lib/study";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));

let db: Db;
const S1 = "1".repeat(64);
const S2 = "2".repeat(64);
const good = { consent: true, answers: { reflects: "A", designer: "B", clarity: "equal", constraints: "neither" }, confidence: 4 };

beforeAll(async () => {
  db = openSqlite(path.join(mkdtempSync(path.join(tmpdir(), "study-")), "s.db"));
  await migrate(db);
  setDbForTests(db);
});
afterAll(async () => {
  setDbForTests();
  await db.close();
});

describe("cases", () => {
  it("the shipped cases match their version hashes and each has a pair that differs", async () => {
    const cases = await loadCases();
    expect(cases.length).toBeGreaterThanOrEqual(3);
    for (const c of cases) expect(distinctPairs(c).length).toBeGreaterThan(0);
  });
  it("an edited case is dropped, not served", async () => {
    const [c] = await loadCases();
    const edited = JSON.parse(JSON.stringify(c)) as StudyCase;
    edited.candidates.B3![0].value = "something else";
    expect(await validCases([c, edited])).toHaveLength(1);
    const { version, ...rest } = c;
    expect(await caseVersion(rest)).toBe(version);
  });
  it("identical candidates are never paired", () => {
    const l = [{ category: "x", value: "y" }];
    expect(distinctPairs({ candidates: { B0: l, B3: l } })).toEqual([]);
    expect(distinctPairs({ candidates: { B0: l, B2: [{ category: "x", value: "z" }], B3: l } })).toEqual([["B0", "B2"], ["B2", "B3"]]);
  });
});

describe("blinded assignment", () => {
  it("randomises sides evenly and never names the system to the participant", async () => {
    let left = 0;
    for (let i = 0; i < 400; i++) if (pickPair([["B0", "B3"]])!.left === "B0") left++;
    expect(left).toBeGreaterThan(140);
    expect(left).toBeLessThan(260);
    const [c] = await loadCases();
    const a = await assign(S1, c.id);
    expect("error" in a).toBe(false);
    if ("error" in a || "answered" in a) return;
    expect(JSON.stringify(a)).not.toMatch(/B0|B2|B3|Tastespec|Literal|Qloo mapping/);
  });
  it("gives the same participant the same assignment on reload", async () => {
    const [c] = await loadCases();
    const a = await assign(S1, c.id);
    const b = await assign(S1, c.id);
    expect("assignmentId" in a && "assignmentId" in b && a.assignmentId === b.assignmentId).toBe(true);
  });
});

describe("responses", () => {
  it("rejects missing consent, bad answers, bad confidence and foreign assignments", async () => {
    const [c] = await loadCases();
    const a = await assign(S1, c.id);
    if ("error" in a || "answered" in a) throw new Error("no assignment");
    expect(await respond(S1, { ...good, consent: false, assignmentId: a.assignmentId })).toMatchObject({ status: 400 });
    expect(await respond(S1, { ...good, answers: { ...good.answers, clarity: "maybe" }, assignmentId: a.assignmentId })).toMatchObject({ status: 400 });
    expect(await respond(S1, { ...good, confidence: 9, assignmentId: a.assignmentId })).toMatchObject({ status: 400 });
    expect(await respond(S2, { ...good, assignmentId: a.assignmentId })).toMatchObject({ status: 404 });
    expect((await allResponses()).length).toBe(0);
  });
  it("stores the systems behind each side and the exact case version, once per participant and case", async () => {
    const [c] = await loadCases();
    const a = await assign(S1, c.id);
    if ("error" in a || "answered" in a) throw new Error("no assignment");
    const r = await respond(S1, { ...good, assignmentId: a.assignmentId });
    expect(r).toMatchObject({ ok: true, withdrawCode: withdrawCode(S1) });
    const rows = await allResponses();
    expect(rows).toHaveLength(1);
    expect(rows[0].case_version).toBe(c.version);
    expect(rows[0].left_system).not.toBe(rows[0].right_system);
    expect(await respond(S1, { ...good, assignmentId: a.assignmentId })).toMatchObject({ status: 409 });
    expect(await assign(S1, c.id)).toEqual({ answered: true });
  });
  it("stores nothing that identifies a person", async () => {
    const row = await db.get<Record<string, unknown>>("SELECT * FROM study_responses LIMIT 1");
    expect(Object.keys(row!).sort()).toEqual(["assignment_id", "case_id", "case_version", "clarity", "confidence", "consent_version", "constraints", "created_at", "data_mode", "designer", "id", "left_system", "reflects", "right_system", "rulebook", "session_hash"]);
    expect(Object.keys((await allResponses())[0])).not.toContain("session_hash");
  });
});

describe("withdrawal", () => {
  it("a withdraw code deletes that participant's responses and no one else's", async () => {
    const cases = await loadCases();
    const a2 = await assign(S2, cases[0].id);
    if ("error" in a2 || "answered" in a2) throw new Error("no assignment");
    await respond(S2, { ...good, assignmentId: a2.assignmentId });
    expect((await allResponses()).length).toBe(2);
    expect(await withdraw(undefined, "zzzzzzzzzzzz")).toBe(0);
    expect(await withdraw(undefined, withdrawCode(S1))).toBe(1);
    const left = await db.all<{ session_hash: string }>("SELECT session_hash FROM study_responses");
    expect(left.map((r) => r.session_hash)).toEqual([S2]);
    expect(await withdraw(S2)).toBe(1);
    expect((await results()).responses).toBe(0);
    // Withdrawn participants can answer again; their duplicate guard went with their data.
    expect("assignmentId" in (await assign(S1, cases[0].id))).toBe(true);
  });
});

describe("analysis", () => {
  const row = (left: ResponseRow["left_system"], right: ResponseRow["right_system"], v: ResponseRow["reflects"], conf = 3): ResponseRow => ({ case_id: "c", case_version: "v".repeat(64), data_mode: "fixture", left_system: left, right_system: right, reflects: v, designer: v, clarity: v, constraints: v, confidence: conf });
  it("zero responses is zero, not a result", () => {
    const s = summarize([]);
    expect(s).toMatchObject({ responses: 0, interpretable: false, byPair: [] });
  });
  it("attributes a choice to the system that was on that side, and keeps ties and neither apart", () => {
    const s = summarize([row("B3", "B0", "A"), row("B0", "B3", "B"), row("B3", "B0", "B"), row("B0", "B3", "equal"), row("B3", "B0", "neither")]);
    const p = s.byPair.find((x) => x.pair === "B0 vs B3")!;
    expect(p.responses).toBe(5);
    expect(p.criteria.reflects).toMatchObject({ first: 1, second: 2, equal: 1, neither: 1, decisive: 3 });
    expect(s.interpretable).toBe(false);
  });
  it("Wilson intervals are sane", () => {
    expect(wilson(0, 0).p).toBeNull();
    const w = wilson(7, 10);
    expect(w.lo!).toBeLessThan(0.7);
    expect(w.hi!).toBeGreaterThan(0.7);
    expect(wilson(10, 10).hi).toBe(1);
  });
});
