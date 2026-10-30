// Release auditor: one command, one structured report.
//
//   npm run release:check                 everything (about 2-4 minutes)
//   npm run release:check -- --skip-e2e   skip the browser suite
//   npm run release:check -- --strict     BLOCKED and NOT RUN also fail the command
//
// Each check is PASS, FAIL, BLOCKED (cannot run here: missing credential or network) or NOT RUN
// (switched off or not configured). A missing live credential is BLOCKED, never PASS. The exit
// code is 1 only for FAIL (or, with --strict, anything but PASS). Requests go only to a local
// server this script starts, and to TASTESPEC_PUBLIC_URL if you set it.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const skipE2e = args.has("--skip-e2e");
const results = [];
const add = (name, status, detail = "") => {
  results.push({ name, status, detail });
  console.log(`${status.padEnd(8)} ${name}${detail ? `\n         ${String(detail).split("\n").slice(0, 3).join("\n         ")}` : ""}`);
};

const run = (name, cmd, cmdArgs, timeoutMs) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", timeout: timeoutMs, env: { ...process.env, CI: "1" } });
  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-4).join("\n");
  if (r.error?.code === "ETIMEDOUT") return add(name, "FAIL", `timed out after ${timeoutMs / 1000}s`);
  add(name, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? tail.split("\n").slice(-1)[0] : tail);
  return r.status === 0;
};

// 1. Build quality
run("typecheck", "npm", ["run", "typecheck"], 180_000);
run("lint", "npm", ["run", "lint"], 180_000);
run("unit tests", "npm", ["test"], 300_000);
const built = run("production build", "npm", ["run", "build"], 600_000);

// 2. Files
add("license file present", existsSync("LICENSE") && /permission is hereby granted|MIT|Apache/i.test(readFileSync("LICENSE", "utf8")) ? "PASS" : "FAIL", "LICENSE");
const need = ["README.md", "docs/DEPLOYMENT.md", "docs/JUDGE_QUICKSTART.md", "docs/HUMAN_EVALUATION.md", "docs/QLOO_LIVE_VERIFICATION.md", "docs/SUBMISSION.md", "docs/RELEASE_CHECKLIST.md", "docs/AUTONOMOUS_SESSION.md"];
const missing = need.filter((f) => !existsSync(f));
add("submission documents present", missing.length ? "FAIL" : "PASS", missing.length ? `missing: ${missing.join(", ")}` : `${need.length} files`);
const deploy = ["Dockerfile", "docker-compose.yml", "vercel.json", ".github/workflows/ci.yml"].filter((f) => !existsSync(f));
add("deployment configuration present", deploy.length ? "FAIL" : "PASS", deploy.length ? `missing: ${deploy.join(", ")}` : "Dockerfile, compose, vercel.json, CI workflow");

// 3. No secrets in tracked files
{
  const files = spawnSync("git", ["ls-files"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  const bad = [];
  const patterns = [/sk-ant-[A-Za-z0-9_-]{20,}/, /\bsk-[A-Za-z0-9]{32,}\b/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /^[ \t]*QLOO_API_KEY[ \t]*=[ \t]*[^\s#…]{8,}/m, /^[ \t]*DATABASE_AUTH_TOKEN[ \t]*=[ \t]*[^\s#…]{8,}/m, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/];
  for (const f of files) {
    if (/(^|\/)\.env(\.local)?$/.test(f)) bad.push(`${f} is tracked`);
    if (!/\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|env|example|css|txt|sh)$/.test(f) || /package-lock\.json$/.test(f)) continue;
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const p of patterns) if (p.test(text)) bad.push(`${f} matches ${p.source.slice(0, 30)}…`);
  }
  add("no secrets in tracked files", bad.length ? "FAIL" : "PASS", bad.length ? bad.slice(0, 5).join("\n") : `${files.length} tracked files scanned`);
}

// 4. Benchmark artifacts agree with each other and the docs
{
  const names = ["", "-seed-11", "-seed-12", "-seed-13"];
  try {
    const js = names.map((n) => JSON.parse(readFileSync(`reports/benchmark-results${n}.json`, "utf8")));
    const counts = new Set(js.map((j) => j.environment.scenarios));
    const md = readFileSync("reports/benchmark-summary.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const n = [...counts][0];
    const problems = [];
    if (counts.size !== 1) problems.push(`scenario counts differ across seeds: ${[...counts].join(", ")}`);
    if (!md.includes(`${n} scenarios`)) problems.push(`summary does not say ${n} scenarios`);
    if (!readme.includes(`${n} scenarios`)) problems.push(`README does not say ${n} scenarios`);
    if (!js.every((j) => /SYNTHETIC/.test(j.kind))) problems.push("a result file is not labelled SYNTHETIC");
    if (!js.every((j) => j.notMeasured?.preferenceAlignmentWithHumans)) problems.push("a result file lacks the not-measured disclosure");
    add("benchmark artifacts consistent", problems.length ? "FAIL" : "PASS", problems.join("\n") || `${n} scenarios, 4 seeds, labelled synthetic`);
  } catch (e) {
    add("benchmark artifacts consistent", "FAIL", e.message);
  }
}

// 5. Local server: smoke, disclosure and judge navigation
async function smoke() {
  if (!built) return add("server smoke tests", "NOT RUN", "build failed");
  const port = 3470 + Math.floor(Math.random() * 100);
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], { env: { ...process.env, QLOO_MODE: "fixture", TASTESPEC_DB_PATH: `${process.env.TMPDIR ?? "/tmp"}/release-check-${port}.db`, ANTHROPIC_API_KEY: "" }, stdio: "ignore" });
  try {
    let health;
    for (let i = 0; i < 60 && !health; i++) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) health = await r.json();
      } catch {}
      if (!health) await new Promise((r) => setTimeout(r, 500));
    }
    if (!health) return add("server smoke tests", "FAIL", "server did not start in 30s");
    add("health endpoint", health.ok && health.qloo === "fixture" && !JSON.stringify(health).match(/sk-|api[_-]?key=/i) ? "PASS" : "FAIL", `qloo=${health.qloo} db=${health.db?.kind} durable=${health.db?.durable}`);
    const pages = ["/", "/app", "/lab", "/compare", "/projects", "/method", "/verify", "/study", "/study/results"];
    const bad = [];
    let home = "";
    for (const p of pages) {
      const r = await fetch(base + p);
      const t = await r.text();
      if (p === "/") home = t;
      if (!r.ok) bad.push(`${p} → ${r.status}`);
      if (/Application error|Internal Server Error/.test(t)) bad.push(`${p} shows an error page`);
    }
    add("pages render without server errors", bad.length ? "FAIL" : "PASS", bad.join("\n") || `${pages.length} pages`);
    add("demo mode disclosed on the page", /Demo mode/.test(home) && /synthetic/i.test(home) ? "PASS" : "FAIL", "banner text in the served HTML");
    const links = [...new Set([...home.matchAll(/href="(\/[a-z][^"#?]*)"/g)].map((m) => m[1]))].filter((l) => !l.startsWith("/_next") && !l.startsWith("/api") && !l.startsWith("/c/"));
    const dead = [];
    for (const l of links) if (!(await fetch(base + l)).ok) dead.push(l);
    add("judge navigation: no broken internal links on the home page", dead.length ? "FAIL" : "PASS", dead.join(", ") || `${links.length} links checked`);
    const lit = await fetch(`${base}/api/literal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientLabel: "A", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm"], loves: ["x", "y"], cctRange: { min: 2700, max: 3000 } }) });
    const lj = await lit.json();
    add("no-Qloo baseline computes (0 Qloo calls)", lit.ok && lj.qlooCalls === 0 && Array.isArray(lj.lines) ? "PASS" : "FAIL", `status ${lit.status}`);
    const runRes = await fetch(`${base}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientLabel: "Maya", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] }) });
    const body = await runRes.text();
    const last = body.trim().split("\n").map((l) => JSON.parse(l)).at(-1);
    const brief = last?.brief;
    add("agent run completes and is labelled fixture", runRes.ok && brief && ["COMPLETE", "NEEDS_CLARIFICATION"].includes(brief.status) && brief.dataMode === "fixture" ? "PASS" : "FAIL", brief ? `${brief.status}, ${brief.dataMode}, ${brief.spec.length} lines, ledger ${brief.ledger.length}` : body.slice(0, 120));
    if (brief) {
      let prev = "0".repeat(64);
      let intact = true;
      for (const e of brief.ledger) {
        if (e.prevHash !== prev) intact = false;
        prev = e.hash;
      }
      add("evidence ledger entries link in order", intact ? "PASS" : "FAIL", `${brief.ledger.length} entries (full hash verification runs in the unit and e2e suites)`);
    }
    const exp = await fetch(`${base}/api/study/export`);
    add("study export closed without a token", exp.status === 404 ? "PASS" : "FAIL", `status ${exp.status}`);
  } catch (e) {
    add("server smoke tests", "FAIL", e.message);
  } finally {
    server.kill("SIGTERM");
  }
}
await smoke();

// 6. Browser suite
if (skipE2e) add("end-to-end browser tests", "NOT RUN", "--skip-e2e");
else if (!built) add("end-to-end browser tests", "NOT RUN", "build failed");
else run("end-to-end browser tests", "npm", ["run", "test:e2e"], 900_000);

// 7. Qloo, live
if (!process.env.QLOO_API_KEY) add("Qloo live verification", "BLOCKED", "QLOO_API_KEY is not set. Not run, and not counted as passed. Run `npm run verify:qloo-live` with a key.");
else {
  const r = spawnSync("npm", ["run", "verify:qloo-live"], { encoding: "utf8", timeout: 400_000 });
  add("Qloo live verification", r.status === 0 ? "PASS" : r.status === 2 ? "BLOCKED" : "FAIL", (r.stdout + r.stderr).trim().split("\n").slice(-3).join("\n"));
}

// 8. Public URL
const url = (process.env.TASTESPEC_PUBLIC_URL ?? "").replace(/\/+$/, "");
if (!url) add("public URL reachable", "NOT RUN", "TASTESPEC_PUBLIC_URL is not set; no deployment is claimed.");
else {
  try {
    const h = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(15_000) });
    const j = await h.json();
    const page = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await page.text();
    const fixture = j.qloo === "fixture";
    const leaks = /sk-ant-|QLOO_API_KEY\s*=/.test(text + JSON.stringify(j));
    add("public URL reachable", h.ok && page.ok && !leaks ? "PASS" : "FAIL", `health ${h.status}, home ${page.status}, qloo=${j.qloo}, db durable=${j.db?.durable}`);
    add("public deployment discloses its data mode", fixture ? (/Demo mode/.test(text) ? "PASS" : "FAIL") : /Demo mode/.test(text) ? "FAIL" : "PASS", fixture ? "fixture banner expected and found" : "live: no demo banner expected");
  } catch (e) {
    add("public URL reachable", "BLOCKED", `${e.name}: could not fetch ${new URL(url).host}`);
  }
}

// 9. Human study status (informational: zero responses is stated, not hidden)
add("human study summary states its sample", existsSync("reports/human-evaluation-summary.md") && /NO HUMAN DATA COLLECTED|anonymous response/.test(readFileSync("reports/human-evaluation-summary.md", "utf8")) ? "PASS" : "FAIL", "reports/human-evaluation-summary.md");

// Report
const counts = Object.fromEntries(["PASS", "FAIL", "BLOCKED", "NOT RUN"].map((s) => [s, results.filter((r) => r.status === s).length]));
mkdirSync("reports", { recursive: true });
writeFileSync("reports/release-check.json", JSON.stringify({ generatedAt: new Date().toISOString(), counts, results }, null, 2));
console.log(`\n${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
const failed = counts.FAIL > 0 || (strict && (counts.BLOCKED > 0 || counts["NOT RUN"] > 0));
console.log(failed ? "RELEASE CHECK: NOT READY" : counts.BLOCKED || counts["NOT RUN"] ? "RELEASE CHECK: no failures; some checks could not run (see BLOCKED / NOT RUN above)" : "RELEASE CHECK: READY");
process.exit(failed ? 1 : 0);
