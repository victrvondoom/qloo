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

  await check("anatomy: each love queried alone; coherence, conflict, core, stability", async () => {
    await page.getByRole("tab", { name: /Anatomy/ }).click();
    await page.getByRole("button", { name: /Run anatomy/ }).click();
    await page.locator(".heatmap").waitFor({ timeout: 40_000 });
    for (const t of ["Coherence", "Niche index", "Consensus core", "Solid lines"]) await page.getByText(t, { exact: true }).first().waitFor();
    assert((await page.locator(".heat-cell").count()) >= 20, "heatmap too small");
  });

  await check("hand-over: 3D room, light clock, quantities, CSV and JSON exports", async () => {
    await page.getByRole("tab", { name: /Hand-over/ }).click();
    await page.getByText("What's on, hour by hour").waitFor();
    await page.getByText("Quantities for this room size").waitFor();
    await page.locator(".room-stage, .card").getByRole("button", { name: "3D", exact: true }).first().click();
    await page.locator(".room3d canvas, .room3d .cap").first().waitFor({ timeout: 20_000 });
    const api = briefUrl.replace("/brief/", "/api/briefs/");
    const csv = await page.evaluate((u) => fetch(`${u}/export?format=csv`).then(async (r) => [r.status, await r.text()]), api);
    assert(csv[0] === 200 && /SYNTHETIC/.test(csv[1]), `csv ${csv[0]} ${String(csv[1]).slice(0, 120)}`);
    const json = await page.evaluate((u) => fetch(`${u}/export?format=json`).then((r) => r.status), api);
    assert(json === 200, `json ${json}`);
  });

  await check("command palette opens with ⌘K and jumps to a page", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor();
    await page.keyboard.type("method");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/method/);
    await page.goto(briefUrl);
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
    // Two rooms from each client's own spec, plus the duet panel's merged room.
    await page.getByText(/taste similarity/).waitFor({ timeout: 20_000 });
    assert((await page.locator(".room svg").count()) === 3, "expected two client rooms and one duet room");
  });

  await check("activity: spec history from the ledger and similar past clients", async () => {
    await page.goto(briefUrl);
    await page.getByRole("tab", { name: /Client & activity/ }).click();
    await page.getByText("Spec history · from the ledger").waitFor();
    await page.getByText("Clients like this one · your past briefs").waitFor();
  });

  await check("duet: two briefs merge into one room with verdicts per line", async () => {
    await page.goto(`${BASE}/projects`);
    await page.locator(".space3d").waitFor();
    const ids = await page.evaluate(() => fetch("/api/space").then((r) => r.json()));
    const list = ids.points ?? ids;
    assert(list.length >= 2, `space has ${list.length} points`);
    await page.goto(`${BASE}/compare?a=${list[0].id}&b=${list[1].id}`);
    await page.getByText(/taste similarity/).waitFor({ timeout: 20_000 });
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

  await check("a colour-temperature range written in the message is shown as a hard limit and holds in the spec", async () => {
    await page.goto(`${BASE}/app`);
    const text = "Hi, we're in Chicago and want a modern living room. We love Fred again.., Severance (show), MUJI and Blue Bottle Coffee. Please keep the light between 2700K and 3000K.\n\nThanks, Jordan";
    await page.getByRole("textbox").first().fill(text);
    await page.getByText("Hard limit").waitFor();
    await page.getByRole("button", { name: /Build the brief/ }).click();
    await page.waitForURL(/\/brief\/b-/, { timeout: 30_000 });
    await page.getByText("What to build").waitFor();
    const id = page.url().split("/brief/")[1];
    const j = await page.evaluate((i) => fetch(`/api/briefs/${i}`).then((r) => r.json()), id);
    const cct = j.brief.spec.find((l) => l.id === "cct");
    const ks = (cct.value.match(/\d{4}/g) ?? []).map(Number);
    assert(ks.length > 0 && ks.every((k) => k >= 2700 && k <= 3000), `cct ${cct.value}`);
    assert(j.brief.input.cctRange?.min === 2700 && j.brief.input.cctRange?.max === 3000, "range not stored on the brief");
    await page.request.delete(`${BASE}/api/briefs/${id}`).catch(() => {});
  });

  await check("judge tour: eight steps, each runs the real pipeline (words alone, evidence, trace, specs, no-Qloo, challenge, ledger)", async () => {
    const shot = process.env.TOUR_SHOTS;
    const snap = async (n) => shot && (await page.screenshot({ path: `${shot}/tour-${n}.png`, fullPage: false }));
    await page.goto(`${BASE}/lab`);
    const tour = page.locator("#tour");
    await tour.getByText("Two clients say").waitFor();
    await tour.getByRole("button", { name: "Show what their words alone produce" }).click();
    await tour.getByText(/Identical for both/).waitFor();
    await snap(1);
    await tour.getByRole("button", { name: /2\. References/ }).click();
    await tour.getByText("Khruangbin").waitFor();
    await tour.getByRole("button", { name: /3\. Evidence/ }).click();
    await tour.getByRole("button", { name: "Run both agents" }).click();
    await tour.getByText(/Qloo requests · ledger/).first().waitFor({ timeout: 40_000 });
    assert((await tour.getByText("FIXTURE · synthetic").count()) >= 2, "fixture label missing in DEMO mode");
    await snap(3);
    await tour.getByRole("button", { name: /4\. Reasoning/ }).click();
    await tour.getByRole("columnheader", { name: "Decision" }).waitFor();
    assert((await tour.locator("tbody tr").count()) >= 5, "decision trace too short");
    await tour.getByRole("button", { name: /5\. Specs/ }).click();
    await tour.getByText(/lines differ/).waitFor();
    assert((await tour.locator("tr.changed").count()) >= 1, "no differing line shown");
    await snap(5);
    await tour.getByRole("button", { name: /6\. Remove Qloo/ }).click();
    await tour.getByRole("button", { name: "Recompute without Qloo" }).click();
    await tour.getByRole("columnheader", { name: "Without Qloo" }).waitFor();
    await tour.getByRole("button", { name: /7\. Challenge/ }).click();
    await tour.getByRole("button", { name: "Run Jordan with this requirement" }).click();
    await tour.getByText(/client range .* applied/).first().waitFor({ timeout: 40_000 });
    await tour.getByRole("columnheader", { name: "Jordan, evidence only" }).waitFor();
    const text = await tour.locator("tbody").last().innerText();
    assert(/2700K|3000K/.test(text), `constraint row missing: ${text.slice(0, 200)}`);
    await snap(7);
    await tour.getByLabel("What the client wrote").fill("CRI of at least 90 and CRI of at least 97");
    await tour.getByText(/two different CRI minimums/).waitFor();
    assert(await tour.getByRole("button", { name: "Run Jordan with this requirement" }).isDisabled(), "conflict should block the run");
    await tour.getByRole("button", { name: /8\. Verify/ }).click();
    await tour.getByRole("button", { name: "Verify Maya\u2019s ledger" }).click();
    await tour.getByText(/Intact: all \d+ entries/).waitFor();
    await snap(8);
  });

  await check("study: consent gate, blinded pair, one answer per case, results say too few, withdrawal removes it (throwaway test database)", async () => {
    await page.goto(`${BASE}/study/results`);
    await page.getByText("NO HUMAN DATA COLLECTED").waitFor({ timeout: 8000 }).catch(async () => {
      throw new Error(`results not empty at start: ${(await page.locator("main").innerText()).slice(0, 200)}`);
    });
    await page.goto(`${BASE}/study`);
    const begin = page.getByRole("button", { name: "Begin" });
    assert(await begin.isDisabled(), "Begin should need consent");
    await page.getByLabel(/I have read this and agree/).check();
    await begin.click();
    await page.getByText(/a fictional client/).waitFor();
    const body = await page.locator("main").innerText();
    assert(!/Tastespec|Literal|Qloo mapping|B0|B3/.test(body.replace(/Study|Independent evaluation/g, "")), "system identity leaked to the participant");
    const submit = page.getByRole("button", { name: /Submit/ });
    assert(await submit.isDisabled(), "Submit should need every answer");
    for (const q of ["reflects", "designer", "clarity", "constraints"]) await page.locator(`input[name="${q}"][value="A"]`).check();
    await page.locator('input[name="confidence"][value="4"]').check();
    await submit.click();
    // Walk the remaining cases quickly, answering "Equal".
    for (let i = 0; i < 20; i++) {
      if (await page.getByText("Thank you").isVisible().catch(() => false)) break;
      const next = page.getByRole("button", { name: /Submit/ });
      await next.waitFor({ timeout: 10_000 }).catch(() => {});
      if (!(await next.isVisible().catch(() => false))) continue;
      for (const q of ["reflects", "designer", "clarity", "constraints"]) await page.locator(`input[name="${q}"][value="equal"]`).check();
      await page.locator('input[name="confidence"][value="3"]').check();
      await next.click();
      await page.waitForTimeout(150);
    }
    await page.getByText("Thank you").waitFor({ timeout: 15_000 });
    await page.getByText(/Your withdraw code is/).waitFor();
    await page.goto(`${BASE}/study/results`);
    await page.getByText(/too few to read as a preference/).waitFor();
    await page.goto(`${BASE}/study`);
    await page.getByLabel(/I have read this and agree/).check();
    await page.getByRole("button", { name: "Begin" }).click();
    await page.getByText("Thank you").waitFor({ timeout: 15_000 });
    await page.getByText(/already answered/).waitFor();
    // Fetch from inside the page: the study cookie is httpOnly and Secure, which the page sends but the raw request client does not.
    await page.getByRole("button", { name: "Delete my responses now" }).click();
    await page.getByText(/\d+ response\(s\) deleted/).waitFor();
    const del = { json: async () => ({ note: "deleted through the page button" }) };
    await page.goto(`${BASE}/study/results`);
    await page.getByText("NO HUMAN DATA COLLECTED").waitFor({ timeout: 8000 }).catch(async () => {
      throw new Error(`results not empty after withdrawal (deleted=${JSON.stringify(await del.json())}): ${(await page.locator("main").innerText()).slice(0, 200)}`);
    });
    const exp = await page.request.get(`${BASE}/api/study/export`);
    assert(exp.status() === 404, `export must be off without STUDY_ADMIN_TOKEN, got ${exp.status()}`);
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
  for (const route of ["/", "/app", "/lab", "/compare", "/projects", "/verify", "/method", "/study", "/study/results"]) {
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
