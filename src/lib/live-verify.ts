// End-to-end verification of the Qloo integration, as a library so the harness
// itself can be tested. The result carries exactly one honest status:
//
//   LIVE VERIFIED    every check passed against the real Qloo hackathon host
//   CONTRACT TESTED  every check passed, but not against real Qloo (fixture or another host)
//   FAILED           a check failed
//
// (BLOCKED, no credential or no network, is decided by the caller before any request is made.)
// Nothing here is written down as a pass unless the check actually ran and passed.

import { runBrief, validateBrief } from "./agent";
import { limitsOf } from "./constraints";
import { HACKATHON_BASE_URL } from "./env";
import { Ledger, verifyLedger } from "./ledger";
import { QlooClient, type Transport } from "./qloo/client";
import { replayBrief } from "./replay";
import { resolveLove } from "./resolve";
import type { Brief, BriefInput } from "./types";

export type VerifyStatus = "LIVE VERIFIED" | "CONTRACT TESTED" | "FAILED";

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
  ms?: number;
}

export interface LiveVerification {
  kind: "Qloo integration verification (sanitised)";
  status: VerifyStatus;
  transport: "live" | "fixture";
  baseUrl: string;
  againstRealQloo: boolean;
  generatedAt: string;
  checks: VerifyCheck[];
  summary: { briefs: number; qlooRequests: number; qlooMs: number; differingLines?: number; totalLines?: number };
}

const MAYA: BriefInput = {
  clientLabel: "Maya",
  trade: "lighting",
  room: "living_room",
  city: "Chicago",
  words: ["warm", "modern"],
  loves: ["Khruangbin", "The Bear (show)", "Wes Anderson (director)", "Ace Hotel (hotel)", "Norah Jones"],
};
const JORDAN: BriefInput = { ...MAYA, clientLabel: "Jordan", loves: ["Fred again..", "Severance (show)", "MUJI (brand)", "Blue Bottle Coffee (brand)", "Kendrick Lamar"] };

export interface VerifyOptions {
  transport: Transport;
  baseUrl?: string;
  /** Hard stop for the whole verification, in ms. */
  budgetMs?: number;
}

export async function verifyQloo(opts: VerifyOptions): Promise<LiveVerification> {
  const baseUrl = opts.baseUrl ?? HACKATHON_BASE_URL;
  const checks: VerifyCheck[] = [];
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  let requests = 0;
  let qlooMs = 0;
  const step = async (name: string, fn: () => Promise<string>) => {
    const t = Date.now();
    try {
      const detail = await fn();
      checks.push({ name, ok: true, detail, ms: Date.now() - t });
      return true;
    } catch (e) {
      checks.push({ name, ok: false, detail: (e as Error).message.slice(0, 240), ms: Date.now() - t });
      return false;
    }
  };
  const need = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  // 1. One minimal real request: the search endpoint, auth header and response shape.
  const ledger = new Ledger();
  const qloo = new QlooClient(opts.transport, ledger, { deadline, maxCalls: 30 });
  await step("search: auth accepted, response parses to entities", async () => {
    const r = await qloo.search("Khruangbin", { take: 5 });
    need(r.value.length > 0, "search returned no parseable entities");
    need(r.value.every((e) => e.entity_id && e.name), "an entity is missing id or name");
    const e = ledger.entries.find((x) => x.kind === "qloo_call");
    need(e && Number(e.detail.status) === 200, `search status ${String(e?.detail.status)}`);
    return `${r.value.length} entities, first "${r.value[0].name}" (${r.value[0].type ?? "type n/a"})`;
  });
  requests += qloo.stats.requests;
  qlooMs += qloo.stats.ms;

  // 2. Both clients' references resolve to usable signals.
  for (const p of [MAYA, JORDAN]) {
    await step(`resolve: ${p.clientLabel}'s references`, async () => {
      const res = await Promise.all(p.loves.map((l) => resolveLove(qloo, l)));
      const used = res.filter((r) => r.usedAsSignal).length;
      need(used >= 3, `only ${used} of ${p.loves.length} references resolved confidently`);
      return `${used} of ${p.loves.length} used as signals; ${res.filter((r) => r.status === "ambiguous").length} ambiguous`;
    });
  }
  requests += qloo.stats.requests - requests;
  qlooMs = qloo.stats.ms;

  // 3. Full workflow for two clients with identical words and different loves.
  const briefs: Record<string, Brief | undefined> = {};
  for (const p of [MAYA, JORDAN]) {
    await step(`workflow: ${p.clientLabel} end to end`, async () => {
      need(Date.now() < deadline, "verification budget exhausted before this step");
      const b = await runBrief(p, () => {}, { transport: opts.transport, useLlm: false, budgetMs: 70_000 });
      briefs[p.clientLabel] = b;
      need(b.status === "COMPLETE" || b.status === "NEEDS_CLARIFICATION", `brief ended ${b.status}${b.warnings.length ? `: ${b.warnings[0]}` : ""}`);
      need(b.dataMode === opts.transport.mode, `brief says ${b.dataMode} but the transport is ${opts.transport.mode}`);
      const problems = validateBrief(b);
      need(!problems.length, `spec validation: ${problems.join("; ")}`);
      const chain = await verifyLedger(b.ledger);
      need(chain.ok, `ledger: ${chain.reason}`);
      const seqs = new Set(b.ledger.filter((e) => e.kind === "qloo_call").map((e) => e.seq));
      const bad = b.spec.filter((l) => l.basis === "qloo_evidence" && (!l.evidenceLedger.length || l.evidenceLedger.some((s) => !seqs.has(s))));
      need(!bad.length, `evidence provenance: ${bad.map((l) => l.id).join(", ")} cite missing Qloo requests`);
      const rep = await replayBrief(b);
      need(rep.checks.every((c) => c.ok), `replay: ${rep.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`);
      requests += b.stats.qlooRequests;
      qlooMs += b.stats.qlooMs;
      return `${b.status}, ${b.stats.qlooRequests} Qloo requests in ${b.stats.qlooMs} ms, ${b.spec.filter((l) => l.basis === "qloo_evidence").length} evidence-based lines, ledger ${b.ledger.length} entries intact, replay ok`;
    });
  }

  // 4. Same words, different loves: do the specs differ, and does evidence stand behind the differences?
  let differing: number | undefined;
  let total: number | undefined;
  const a = briefs.Maya;
  const b = briefs.Jordan;
  if (a && b) {
    await step("same words, different loves: differences are evidence-backed", async () => {
      const ids = a.spec.map((l) => l.id);
      const diff = ids.filter((id) => a.spec.find((l) => l.id === id)!.value !== b.spec.find((l) => l.id === id)!.value);
      differing = diff.length;
      total = ids.length;
      need(diff.length > 0, "both clients got identical specifications");
      const unbacked = diff.filter((id) => {
        const la = a.spec.find((l) => l.id === id)!;
        const lb = b.spec.find((l) => l.id === id)!;
        return !(la.basis === "qloo_evidence" || lb.basis === "qloo_evidence" || la.basis === "constraint" || lb.basis === "constraint");
      });
      need(!unbacked.length, `lines differ without evidence behind either side: ${unbacked.join(", ")}`);
      return `${diff.length} of ${ids.length} lines differ, each backed by evidence or a stated constraint`;
    });
  } else checks.push({ name: "same words, different loves: differences are evidence-backed", ok: false, detail: "not run: a workflow step failed" });

  // 5. Explicit written limits survive real evidence.
  await step("constraints: written limits hold against real evidence", async () => {
    need(Date.now() < deadline, "verification budget exhausted before this step");
    const input: BriefInput = { ...JORDAN, words: ["modern"], cctRange: { min: 2700, max: 3000 }, criMin: 95, dimTo: 5, dimmable: true };
    const c = await runBrief(input, () => {}, { transport: opts.transport, useLlm: false, budgetMs: 70_000 });
    need(c.status === "COMPLETE" || c.status === "NEEDS_CLARIFICATION", `brief ended ${c.status}`);
    const problems = validateBrief(c);
    need(!problems.length, `limits violated: ${problems.join("; ")}`);
    need(limitsOf(c.input)?.criMin === 95, "limits were not stored on the brief");
    requests += c.stats.qlooRequests;
    qlooMs += c.stats.qlooMs;
    return `cct "${c.spec.find((l) => l.id === "cct")?.value}", ${c.spec.find((l) => l.id === "cri")?.value.slice(0, 18)}`;
  });

  // 6. No key in anything we are about to write.
  await step("sanitised: no credential in the diagnostics", async () => {
    const key = process.env.QLOO_API_KEY;
    const text = JSON.stringify({ checks, ledger: ledger.entries });
    need(!key || !text.includes(key), "the API key appears in the diagnostics");
    return "checked";
  });

  const allOk = checks.every((c) => c.ok);
  const real = opts.transport.mode === "live" && baseUrl === HACKATHON_BASE_URL;
  return {
    kind: "Qloo integration verification (sanitised)",
    status: !allOk ? "FAILED" : real ? "LIVE VERIFIED" : "CONTRACT TESTED",
    transport: opts.transport.mode,
    baseUrl,
    againstRealQloo: real,
    generatedAt: new Date().toISOString(),
    checks,
    summary: { briefs: Object.keys(briefs).length + 1, qlooRequests: requests, qlooMs, differingLines: differing, totalLines: total },
  };
}
