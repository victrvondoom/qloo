// End-to-end browser tests against a production build in FIXTURE mode.
//
//   npm run build && npm run test:e2e
//
// Needs Playwright with Chromium available (`npm i -D playwright && npx playwright install chromium`
// on a fresh machine). Starts `next start` on a free port with synthetic data and a temp store,
// then drives desktop and mobile flows. Exits non-zero on the first failure.

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
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, QLOO_MODE: "fixture", TASTESPEC_DATA_DIR: dataDir, TASTESPEC_RUNS_PER_10_MIN: "200", ANTHROPIC_API_KEY: "" },
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
    results.push({ name, ok: false, error: String(err).slice(0, 400) });
    console.log(`  ✗ ${name}\n    ${String(err).slice(0, 400)}`);
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
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

  await check("health reports fixture mode and no secret values", async () => {
    assert(health.qloo === "fixture", `qloo=${health.qloo}`);
    assert(!JSON.stringify(health).match(/sk-|api[_-]?key=/i), "health leaks something key-like");
  });

  await check("home shows the FIXTURE banner and builds a brief end to end", async () => {
    await page.goto(BASE);
    await page.getByText("FIXTURE mode: synthetic data").waitFor();
    await page.getByRole("button", { name: "Build the brief" }).click();
    await page.waitForURL(/\/brief\/b-/, { timeout: 30_000 });
    await page.getByText("What to build").waitFor();
    await page.getByText("FIXTURE · synthetic").first().waitFor();
    briefUrl = page.url();
  });

  await check("brief shows basis labels, trace and evidence; ledger verifies in browser", async () => {
    await page.getByText("Agent execution trace").waitFor();
    assert((await page.getByText("Qloo evidence").count()) > 0, "no Qloo-evidence basis labels");
    await page.getByRole("button", { name: "Verify chain in your browser" }).click();
    await page.getByText(/Intact: all \d+ entries/).waitFor();
  });

  await check("owner can accept a line and the review is recorded", async () => {
    await page.getByRole("button", { name: "Accept" }).first().click();
    await page.getByText("accepted", { exact: true }).first().waitFor();
    // Fetch from inside the page so the browser's own (Secure, httpOnly) owner cookie is sent.
    const j = await page.evaluate((u) => fetch(u).then((r) => r.json()), briefUrl.replace("/brief/", "/api/briefs/"));
    assert(j.canEdit === true, "owner not recognised");
    assert(j.brief.spec.some((l) => l.history?.length === 1), "review history not recorded");
    assert(!("ownerHash" in j.brief), "owner hash leaked");
  });

  await check("another visitor gets a read-only view and 403 on writes", async () => {
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(briefUrl);
    await p2.getByText("Read-only view").waitFor();
    const id = briefUrl.split("/").pop();
    const r = await p2.request.post(`${BASE}/api/briefs/${id}/decision`, { data: { lineId: "cct", status: "accepted" } });
    assert(r.status() === 403, `expected 403, got ${r.status()}`);
    const del = await p2.request.delete(`${BASE}/api/briefs/${id}`);
    assert(del.status() === 403, `expected 403 on delete, got ${del.status()}`);
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
    await card.getByText("LIVE · DEGRADED").or(card.getByText("FIXTURE · synthetic")).first().waitFor();
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

  await check("owner can delete a brief", async () => {
    await page.goto(briefUrl);
    await page.getByRole("button", { name: "Delete brief" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await page.waitForURL(/\/projects/);
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

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  for (const route of ["/", "/lab", "/compare", "/projects", "/verify", "/method"]) {
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
