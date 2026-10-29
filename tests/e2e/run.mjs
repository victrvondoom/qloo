// End-to-end browser tests against a production build in FIXTURE (synthetic) mode.
//
//   npm run build && npm run test:e2e
//
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`
// on a fresh machine). Starts the production server on a free port with synthetic data
// and a temporary database, then drives the designer and client flows on desktop and
// mobile. Works on Windows, macOS and Linux (no shell syntax). Exits non-zero on failure.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(path.join(tmpdir(), "tastespec-e2e-"));
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  env: { ...process.env, QLOO_MODE: "fixture", TASTESPEC_DB_PATH: path.join(dataDir, "e2e.db"), TASTESPEC_RUNS_PER_10_MIN: "200", ANTHROPIC_API_KEY: "", DATABASE_URL: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const results = [];
async function check(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err).slice(0, 500) });
    console.log(`  ✗ ${name}\n    ${String(err).slice(0, 500)}`);
  }
}

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start:\n${serverLog.slice(-2000)}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const MAYA = "Hi! We just bought a place in Chicago and want the living room to feel warm and modern. We're obsessed with Khruangbin, The Bear (the show), anything Wes Anderson, and we always stay at the Ace Hotel. Norah Jones is always on.\n\nThanks,\nMaya";

async function main() {
  const health = await waitForServer();
  console.log(`server on ${BASE}`, JSON.stringify(health));
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  let briefUrl = "";
  let shareUrl = "";

  await check("health: fixture mode, embedded database, no secret values", async () => {
    assert(health.qloo === "fixture", `qloo=${health.qloo}`);
    assert(health.db?.kind === "sqlite", `db=${JSON.stringify(health.db)}`);
    assert(!JSON.stringify(health).match(/sk-|api[_-]?key=|\/tmp\/|\\\\/i), "health leaks something it shouldn't");
  });

  await check("intake API reads a pasted message without a model", async () => {
    const r = await page.request.post(`${BASE}/api/intake`, { data: { text: MAYA } });
    const j = await r.json();
    assert(r.ok() && j.method === "heuristic", `status ${r.status()} ${JSON.stringify(j).slice(0, 200)}`);
    assert(j.draft.city === "Chicago" && j.draft.clientLabel === "Maya", JSON.stringify(j.draft));
    assert(j.draft.loves.length === 5 && j.draft.words.join() === "warm,modern", JSON.stringify(j.draft));
  });

  await check("landing: demo banner, film, and an example lands in the workspace with the draft read", async () => {
    await page.goto(BASE);
    await page.getByText("Demo mode · synthetic data").waitFor();
    assert((await page.locator(".film > svg").count()) === 1, "film missing");
    await page.locator(".hero").getByRole("button", { name: "Maya", exact: true }).click();
    await page.waitForURL(/\/app\?m=/);
    await page.getByText("Check it, then build").waitFor();
    assert((await page.locator(".chips-edit .chip").count()) >= 7, "draft chips missing");
  });

  await check("one button builds the brief; the graph streams while it runs", async () => {
    await page.getByRole("button", { name: /Build the brief/ }).click();
    await page.waitForURL(/\/brief\/b-/, { timeout: 30_000 });
    await page.getByText("What to build").waitFor();
    await page.getByText("FIXTURE · synthetic").first().waitFor();
    await page.locator(".brief-head .direction").waitFor();
    briefUrl = page.url();
  });

  await check("owner can accept a line; review recorded; owner fields stay private", async () => {
    await page.getByRole("button", { name: "Accept" }).first().click();
    await page.getByText("✓ accepted").first().waitFor();
    // Fetch from inside the page so the browser's own (httpOnly) owner cookie is sent.
    const j = await page.evaluate((u) => fetch(u).then((r) => r.json()), briefUrl.replace("/brief/", "/api/briefs/"));
    assert(j.canEdit === true, "owner not recognised");
    assert(j.brief.spec.some((l) => l.history?.length === 1), "review history not recorded");
    assert(!("ownerHash" in j.brief), "owner hash leaked");
  });

  await check("depth: explore Curated and use it for the spec", async () => {
    await page.locator(".depth").getByRole("button", { name: /Curated/ }).click();
    await page.getByRole("button", { name: "Use Curated for the spec" }).click({ timeout: 30_000 });
    await page.getByText("Level 1 · in spec").waitFor({ timeout: 15_000 });
  });

  await check("hand-over: zones, scene table and print are there", async () => {
    await page.getByRole("tab", { name: /Hand-over/ }).click();
    await page.getByText("Where the light goes").waitFor();
    await page.getByText("Scene programming").waitFor();
    assert((await page.locator(".swatch").count()) === 6, "palette missing");
  });

  await check("pathways: a spec line traces back to what they said", async () => {
    await page.getByRole("tab", { name: /Pathways/ }).click();
    assert((await page.locator(".graph-wrap .node").count()) > 30, "graph too small");
    await page.getByRole("button", { name: "Colour temperature", exact: true }).click();
    const text = await page.locator(".callout").innerText();
    assert(/warm/.test(text) && /Colour temperature/.test(text), `pathway: ${text}`);
  });

  await check("influence: leaving each love out measures which lines it decides", async () => {
    await page.getByRole("button", { name: /Measure influence/ }).click();
    await page.getByText(/lines survive dropping any one reference/).first().waitFor({ timeout: 30_000 });
    assert((await page.locator(".influence tbody tr").count()) >= 2, "influence matrix missing");
  });

  await check("evidence: ledger verifies in the browser and replay rebuilds the spec", async () => {
    await page.getByRole("tab", { name: /Evidence/ }).click();
    await page.getByText("Agent execution trace").waitFor();
    await page.getByRole("button", { name: "Verify in your browser" }).click();
    await page.getByText(/Intact: all \d+ entries/).waitFor();
    await page.getByRole("button", { name: "Replay now" }).click();
    await page.getByText(/Spec rebuilds line for line\. \d+ of \d+ lines identical/).waitFor();
  });

  await check("client link: client reacts on a phone, designer sees it live, revoke ends access", async () => {
    await page.getByRole("tab", { name: /Client & activity/ }).click();
    await page.getByRole("button", { name: "Create client link" }).click();
    shareUrl = await page.locator(".share-box code").innerText();
    assert(/\/c\/[0-9a-f]{36}$/.test(shareUrl), `link ${shareUrl}`);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const cp = await phone.newPage();
    cp.on("pageerror", (e) => errors.push(`client: ${e}`));
    await cp.goto(shareUrl);
    await cp.getByText("Line by line").waitFor();
    const html = await cp.content();
    assert(!html.includes(briefUrl.split("/").pop()), "client page leaks the brief id");
    assert(!html.includes("Ace Hotel. Norah") && !html.includes("obsessed with"), "client page leaks the pasted message");
    await cp.getByRole("button", { name: "♥ Love it" }).first().click();
    await cp.getByText("Sent to your designer.").waitFor();
    const sw = await cp.evaluate(() => document.documentElement.scrollWidth);
    assert(sw <= 391, `client page overflows: ${sw}`);
    await page.locator(".feed").getByText(/Loves “/).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Create client link" }).waitFor();
    const r = await cp.request.get(shareUrl.replace("/c/", "/api/c/"));
    assert(r.status() === 404, `expected 404 after revoke, got ${r.status()}`);
    await phone.close();
  });

  await check("another visitor gets a read-only view and 403 on writes", async () => {
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(briefUrl);
    await p2.getByText("Read-only view").waitFor();
    const id = briefUrl.split("/").pop();
    for (const [method, url, data] of [
      ["post", `/api/briefs/${id}/decision`, { lineId: "cct", status: "accepted" }],
      ["post", `/api/briefs/${id}/depth`, { level: 2 }],
      ["post", `/api/briefs/${id}/share`, {}],
      ["get", `/api/briefs/${id}/events`, undefined],
      ["delete", `/api/briefs/${id}`, undefined],
    ]) {
      const r = await p2.request[method](`${BASE}${url}`, data ? { data } : undefined);
      assert(r.status() === 403, `${method} ${url}: expected 403, got ${r.status()}`);
    }
    const j = await (await p2.request.get(`${BASE}/api/briefs/${id}`)).json();
    assert(!j.brief.input.sourceText, "non-owner sees the pasted message");
    const list = await (await p2.request.get(`${BASE}/api/briefs`)).json();
    assert(list.briefs.length === 0, "other visitor can list briefs");
    await other.close();
  });

  await check("tampered bundle fails verification on /verify", async () => {
    const id = briefUrl.split("/").pop();
    const bundle = await (await page.request.get(`${BASE}/api/briefs/${id}/bundle`)).json();
    assert(bundle.evidenceReport?.schema, "bundle lacks evidence report");
    bundle.brief.ledger[2].summary += " (edited)";
    await page.goto(`${BASE}/verify`);
    await page.setInputFiles('input[type="file"]', { name: "tampered.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
    await page.getByText("Chain broken").waitFor();
  });

  await check("Proof Lab: same words run, then 'Without Qloo' recomputes to identical specs", async () => {
    await page.goto(`${BASE}/lab`);
    await page.getByRole("button", { name: "Run both briefs" }).click();
    await page.getByText(/With Qloo: \d+ of \d+ lines differ/).waitFor({ timeout: 40_000 });
    await page.getByRole("button", { name: "Without Qloo" }).click();
    await page.getByText(/Without Qloo: 0 of \d+ lines differ/).waitFor();
  });

  await check("Proof Lab: simulated outage degrades visibly", async () => {
    const card = page.locator(".card", { hasText: "Qloo unavailable (simulated)" });
    await card.getByRole("button", { name: "Run challenge" }).click();
    await card.getByText("degrade (Qloo unavailable)").waitFor({ timeout: 30_000 });
  });

  await check("Proof Lab: no evidence abstains", async () => {
    const card = page.locator(".card", { hasText: "No evidence" }).first();
    await card.getByRole("button", { name: "Run challenge" }).click();
    await card.getByText("abstain (not enough evidence)").waitFor({ timeout: 30_000 });
  });

  await check("Proof Lab: warm kitchen keeps a warm floor", async () => {
    const card = page.locator(".card", { hasText: "Strong functional requirement" });
    await card.getByRole("button", { name: "Run challenge" }).click();
    await card.getByText(/Colour temperature:/).waitFor({ timeout: 30_000 });
    const text = await card.innerText();
    assert(!/Colour temperature:\s*3500K ambient|4000K/.test(text), `warm floor violated: ${text.slice(0, 300)}`);
  });

  await check("same-words test draws two different rooms", async () => {
    await page.goto(`${BASE}/compare`);
    await page.getByRole("button", { name: "Run both briefs" }).click();
    await page.getByText(/of \d+ spec lines differ between Maya and Jordan/).waitFor({ timeout: 40_000 });
    assert((await page.locator(".room svg").count()) === 2, "rooms missing");
  });

  await check("owner can delete a brief, with its activity", async () => {
    await page.goto(briefUrl);
    await page.getByRole("tab", { name: /Client & activity/ }).click();
    await page.getByRole("button", { name: "Delete this brief" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await page.waitForURL(/\/app$/);
    const r = await page.request.get(briefUrl.replace("/brief/", "/api/briefs/"));
    assert(r.status() === 404, `expected 404 after delete, got ${r.status()}`);
  });

  await check("oversized request body is rejected", async () => {
    const r = await page.request.post(`${BASE}/api/run`, { data: { loves: ["x".repeat(40_000)] } });
    assert(r.status() === 413, `expected 413, got ${r.status()}`);
  });

  await check("no console or page errors on desktop", async () => {
    assert(errors.length === 0, errors.join("\n"));
  });

  const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  const d = await dark.newPage();
  const darkErrors = [];
  d.on("pageerror", (e) => darkErrors.push(String(e)));
  await check("dark theme ('after hours') renders the landing page cleanly", async () => {
    await d.goto(BASE);
    const bg = await d.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(bg === "rgb(18, 17, 16)", `body background ${bg}`);
    assert(darkErrors.length === 0, darkErrors.join("\n"));
  });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  for (const route of ["/", "/app", "/lab", "/compare", "/projects", "/verify", "/method"]) {
    await check(`mobile ${route}: no horizontal overflow`, async () => {
      await m.goto(`${BASE}${route}`);
      const sw = await m.evaluate(() => document.documentElement.scrollWidth);
      assert(sw <= 391, `scrollWidth ${sw}`);
    });
  }
  await check("keyboard: skip link is first focusable and targets main", async () => {
    await m.goto(BASE);
    await m.keyboard.press("Tab");
    const href = await m.evaluate(() => document.activeElement?.getAttribute("href"));
    assert(href === "#main", `first focus ${href}`);
  });

  await browser.close();
}

main()
  .catch((e) => {
    results.push({ name: "harness", ok: false, error: String(e) });
    console.error(e);
  })
  .finally(() => {
    server.kill("SIGTERM");
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
    process.exit(failed.length ? 1 : 0);
  });
