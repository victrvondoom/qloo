// Live probe of the Qloo hackathon API through Tastespec's own adapter.
//
//   QLOO_API_KEY=... npm run probe -- Chicago
//
// It answers the questions Tastespec depends on and writes a SANITISED report
// to reports/qloo-live-probe.json: counts, field names, statuses, latencies,
// vocabulary hit rates and a handful of tag names. No API key, no raw response
// bodies, no personal data. Without a key or network it writes nothing and
// exits non-zero: it never fabricates a result.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HttpTransport, QlooClient, type Params } from "../src/lib/qloo/client";
import { Ledger } from "../src/lib/ledger";
import { envReport } from "../src/lib/env";
import { classifyVenue, computeDimensions, hasText } from "../src/lib/fingerprint";
import { resolveLove } from "../src/lib/resolve";
import type { QlooEntity } from "../src/lib/types";

process.env.VITEST = "1"; // keep adapter logs quiet; we print our own
const city = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? "Chicago";
const env = envReport();
if (env.qlooMode !== "live") {
  console.error(`Not running: ${env.issues.join(" ") || "QLOO_MODE is fixture"}. Nothing written.`);
  process.exit(2);
}

// The same two demo clients the app uses: identical words, different loves.
const PROFILES = {
  maya: ["Khruangbin", "The Bear (show)", "Wes Anderson (director)", "Ace Hotel (hotel)", "Norah Jones"],
  jordan: ["Fred again..", "Severance (show)", "MUJI (brand)", "Blue Bottle Coffee (brand)", "Kendrick Lamar"],
};

const ledger = new Ledger();
const qloo = new QlooClient(new HttpTransport(process.env.QLOO_API_KEY!, env.qlooBaseUrl), ledger, { deadline: Date.now() + 120_000, maxCalls: 80 });
const report: Record<string, unknown> = {
  kind: "LIVE Qloo probe (sanitised)",
  generatedAt: new Date().toISOString(),
  baseUrl: env.qlooBaseUrl,
  city,
  checks: {} as Record<string, unknown>,
};
const checks = report.checks as Record<string, unknown>;

function fieldInventory(es: QlooEntity[]) {
  return {
    n: es.length,
    withTags: es.filter((e) => e.tags.length).length,
    withKeywords: es.filter((e) => e.keywords.length).length,
    withAffinity: es.filter((e) => e.affinity !== undefined).length,
    withPopularity: es.filter((e) => e.popularity !== undefined).length,
    tagTypes: [...new Set(es.flatMap((e) => e.tags.map((t) => t.type ?? t.tag_id.split(":").slice(0, 4).join(":"))))].slice(0, 15),
    sampleTagNames: [...new Set(es.flatMap((e) => e.tags.map((t) => t.name)))].slice(0, 25),
    sampleKeywords: [...new Set(es.flatMap((e) => e.keywords))].slice(0, 25),
  };
}

async function attempt<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const t = Date.now();
  try {
    const v = await fn();
    console.log(`ok    ${name} (${Date.now() - t} ms)`);
    return v;
  } catch (err) {
    checks[name] = { ok: false, error: (err as Error).message.slice(0, 200) };
    console.log(`FAIL  ${name}: ${(err as Error).message}`);
    return undefined;
  }
}

async function main() {
  // Q1: can the API resolve the demo clients' references?
  const signals: Record<string, string[]> = {};
  for (const [who, loves] of Object.entries(PROFILES)) {
    const res = await attempt(`resolve:${who}`, () => Promise.all(loves.map((l) => resolveLove(qloo, l))));
    if (!res) continue;
    signals[who] = res.filter((r) => r.usedAsSignal).map((r) => r.chosen!.entity_id);
    checks[`resolve:${who}`] = {
      ok: true,
      used: signals[who].length,
      of: loves.length,
      results: res.map((r) => ({ input: r.input, status: r.status, chosenName: r.chosen?.name, chosenType: r.chosen?.type, similarity: +r.similarity.toFixed(2), alternatives: r.alternatives.length })),
    };
  }

  // Q2/Q4: what do place results carry, and are there enough of them?
  const crowd: Record<string, QlooEntity[]> = {};
  for (const [who, ids] of Object.entries(signals)) {
    if (!ids.length) continue;
    const r = await attempt(`places:${who}`, () => qloo.insightsEntities({ "filter.type": "urn:entity:place", "signal.interests.entities": ids, "filter.location.query": city }, `probe crowd ${who}`, 40));
    if (r) {
      crowd[who] = r.value;
      checks[`places:${who}`] = { ok: true, partial: Boolean(r.partial), ...fieldInventory(r.value) };
    }
  }
  const baseR = await attempt("places:baseline", () => qloo.insightsEntities({ "filter.type": "urn:entity:place", "filter.location.query": city }, "probe baseline", 40));
  if (baseR) checks["places:baseline"] = { ok: true, partial: Boolean(baseR.partial), ...fieldInventory(baseR.value) };

  // Q5: does the location fallback return anything?
  const firstIds = Object.values(signals).find((x) => x.length);
  if (firstIds) {
    const params: Params = { "filter.type": "urn:entity:place", "signal.interests.entities": firstIds, "signal.location.query": city };
    const fb = await attempt("places:location-signal-fallback", () => qloo.insightsEntities(params, "probe fallback", 20));
    if (fb) checks["places:location-signal-fallback"] = { ok: true, ...fieldInventory(fb.value) };
  }

  // Q3: cross-domain taste tags.
  for (const [who, ids] of Object.entries(signals)) {
    if (!ids.length) continue;
    const t = await attempt(`tags:${who}`, () => qloo.insightsTags({ "signal.interests.entities": ids, take: 20 }, `probe tags ${who}`));
    if (t) checks[`tags:${who}`] = { ok: true, n: t.value.length, names: t.value.map((x) => x.name).slice(0, 20), withAffinity: t.value.filter((x) => x.affinity !== undefined).length };
  }

  // Q2 (lexicon fit) and Q6: does Tastespec's lexicon read these places, and do the two clients differ?
  if (baseR) {
    const base = baseR.value.filter(hasText).map(classifyVenue);
    const fps: Record<string, unknown> = {};
    for (const [who, es] of Object.entries(crowd)) {
      const c = es.filter(hasText).map(classifyVenue);
      const dims = computeDimensions(c, base, []);
      fps[who] = {
        taggedCrowd: c.length,
        crowdPlacesMatchingAnyAtmosphere: c.filter((v) => v.dimensions.length).length,
        top: [...dims].sort((a, b) => b.score - a.score).slice(0, 3).map((d) => ({ id: d.id, crowd: `${d.crowdHits}/${d.crowdN}`, base: `${d.baseHits}/${d.baseN}`, lift: +d.lift.toFixed(2), pGreater: +d.pGreater.toFixed(2) })),
      };
    }
    checks.lexiconFit = { basePlacesMatchingAnyAtmosphere: base.filter((v) => v.dimensions.length).length, baseTagged: base.length, fingerprints: fps };
    if (crowd.maya && crowd.jordan) {
      const a = new Set(crowd.maya.map((e) => e.entity_id));
      const overlap = crowd.jordan.filter((e) => a.has(e.entity_id)).length;
      checks.distinguishesProfiles = { mayaPlaces: crowd.maya.length, jordanPlaces: crowd.jordan.length, overlap, jaccard: +(overlap / (crowd.maya.length + crowd.jordan.length - overlap)).toFixed(3) };
    }
  }

  // Q7: traceability: every call is in the ledger with a body hash and request id when Qloo sends one.
  checks.traceability = {
    calls: ledger.entries.length,
    withResponseHash: ledger.entries.filter((e) => e.detail.responseSha256).length,
    withQlooRequestId: ledger.entries.filter((e) => e.detail.qlooRequestId).length,
    statuses: ledger.entries.map((e) => e.detail.status),
  };
  report.stats = qloo.stats;

  const out = path.join(process.cwd(), "reports", "qloo-live-probe.json");
  mkdirSync(path.dirname(out), { recursive: true });
  const text = JSON.stringify(report, null, 2);
  if (text.includes(process.env.QLOO_API_KEY!)) throw new Error("refusing to write: report would contain the API key");
  writeFileSync(out, text);
  console.log(`\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
