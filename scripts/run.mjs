#!/usr/bin/env node
// Cross-platform launcher: no shell syntax, works the same on Windows, macOS and Linux.
//
//   node scripts/run.mjs demo    build if needed, then serve on synthetic data (no keys needed)
//   node scripts/run.mjs dev     development server (synthetic data unless QLOO_API_KEY is set)
//   node scripts/run.mjs start   production server with whatever .env / environment says
//
// PORT (default 3000) and HOST (default 0.0.0.0) are respected. The database is
// ./.data/tastespec.db unless DATABASE_URL or TASTESPEC_DB_PATH says otherwise.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Tastespec needs Node.js 22.13 or newer (built-in SQLite). You have ${process.versions.node}.`);
  process.exit(1);
}

const mode = process.argv[2] ?? "demo";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error("Dependencies are missing. Run `npm install` first.");
  process.exit(1);
}
const env = { ...process.env };
const port = env.PORT ?? "3000";
const host = env.HOST ?? "0.0.0.0";

if (mode === "demo" || (mode === "dev" && !env.QLOO_API_KEY)) env.QLOO_MODE = "fixture";

function run(args, opts = {}) {
  return spawnSync(process.execPath, [nextBin, ...args], { cwd: root, env, stdio: "inherit", ...opts });
}

if (mode === "demo" && !existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.log("First run: building (about a minute)…");
  const b = run(["build"]);
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const args = mode === "dev" ? ["dev", "-p", port, "-H", host] : ["start", "-p", port, "-H", host];
console.log(`\n  Tastespec ${mode === "demo" ? "(synthetic demo data)" : env.QLOO_MODE === "fixture" ? "(synthetic data)" : ""}\n  → http://localhost:${port}\n`);
const child = spawn(process.execPath, [nextBin, ...args], { cwd: root, env, stdio: "inherit" });
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
