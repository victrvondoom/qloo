// Request de-duplication and the bounded cache: fewer Qloo calls, same answers, no stuck waiters.
import { beforeEach, describe, expect, it } from "vitest";
import { clearQlooCache, QlooClient, type Params, type RawResponse, type Transport } from "@/lib/qloo/client";
import { FixtureTransport } from "@/lib/qloo/fixture";

class Slow implements Transport {
  readonly mode = "fixture" as const;
  calls = 0;
  private inner = new FixtureTransport();
  constructor(private delay = 20, private fail = false) {}
  async get(path: string, p: Params, signal?: AbortSignal): Promise<RawResponse> {
    this.calls++;
    await new Promise((r, rej) => {
      const t = setTimeout(r, this.delay);
      signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); });
    });
    if (this.fail) return { status: 503, body: {} };
    return this.inner.get(path, p);
  }
}
const noSleep = async () => {};

beforeEach(() => clearQlooCache());

describe("query budget", () => {
  it("two identical concurrent requests make one transport call and agree", async () => {
    const t = new Slow();
    const c = new QlooClient(t, undefined, { sleep: noSleep });
    const [a, b] = await Promise.all([c.search("Khruangbin"), c.search("Khruangbin")]);
    expect(t.calls).toBe(1);
    expect(c.stats.deduped).toBe(1);
    expect(a.value).toEqual(b.value);
  });
  it("a later identical request is a cache hit; different requests are not merged", async () => {
    const t = new Slow(1);
    const c = new QlooClient(t, undefined, { sleep: noSleep });
    await c.search("Khruangbin");
    await c.search("Khruangbin");
    await c.search("Norah Jones");
    expect(t.calls).toBe(2);
    expect(c.stats.cacheHits).toBe(1);
  });
  it("cache:false bypasses both, so the saving can be measured", async () => {
    const t = new Slow(1);
    const c = new QlooClient(t, undefined, { sleep: noSleep, cache: false });
    await Promise.all([c.search("Khruangbin"), c.search("Khruangbin")]);
    expect(t.calls).toBe(2);
  });
  it("a failed request is not cached and its waiter retries on its own", async () => {
    const bad = new Slow(5, true);
    const c1 = new QlooClient(bad, undefined, { sleep: noSleep });
    await expect(c1.search("x")).rejects.toThrow();
    const good = new Slow(1);
    const c2 = new QlooClient(good, undefined, { sleep: noSleep });
    await expect(c2.search("x")).resolves.toBeDefined();
    expect(good.calls).toBe(1);
  });
  it("cancelling the leader never leaves another request waiting forever", async () => {
    const t = new Slow(200);
    const ac = new AbortController();
    const leader = new QlooClient(t, undefined, { sleep: noSleep, signal: ac.signal }).search("Khruangbin").catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 5));
    const follower = new QlooClient(new Slow(5), undefined, { sleep: noSleep }).search("Khruangbin");
    ac.abort();
    expect(await leader).toBeInstanceOf(Error);
    const r = await Promise.race([follower, new Promise((_, rej) => setTimeout(() => rej(new Error("follower stuck")), 3000))]);
    expect(r).toBeDefined();
  });
});
