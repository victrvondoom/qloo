// One-command live verification of the Qloo integration.
//
//   QLOO_API_KEY=... npm run verify:qloo-live
//
// Exit codes: 0 LIVE VERIFIED, 1 FAILED, 2 BLOCKED (no credential, or Qloo unreachable).
// BLOCKED and FAILED are different on purpose: a missing key is never reported as a pass,
// and never as a defect in the integration. Writes a sanitised report to
// reports/qloo-live-verification.json only when it actually ran against Qloo.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envReport } from "../src/lib/env";
import { verifyQloo } from "../src/lib/live-verify";
import { HttpTransport } from "../src/lib/qloo/client";

process.env.VITEST = "1"; // quiet adapter logs
const env = envReport();
const key = process.env.QLOO_API_KEY ?? "";

async function main() {
  if (env.qlooMode !== "live") {
    console.error(`BLOCKED: ${env.issues.join(" ") || "QLOO_MODE=fixture."} Nothing was requested and nothing was written.`);
    console.error("Set QLOO_API_KEY (hackathon key), leave QLOO_MODE unset, and run again.");
    process.exit(2);
  }
  const transport = new HttpTransport(key, env.qlooBaseUrl);
  // A single tiny request first, so an unreachable network is reported as BLOCKED rather than as nine failed checks.
  try {
    await fetch(env.qlooBaseUrl, { method: "HEAD", signal: AbortSignal.timeout(8000) });
  } catch (e) {
    console.error(`BLOCKED: cannot reach ${new URL(env.qlooBaseUrl).host} (${(e as Error).name}). Check network access; nothing was written.`);
    process.exit(2);
  }
  const report = await verifyQloo({ transport, baseUrl: env.qlooBaseUrl });
  for (const c of report.checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ms !== undefined ? ` (${c.ms} ms)` : ""}\n      ${c.detail}`);
  const text = JSON.stringify(report, null, 2);
  if (key && text.includes(key)) throw new Error("refusing to write: report would contain the API key");
  const out = path.join(process.cwd(), "reports", "qloo-live-verification.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`\n${report.status}  (${report.summary.qlooRequests} Qloo requests, ${report.summary.qlooMs} ms in Qloo)\nWrote ${out}`);
  process.exit(report.status === "LIVE VERIFIED" ? 0 : 1);
}

main().catch((e) => {
  console.error(`FAILED: ${(e as Error).message}`);
  process.exit(1);
});
