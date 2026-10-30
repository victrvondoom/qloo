// The live-verification harness, tested against stand-ins. None of these runs is LIVE VERIFIED
// because none talks to real Qloo; the harness must say so.
import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache, type Params, type RawResponse, type Transport } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";
import { HACKATHON_BASE_URL } from "@/lib/env";
import { verifyQloo } from "@/lib/live-verify";

beforeEach(() => {
  process.env.QLOO_MODE = "fixture";
  clearQlooCache();
});

class Wrapped implements Transport {
  private inner = new FixtureTransport();
  constructor(readonly mode: "live" | "fixture", private rewrite: (path: string, p: Params, r: RawResponse) => RawResponse = (_a, _b, r) => r) {}
  async get(path: string, params: Params) {
    return this.rewrite(path, params, await this.inner.get(path, params));
  }
}

describe("verifyQloo", () => {
  it("passing against the fixture world is CONTRACT TESTED, never LIVE VERIFIED", async () => {
    const r = await verifyQloo({ transport: new FixtureTransport() });
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.status).toBe("CONTRACT TESTED");
    expect(r.againstRealQloo).toBe(false);
    expect(r.summary.differingLines).toBeGreaterThan(0);
  });

  it("a live-mode transport on another host is still only CONTRACT TESTED", async () => {
    const r = await verifyQloo({ transport: new Wrapped("live"), baseUrl: "http://127.0.0.1:9999" });
    expect(r.status).toBe("CONTRACT TESTED");
    expect(r.againstRealQloo).toBe(false);
  });

  it("LIVE VERIFIED needs a live transport on the hackathon host (logic check with a stand-in)", async () => {
    // The stand-in returns fixture data labelled live; the real harness only gets this far with a real key.
    const r = await verifyQloo({ transport: new Wrapped("live"), baseUrl: HACKATHON_BASE_URL });
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.status).toBe("LIVE VERIFIED");
  });

  it("an expired credential is FAILED with the status in the message", async () => {
    const r = await verifyQloo({ transport: new Wrapped("live", () => ({ status: 401, body: { message: "invalid key" } })), baseUrl: HACKATHON_BASE_URL });
    expect(r.status).toBe("FAILED");
    expect(r.checks[0]).toMatchObject({ ok: false });
    expect(r.checks[0].detail).toMatch(/auth|401/i);
  });

  it("malformed responses fail the run instead of being papered over", async () => {
    const r = await verifyQloo({ transport: new Wrapped("fixture", (path, _p, res) => (path === "/v2/insights" ? { status: 200, body: { results: ["x", 1, null] } } : res)) });
    expect(r.status).toBe("FAILED");
    expect(r.checks.some((c) => !c.ok && /workflow/.test(c.name))).toBe(true);
  });

  it("identical specs for different loves fail the differentiation check", async () => {
    // Every insight query returns the same places, so both clients get the same evidence.
    let first: RawResponse | undefined;
    const t = new Wrapped("fixture", (path, p, res) => {
      if (path !== "/v2/insights" || p["filter.type"] !== "urn:entity:place" || !p["signal.interests.entities"]) return res;
      first ??= res;
      return first;
    });
    const r = await verifyQloo({ transport: t });
    const c = r.checks.find((x) => /different loves/.test(x.name))!;
    expect(c.ok).toBe(false);
    expect(r.status).toBe("FAILED");
  });
});
