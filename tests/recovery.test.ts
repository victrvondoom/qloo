// What a judge would see when Qloo misbehaves: a labelled, recoverable outcome, never invented evidence,
// a hang, or a quiet fall back to fixtures.
import { beforeEach, describe, expect, it } from "vitest";
import { runBrief, upstreamHint, validateBrief } from "@/lib/agent";
import { verifyLedger } from "@/lib/ledger";
import { clearQlooCache, type Params, type RawResponse, type Transport } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { verifyLedger as verify } from "@/lib/ledger";

const maya = { clientLabel: "Maya", trade: "lighting" as const, room: "living_room" as const, city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
const live = (fn: (path: string, p: Params) => Promise<RawResponse> | RawResponse): Transport => ({ mode: "live", get: async (path, p) => fn(path, p) });

beforeEach(() => {
  process.env.QLOO_MODE = "fixture";
  clearQlooCache();
});

function expectHonestFallback(b: Awaited<ReturnType<typeof runBrief>>) {
  expect(b.status).toBe("UPSTREAM_UNAVAILABLE");
  expect(b.dataMode).toBe("live"); // never relabelled as fixture, never silently swapped for fixture data
  for (const l of b.spec) {
    expect(l.value).toBe(l.literalValue);
    expect(l.confidence).toBe("low");
    expect(l.evidence).toEqual([]);
  }
  expect(b.crowdVenues).toEqual([]);
  expect(validateBrief(b)).toEqual([]);
}

describe("Qloo failures", () => {
  it("authentication fails: one attempt, a plain recovery instruction, no personalisation, no key", async () => {
    process.env.QLOO_API_KEY = "sk-secret-key-123456";
    let calls = 0;
    try {
      const b = await runBrief(maya, () => {}, { transport: live(() => (calls++, { status: 401, body: { message: "invalid key sk-secret-key-123456" } })) });
      expectHonestFallback(b);
      expect(calls).toBeLessThanOrEqual(maya.loves.length + 2); // no retry storms on a credential problem
      expect(b.warnings.join(" ")).toMatch(/rejected the API key/);
      expect(JSON.stringify(b)).not.toContain("sk-secret-key-123456");
    } finally {
      delete process.env.QLOO_API_KEY;
    }
  });

  it("rate limited for good: bounded retries, then a labelled fallback that says to wait", async () => {
    const t = live(() => ({ status: 429, body: {}, retryAfterMs: 1 }));
    const b = await runBrief(maya, () => {}, { transport: t });
    expectHonestFallback(b);
    expect(b.warnings.join(" ")).toMatch(/rate-limiting|Wait a minute/i);
    expect(b.stats.qlooRetries).toBeLessThan(40);
  });

  it("times out: ends within the budget with a labelled fallback instead of hanging", async () => {
    const t = live(() => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
    const t0 = Date.now();
    const b = await runBrief(maya, () => {}, { transport: t, budgetMs: 20_000 });
    expect(Date.now() - t0).toBeLessThan(15_000);
    expectHonestFallback(b);
  });

  it("malformed payload everywhere: abstains, does not invent evidence", async () => {
    const b = await runBrief(maya, () => {}, { transport: live(() => ({ status: 200, body: { results: "<html>gateway error</html>" } })) });
    expect(["INSUFFICIENT_EVIDENCE", "UPSTREAM_UNAVAILABLE"]).toContain(b.status);
    for (const l of b.spec) expect(l.value).toBe(l.literalValue);
    expect(b.crowdVenues).toEqual([]);
  });

  it("every failure kind has an actionable hint and none mentions a secret", () => {
    for (const k of ["auth", "rate_limit", "timeout", "deadline", "network", "budget", "upstream", "bad_request"] as const) {
      const h = upstreamHint(k);
      expect(h.length).toBeGreaterThan(20);
      expect(h).not.toMatch(/sk-|key=/i);
    }
  });
});

describe("interrupted and repeated runs", () => {
  it("cancelling mid-run stops it and returns nothing to save", async () => {
    const ac = new AbortController();
    const inner = new FixtureTransport();
    let n = 0;
    const t: Transport = { mode: "fixture", get: async (p, q) => (++n === 3 && ac.abort(), inner.get(p, q)) };
    await expect(runBrief(maya, () => {}, { transport: t, signal: ac.signal })).rejects.toMatchObject({ state: "CANCELLED" });
  });

  it("a client that stops reading cannot wedge the run: emit errors surface, the run still finishes", async () => {
    let emitted = 0;
    const b = await runBrief(maya, () => {
      if (++emitted === 4) throw new Error("socket closed");
    }).catch((e: Error) => e);
    // Either the run completes without the broken stream or it fails cleanly; it must never hang or return a half-built brief.
    if (b instanceof Error) expect(b.message).toMatch(/socket closed|cancel|abort/i);
    else expect(["COMPLETE", "NEEDS_CLARIFICATION"]).toContain(b.status);
  });

  it("two identical submissions give two independent, valid briefs", async () => {
    const [a, b] = await Promise.all([runBrief(maya, () => {}), runBrief(maya, () => {})]);
    expect(a.id).not.toBe(b.id);
    expect(JSON.stringify(a.spec.map((l) => l.value))).toBe(JSON.stringify(b.spec.map((l) => l.value)));
    for (const x of [a, b]) expect((await verifyLedger(x.ledger)).ok).toBe(true);
  });

  it("a stored evidence record that was edited is caught by the ledger check", async () => {
    const b = await runBrief(maya, () => {});
    const forged = structuredClone(b.ledger);
    const i = forged.findIndex((e) => e.kind === "qloo_call");
    forged[i].summary = forged[i].summary.replace("200", "201");
    const r = await verify(forged);
    expect(r.ok).toBe(false);
    expect(r.firstBadSeq).toBe(forged[i].seq);
  });
});
