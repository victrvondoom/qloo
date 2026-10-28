#!/usr/bin/env node
// Records the landing film as a video, for the README and the submission.
//
//   npm run build && npm run film
//
// Starts the production server on synthetic data, opens /film in Chromium via
// Playwright, records one full loop, and writes:
//   public/media/tastespec-film.webm   (1280×800, ~27 s)
//   public/media/tastespec-poster.jpg  (the "two rooms" frame, 1600×1000)
// Needs Playwright with Chromium. Cross-platform (no shell syntax).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
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

const SECONDS = 27;
const PORT = 3700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(path.join(tmpdir(), "tastespec-film-"));
const out = path.join(process.cwd(), "public", "media");
mkdirSync(out, { recursive: true });
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT), "-H", "127.0.0.1"], {
  env: { ...process.env, QLOO_MODE: "fixture", TASTESPEC_DB_PATH: path.join(tmp, "film.db"), ANTHROPIC_API_KEY: "", DATABASE_URL: "" },
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start (did you run `npm run build`?)");
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const size = { width: 1280, height: 800 };
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size }, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/film`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(SECONDS * 1000 + 600);
  const video = page.video();
  await ctx.close();
  const file = await video.path();
  renameSync(file, path.join(out, "tastespec-film.webm"));

  const still = await browser.newContext({ viewport: size, colorScheme: "dark", deviceScaleFactor: 1.25 });
  const p2 = await still.newPage();
  await p2.goto(`${BASE}/film`, { waitUntil: "networkidle" });
  await p2.evaluate(() => document.fonts.ready);
  await p2.waitForTimeout(21_500);
  await p2.screenshot({ path: path.join(out, "tastespec-poster.jpg"), type: "jpeg", quality: 84 });
  await browser.close();
  const mb = (statSync(path.join(out, "tastespec-film.webm")).size / 1e6).toFixed(1);
  console.log(`Wrote public/media/tastespec-film.webm (${mb} MB) and public/media/tastespec-poster.jpg`);
} finally {
  server.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
