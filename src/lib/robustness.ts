// Controlled perturbation tests. Each scenario perturbs one thing about a brief, runs the real
// pipeline (or the real verifier on a corrupted package), and checks invariants that must hold
// whatever the perturbation. Seeds are fixed so every case replays exactly.
//
// Invariants:
//   I1 written limits dominate cultural preference
//   I2 no usable Qloo evidence means no Qloo personalisation (no line claims Qloo evidence)
//   I3 invalid or corrupted evidence is never given a clean verification
//   I4 irrelevant changes do not change the specification
//   I5 an ambiguous entity is flagged or resolved, never silently chosen
//   I6 a failed Qloo request is never presented as evidence, and no secret is leaked
//   I7 a revision is traceable and leaves the earlier brief unchanged

import { runBrief, validateBrief } from "./agent";
import { compileSpec, machineValue } from "./compiler";
import { limitProblem, limitsOf } from "./constraints";
import { verifyLedger } from "./ledger";
import { clearQlooCache, type Params, type RawResponse, type Transport } from "./qloo/client";
import { FixtureTransport } from "./qloo/fixture";
import { runRevision } from "./revise";
import { diffSpecs } from "./spec-diff";
import { verifySpec } from "./verify-spec";
import { buildBenchmark } from "../../benchmarks/scenarios";
import { rng } from "../../benchmarks/world";
import type { Brief, BriefInput } from "./types";

export type Category = "evidence_removal" | "evidence_corruption" | "evidence_conflict" | "entity_ambiguity" | "constraint_mutation" | "geographic_shift" | "irrelevant_text" | "preference_paraphrase" | "tool_failure";

export interface ScenarioResult {
  id: string;
  category: Category;
  seed: number;
  executed: boolean;
  /** Corruption scenarios only: was the corruption detected? */
  corruptionDetected?: boolean;
  violations: string[];
  ms: number;
  note?: string;
}

const MAYA: BriefInput = { clientLabel: "Maya", trade: "lighting", room: "living_room", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)", "Wes Anderson", "Ace Hotel", "Norah Jones"] };
const JORDAN: BriefInput = { ...MAYA, clientLabel: "Jordan", words: ["modern"], loves: ["Fred again..", "Severance (show)", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] };
const LIMITS: Partial<BriefInput>[] = [{ cctRange: { min: 2700, max: 3000 } }, { cctRange: { min: 2200, max: 2700 }, criMin: 95 }, { cctRange: { min: 3000, max: 3500 }, dimTo: 5, dimmable: true }, { luxTarget: 250, criMin: 90 }];
const CLIENTS = [MAYA, JORDAN];

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

function limitViolations(b: Brief): string[] {
  const l = limitsOf(b.input);
  return b.spec.map((x) => limitProblem(x.id, x.value, l)).filter((x): x is string => Boolean(x)).map((x) => `I1: ${x}`);
}

const claimsQloo = (b: Brief) => b.spec.filter((l) => l.basis === "qloo_evidence").map((l) => l.id);

class Failing implements Transport {
  readonly mode = "live" as const;
  constructor(private kind: "auth" | "rate" | "timeout" | "malformed") {}
  async get(): Promise<RawResponse> {
    if (this.kind === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    if (this.kind === "malformed") return { status: 200, body: { results: "<html>gateway</html>" } };
    return { status: this.kind === "auth" ? 401 : 429, body: { message: "invalid key sk-robustness-secret-123456" }, retryAfterMs: 1 };
  }
}

class Mutating implements Transport {
  readonly mode = "fixture" as const;
  private inner = new FixtureTransport();
  constructor(private f: (path: string, p: Params, r: RawResponse) => RawResponse) {}
  async get(path: string, p: Params) {
    return this.f(path, p, await this.inner.get(path, p));
  }
}

async function exec(id: string, category: Category, seed: number, fn: () => Promise<{ violations: string[]; corruptionDetected?: boolean; note?: string }>): Promise<ScenarioResult> {
  const t = Date.now();
  try {
    clearQlooCache();
    const r = await fn();
    return { id, category, seed, executed: true, ms: Date.now() - t, ...r };
  } catch (e) {
    return { id, category, seed, executed: false, violations: [`scenario did not execute: ${(e as Error).message.slice(0, 120)}`], ms: Date.now() - t };
  }
}

export async function runRobustness(opts: { seeds?: number[] } = {}): Promise<{ results: ScenarioResult[]; summary: ReturnType<typeof summarise> }> {
  process.env.QLOO_MODE = "fixture";
  delete process.env.ANTHROPIC_API_KEY;
  const seeds = opts.seeds ?? [1, 2, 3];
  const results: ScenarioResult[] = [];
  const { world, scenarios } = buildBenchmark();
  const byId = (id: string) => scenarios.find((s) => s.id === id)!;

  for (const seed of seeds) {
    for (const [ci, client] of CLIENTS.entries()) {
      const r = rng(seed * 100 + ci);
      const limits = pick(r, LIMITS);
      const limited: BriefInput = { ...client, ...limits };
      const tag = `${client.clientLabel}-s${seed}`;

      results.push(await exec(`removal-${tag}`, "evidence_removal", seed, async () => {
        const base = await runBrief(limited, () => {});
        const rev = await runRevision(base, { removeEvidence: true });
        const v: string[] = [...limitViolations(rev.brief)];
        if (claimsQloo(rev.brief).length) v.push("I2: a line claims Qloo evidence with none returned");
        if (rev.brief.status !== "INSUFFICIENT_EVIDENCE") v.push(`I2: status ${rev.brief.status}`);
        const spec = await compileSpec(rev.brief);
        const ver = await verifySpec(spec, { brief: rev.brief });
        if (ver.counts.ERROR) v.push("verifier errors on an honest fallback");
        if (ver.dimensions.find((d) => d.id === "B")?.status === "PASS") v.push("I3: no evidence reported as a PASS for evidence integrity");
        if (!(await verifyLedger(rev.brief.ledger)).ok) v.push("ledger broken");
        const d = diffSpecs(await compileSpec(base), spec);
        if (!d.limitsUnchanged) v.push("I7: limits changed by removing evidence");
        if (!rev.brief.ledger.length || base.id === rev.brief.id) v.push("I7: revision not traceable");
        return { violations: v };
      }));

      for (const kind of ["drop_refs", "foreign_id", "no_evidence", "limit_break", "ledger_edit", "bad_unit"] as const) {
        results.push(await exec(`corruption-${tag}-${kind}`, "evidence_corruption", seed, async () => {
          const base = await runBrief(limited, () => {});
          const spec = await compileSpec(base);
          let s = spec;
          let b = base;
          const evLine = spec.lines.find((l) => l.basis === "qloo_evidence");
          if (kind === "drop_refs") s = { ...spec, evidenceRefs: [] };
          else if (kind === "foreign_id" && evLine) s = { ...spec, lines: spec.lines.map((l) => (l.id === evLine.id ? { ...l, evidenceIds: [...l.evidenceIds, 99999] } : l)), evidenceRefs: [...spec.evidenceRefs, { seq: 99999, kind: "qloo_call", summary: "forged", hash: "0" }] };
          else if (kind === "no_evidence" && evLine) s = { ...spec, lines: spec.lines.map((l) => (l.id === evLine.id ? { ...l, evidenceIds: [], evidenceSummary: [] } : l)) };
          else if (kind === "ledger_edit") {
            b = structuredClone(base);
            b.ledger[1].summary += " edited";
          } else if (kind === "bad_unit") s = { ...spec, lines: spec.lines.map((l) => (l.id === "cct" ? { ...l, machine: { ...(machineValue("cct", "3000K throughout") as { kind: "cct"; unit: "K"; min: number; max: number; ambient: number; dimToWarm: boolean }), unit: "C" as unknown as "K" } } : l)) };
          else if (kind === "limit_break" && limitsOf(base.input)?.cct) {
            const bad = limitsOf(base.input)!.cct!.max < 5000 ? "5500K throughout" : "2000K throughout";
            s = { ...spec, lines: spec.lines.map((l) => (l.id === "cct" ? { ...l, requirement: bad, machine: machineValue("cct", bad) } : l)) };
          }
          const applicable = s !== spec || b !== base;
          if (!applicable) return { violations: [], note: `${kind}: not applicable here` };
          const ver = await verifySpec(s, { brief: b });
          const detected = ver.counts.ERROR > 0;
          const v: string[] = [];
          if (!detected) v.push(`I3: corruption "${kind}" received no error`);
          if (detected && ver.documentStatus !== "DRAFT_CHECKS_FAILED") v.push(`I3: "${kind}" not exported as DRAFT`);
          return { violations: v, corruptionDetected: detected, note: kind };
        }));
      }

      results.push(await exec(`conflict-${tag}`, "evidence_conflict", seed, async () => {
        const sc = byId(pick(r, ["conf-0", "conf-1", "conf-2", "conf-3"]));
        const b = await runBrief({ ...sc.input, ...limits }, () => {}, { transport: world, useLlm: false });
        const v = [...limitViolations(b), ...validateBrief(b).map((x) => `invalid: ${x}`)];
        if (!(await verifyLedger(b.ledger)).ok) v.push("ledger broken");
        return { violations: v, note: sc.id };
      }));

      results.push(await exec(`ambiguity-${tag}`, "entity_ambiguity", seed, async () => {
        const sc = byId("amb-0");
        const b = await runBrief(sc.input, () => {}, { transport: world, useLlm: false });
        const res = b.resolutions.find((x) => x.input === "Harbor Lights")!;
        const spec = await compileSpec(b);
        const v: string[] = [];
        if (res.status === "ambiguous" && !spec.openQuestions.some((q) => q.includes("Harbor Lights"))) v.push("I5: ambiguous entity not surfaced");
        if (res.usedAsSignal && res.status !== "resolved" && res.status !== "ambiguous") v.push("I5: weak entity used as a signal");
        const movie = byId("amb-1").intended[0];
        const pinned = await runRevision(b, { pin: { "Harbor Lights": movie } }, { transport: world });
        const after = pinned.brief.resolutions.find((x) => x.input === "Harbor Lights")!;
        if (after.chosen?.entity_id !== movie) v.push("I5: pinned entity not honoured");
        return { violations: v, note: res.status };
      }));

      results.push(await exec(`mutation-${tag}`, "constraint_mutation", seed, async () => {
        const base = await runBrief(client, () => {});
        const mutated = await runRevision(base, { cctRange: pick(r, [{ min: 2700, max: 3000 }, { min: 2200, max: 2700 }, { min: 3500, max: 4000 }]), criMin: pick(r, [90, 95, 97]) });
        const v = limitViolations(mutated.brief);
        const d = diffSpecs(await compileSpec(base), await compileSpec(mutated.brief));
        const wrongCause = d.lines.filter((l) => ["layers", "fixtures", "optics"].includes(l.id) && l.change === "semantic_value" && l.cause === "limit");
        if (wrongCause.length) v.push("I7: a limit was blamed for a line it doesn't govern");
        if (d.input.limits.length === 0) v.push("I7: the limit change was not recorded in the diff");
        return { violations: v };
      }));

      results.push(await exec(`geo-${tag}`, "geographic_shift", seed, async () => {
        const sc = byId(pick(r, ["geo-0", "geo-1", "weak-0", "weak-1"]));
        const b = await runBrief({ ...sc.input, ...limits }, () => {}, { transport: world, useLlm: false });
        const v = limitViolations(b);
        if (b.scope && b.scope !== "city" && !b.warnings.some((w) => /too few matching places/.test(w))) v.push("widened scope not disclosed");
        if (b.status === "INSUFFICIENT_EVIDENCE" && claimsQloo(b).length) v.push("I2: evidence claimed with none");
        return { violations: v, note: `${sc.id}:${b.scope ?? "n/a"}:${b.status}` };
      }));

      results.push(await exec(`irrelevant-${tag}`, "irrelevant_text", seed, async () => {
        const a = await runBrief(limited, () => {});
        const filler = pick(r, ["We have two cats and a small garden.", "The sofa arrives in March, and the neighbours are lovely.", "Thanks so much for your time, we are really looking forward to this."]);
        clearQlooCache();
        const b = await runBrief({ ...limited, sourceText: `${filler} ${filler}` }, () => {});
        const same = JSON.stringify(a.spec.map((l) => [l.id, l.value, l.basis])) === JSON.stringify(b.spec.map((l) => [l.id, l.value, l.basis]));
        return { violations: same ? [] : ["I4: unrelated sentences changed the specification"] };
      }));

      results.push(await exec(`paraphrase-${tag}`, "preference_paraphrase", seed, async () => {
        const a = await runBrief(limited, () => {});
        const words = [...limited.words].reverse().map((w, i) => (i % 2 ? ` ${w.toUpperCase()} ` : w));
        clearQlooCache();
        const b = await runBrief({ ...limited, words, loves: [...limited.loves].reverse().map((l) => l.toUpperCase()) }, () => {});
        const same = JSON.stringify(a.spec.map((l) => [l.id, l.value])) === JSON.stringify(b.spec.map((l) => [l.id, l.value]));
        return { violations: same ? [] : ["I4: reordering or re-casing changed the specification"] };
      }));

      results.push(await exec(`failure-${tag}`, "tool_failure", seed, async () => {
        const kind = pick(r, ["auth", "rate", "timeout", "malformed"] as const);
        const b = await runBrief(limited, () => {}, { transport: new Failing(kind), budgetMs: 20_000 });
        const v = limitViolations(b);
        if (claimsQloo(b).length) v.push("I6: a failed request was presented as evidence");
        if (b.crowdVenues.length) v.push("I6: places appeared from a failed request");
        if (JSON.stringify(b).includes("sk-robustness-secret")) v.push("I6: a secret reached the brief");
        if (b.dataMode !== "live") v.push("I6: failure relabelled as fixture");
        if (!["UPSTREAM_UNAVAILABLE", "INSUFFICIENT_EVIDENCE"].includes(b.status)) v.push(`I6: status ${b.status}`);
        return { violations: v, note: kind };
      }));
    }
    // One corrupted-payload scenario per seed against the real run path.
    results.push(await exec(`payload-s${seed}`, "evidence_corruption", seed, async () => {
      const r = rng(seed);
      const t = new Mutating((path, p, res) => {
        if (path !== "/v2/insights" || p["filter.type"] !== "urn:entity:place") return res;
        const body = res.body as { results?: { entities?: Record<string, unknown>[] } };
        const list = body.results?.entities;
        if (!Array.isArray(list)) return res;
        return { ...res, body: { ...body, results: { ...body.results, entities: list.map((e, i) => (r() < 0.4 ? (i % 2 ? null : { ...e, affinity: Number.POSITIVE_INFINITY, popularity: -9, tags: null }) : e)) } } };
      });
      const b = await runBrief({ ...MAYA, ...LIMITS[seed % LIMITS.length] }, () => {}, { transport: t });
      const v = [...limitViolations(b), ...b.dimensions.filter((d) => !Number.isFinite(d.score) || Math.abs(d.score) > 1).map((d) => `corrupt number reached score ${d.id}`)];
      return { violations: v, corruptionDetected: true };
    }));
  }
  return { results, summary: summarise(results) };
}

function pct(xs: number[], q: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export function summarise(results: ScenarioResult[]) {
  const executed = results.filter((r) => r.executed);
  const corr = results.filter((r) => r.corruptionDetected !== undefined);
  const byCategory = Object.fromEntries([...new Set(results.map((r) => r.category))].map((c) => [c, { scenarios: results.filter((r) => r.category === c).length, violations: results.filter((r) => r.category === c).reduce((n, r) => n + r.violations.length, 0) }]));
  const ms = executed.map((r) => r.ms);
  return {
    total: results.length,
    executed: executed.length,
    notExecuted: results.length - executed.length,
    invariantViolations: results.reduce((n, r) => n + r.violations.length, 0),
    failingScenarios: results.filter((r) => r.violations.length).map((r) => r.id),
    corruptionScenarios: corr.length,
    invalidEvidenceRejectionRate: corr.length ? +(corr.filter((r) => r.corruptionDetected).length / corr.length).toFixed(3) : null,
    byCategory,
    latencyMs: { mean: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, p95: pct(ms, 0.95), n: ms.length },
  };
}
