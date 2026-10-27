"use client";

import type { Brief, TraceStep } from "@/lib/types";

const PLAIN: Partial<Record<TraceStep["state"], string>> = {
  INTAKE: "Read the brief",
  NORMALIZE: "Normalised words and references",
  RESOLVE_ENTITIES: "Identified the client's references in Qloo",
  FETCH_QLOO: "Fetched taste-matched and typical places",
  ASSESS_EVIDENCE: "Checked the evidence was sufficient",
  INTERPRET: "Measured atmospheres and decoded words",
  CHECK_CONSTRAINTS: "Applied hard constraints",
  GENERATE_SPEC: "Drafted the spec",
  SIMULATE_ALTERNATIVES: "Decided whether to ask a question",
  COUNTER_TEST: "Compared with an answer that has no Qloo data",
  VALIDATE: "Checked safety invariants",
  PERSIST: "Saved",
};

/** The agent's decision trace: what each step decided and why, not a reasoning transcript. */
export function TracePanel({ brief }: { brief: Brief }) {
  const total = brief.trace.reduce((a, t) => a + t.ms, 0);
  return (
    <section className="card section">
      <div className="eyebrow">Agent execution trace</div>
      <p className="small muted">
        {brief.trace.length} steps in {(brief.stats?.totalMs ?? total) / 1000}s · {brief.stats?.qlooRequests ?? "?"} Qloo requests ({brief.stats?.qlooRetries ?? 0} retries,{" "}
        {brief.stats?.qlooFailures ?? 0} failures) · {brief.stats?.llmCalls ?? 0} model calls. Each step records what it decided, why, and which ledger entries back it.
      </p>
      <ol className="timeline">
        {brief.trace.map((t) => (
          <li key={t.seq}>
            <span className={`dot ${t.validation === "fail" ? "error" : t.validation === "warn" ? "warn" : "done"}`} aria-hidden />
            <div>
              <div>
                <b>{PLAIN[t.state] ?? t.state}</b> <span className="muted small mono">{t.state} · {t.tool} · {t.ms} ms{t.retries ? ` · ${t.retries} retries` : ""}</span>
              </div>
              <div className="small">{t.decision}</div>
              {t.rationale ? <div className="small muted">{t.rationale}</div> : null}
              {t.evidence.length ? <div className="small muted mono">ledger {t.evidence.slice(0, 12).map((s) => `#${s}`).join(" ")}{t.evidence.length > 12 ? " …" : ""}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
