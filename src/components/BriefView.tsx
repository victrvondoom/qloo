"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Fingerprint } from "./Fingerprint";
import { BasisPill, ModeBadges } from "./Badges";
import { TracePanel } from "./TracePanel";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import { verifyLedger, type VerifyResult } from "@/lib/ledger";
import { evidenceReport } from "@/lib/evidence";
import { ROOM_LABEL, TRADE_LABEL } from "@/lib/rulebooks";
import type { Brief, SpecLine } from "@/lib/types";

async function post(url: string, body: unknown): Promise<Brief> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json()) as { brief?: Brief; error?: string };
  if (!res.ok || !j.brief) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j.brief;
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

export function BriefView({ initial, compact = false, canEdit = false }: { initial: Brief; compact?: boolean; canEdit?: boolean }) {
  const [brief, setBrief] = useState(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [changedIds, setChangedIds] = useState<string[]>([]);
  const city = brief.input.city;

  const act = async (fn: () => Promise<Brief>) => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await fn();
      setChangedIds(next.spec.filter((l) => brief.spec.find((p) => p.id === l.id)?.value !== l.value).map((l) => l.id));
      setBrief(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const literalDiffs = brief.spec.filter((l) => l.value !== l.literalValue).length;
  const audit = brief.llmBaseline.audit;
  const agree = audit?.filter((a) => a.agrees).length ?? 0;
  const fallback = brief.status === "UPSTREAM_UNAVAILABLE" || brief.status === "INSUFFICIENT_EVIDENCE";
  const report = evidenceReport(brief);

  return (
    <div>
      <header>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <div className="eyebrow" style={{ margin: 0 }}>
            {TRADE_LABEL[brief.input.trade]} · {ROOM_LABEL[brief.input.room]} · {city}
          </div>
          <ModeBadges brief={brief} />
        </div>
        {!canEdit ? (
          <div className="banner warn" style={{ borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
            Read-only view. Only the designer who created this brief can record decisions or answers.
          </div>
        ) : null}
        <h1 style={{ fontSize: compact ? 30 : undefined }}>
          {brief.input.clientLabel} said{" "}
          {brief.input.words.map((w, i) => (
            <span key={w}>
              <em>“{w}”</em>
              {i < brief.input.words.length - 1 ? ", " : ""}
            </span>
          ))}
          .
        </h1>
        {fallback ? (
          <p className="lede">
            {brief.status === "UPSTREAM_UNAVAILABLE"
              ? "Qloo couldn't be reached, so this brief is the literal reading of the client's words. Nothing below is personalised."
              : "There wasn't enough taste evidence to personalise, so the agent abstained: this brief is the literal reading of the client's words."}
          </p>
        ) : (
          <p className="lede">
            Taken literally, that&apos;s one room. Read through what {brief.input.clientLabel} loves, {literalDiffs} of {brief.spec.length} spec
            lines come out differently: {report.counts.evidence_supported} backed by Qloo evidence, {report.counts.derived} by the client&apos;s answer
            or a hard constraint, {report.counts.client_stated} by the client&apos;s own words
            {report.counts.unsupported ? `, ${report.counts.unsupported} unsupported` : ""}.
            {audit ? ` An LLM given the same words and loves, without Qloo, agreed with the evidence on ${agree} of ${audit.length}.` : ""}
          </p>
        )}
        {brief.warnings.map((w) => (
          <div key={w} className="err" style={{ background: "var(--warn-bg)", color: "var(--warn)", marginTop: 8 }}>
            {w}
          </div>
        ))}
        {error ? <div className="err" style={{ marginTop: 8 }}>{error}</div> : null}
      </header>

      {brief.question && !brief.question.answer ? (
        <section className="card section" style={{ borderColor: "var(--accent)" }}>
          <div className="eyebrow">
            One question: the answer is expected to change {(brief.question.expectedChange ?? brief.question.expectedImpact).toFixed?.(1) ?? brief.question.expectedImpact} lines
          </div>
          <h2>{brief.question.prompt}</h2>
          <p className="muted small">
            Both are {brief.dataMode === "fixture" ? "fictional places from the synthetic fixture" : "places that Qloo ranks highly for people with this taste"}. One reads as{" "}
            {DIMENSION_BY_ID[brief.question.optionA.carries].label.toLowerCase()}, the other as{" "}
            {DIMENSION_BY_ID[brief.question.optionB.carries].label.toLowerCase()}. The agent simulated both answers first: they lead to{" "}
            {brief.question.expectedImpact} different lines, and the evidence alone can&apos;t call it
            {brief.question.entropyBits !== undefined ? ` (answer uncertainty ${brief.question.entropyBits.toFixed(2)} bits)` : ""}.
          </p>
          <div className="choice">
            {(["A", "B"] as const).map((k) => {
              const o = k === "A" ? brief.question!.optionA : brief.question!.optionB;
              return (
                <button key={k} disabled={busy || !canEdit} onClick={() => act(() => post(`/api/briefs/${brief.id}/answer`, { answer: k }))}>
                  <b>{o.name}</b>
                  <span className="muted small">{DIMENSION_BY_ID[o.carries].label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn sm" disabled={busy || !canEdit} onClick={() => act(() => post(`/api/briefs/${brief.id}/answer`, { answer: "neither" }))}>
              Neither / don&apos;t know them
            </button>
          </div>
        </section>
      ) : brief.question?.answer ? (
        <section className="card section">
          <div className="eyebrow">Client answered</div>
          <p style={{ margin: 0 }}>
            {brief.question.answer === "neither"
              ? "Neither. The spec stays on the evidence alone."
              : `${brief.input.clientLabel} picked ${brief.question.answer === "A" ? brief.question.optionA.name : brief.question.optionB.name} over ${brief.question.answer === "A" ? brief.question.optionB.name : brief.question.optionA.name}.`}
            {changedIds.length ? ` ${changedIds.length} spec line${changedIds.length > 1 ? "s" : ""} changed (highlighted).` : ""}
          </p>
        </section>
      ) : null}

      <section className="card section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="eyebrow">The spec</div>
            <h2>What to build</h2>
          </div>
          <span className="muted small">Every line names the evidence behind it. Mark each one as the client reacts.</span>
        </div>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "16%" }}>Line</th>
                <th style={{ width: "36%" }}>Tastespec</th>
                <th style={{ width: "24%" }}>If “{brief.input.words.join(", ")}” is taken literally</th>
                <th>Pro decision</th>
              </tr>
            </thead>
            <tbody>
              {brief.spec.map((l) => (
                <SpecRow key={l.id} line={l} briefId={brief.id} city={city} changed={changedIds.includes(l.id)} busy={busy || !canEdit} act={act} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2 section" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="eyebrow">What they said vs. what they mean</div>
          {brief.words.map((w) => (
            <div key={w.word} style={{ marginBottom: 16 }}>
              <h3>
                “{w.word}”{" "}
                {w.chosen && !w.chosen.isDictionaryDefault ? <span className="pill low">not the literal sense</span> : null}
                {w.source === "llm" ? <span className="pill medium" style={{ marginLeft: 6 }}>readings from LLM</span> : null}
              </h3>
              {w.known ? (
                w.readings.map((r) => (
                  <div key={r.dimension} className={`reading ${r === w.readings[0] ? "chosen" : ""}`}>
                    <div>
                      {r.meaning}
                      {r.isDictionaryDefault ? <span className="muted small"> (literal)</span> : null}
                      <div className="meter" style={{ marginTop: 3 }}>
                        <div style={{ width: pct(r.weight) }} />
                      </div>
                    </div>
                    <div className="small" style={{ textAlign: "right" }}>{pct(r.weight)}</div>
                  </div>
                ))
              ) : (
                <p className="muted small">Not in the lexicon, so it doesn&apos;t move the spec.</p>
              )}
            </div>
          ))}
        </section>
        <section className="card">
          <div className="eyebrow">Atmosphere fingerprint</div>
          <p className="small muted">
            Rooms that Qloo ranks highest for people who love what {brief.input.clientLabel} loves ({brief.crowdVenues.length} tagged places),
            compared with {city}&apos;s places with no taste signal ({brief.baseVenues.length}).
          </p>
          <Fingerprint dims={brief.dimensions} city={city} />
        </section>
      </div>

      {brief.narrative ? (
        <section className="card section">
          <div className="eyebrow">Note to {brief.input.clientLabel} (written only from the evidence above)</div>
          <p className="quote">{brief.narrative}</p>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(brief.narrative ?? "")}>Copy note</button>
        </section>
      ) : null}

      <section className="card section">
        <div className="eyebrow">Counter-test: the same job without Qloo</div>
        {audit ? (
          <>
            <h2>
              {brief.llmBaseline.model} alone matched the evidence on {agree} of {audit.length} lines
            </h2>
            <p className="small muted">
              Same words, same list of loves, same menu of options to choose from. It never saw Qloo data. Where it disagrees, the column on
              the right is what the taste evidence supports.
            </p>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>LLM only</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.category}>
                      <td>
                        {a.category} {a.agrees ? <span className="pill high">agrees</span> : <span className="pill bad">differs</span>}
                      </td>
                      <td className={a.agrees ? "" : "strike"}>{a.llmValue}</td>
                      <td>{a.evidenceValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">{brief.llmBaseline.reason}</p>
        )}
      </section>

      <Resolutions brief={brief} />
      <VenueEvidence brief={brief} />
      {brief.trace?.length ? <TracePanel brief={brief} /> : null}
      <Outcome brief={brief} busy={busy || !canEdit} act={act} />
      <LedgerPanel brief={brief} />
      {!compact ? (
        <div className="row small muted section">
          <span>
            Brief <code>{brief.id}</code> · rulebook <code>{brief.rulebookVersion ?? "—"}</code> · <Link href="/projects">all projects</Link> ·{" "}
            <Link href="/method">how this works</Link> · <button className="btn sm" onClick={() => window.print()}>Print / save as PDF</button>
          </span>
          {canEdit ? <DeleteButton id={brief.id} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function SpecRow({
  line,
  briefId,
  city,
  changed,
  busy,
  act,
}: {
  line: SpecLine;
  briefId: string;
  city: string;
  changed: boolean;
  busy: boolean;
  act: (fn: () => Promise<Brief>) => void;
}) {
  const [revising, setRevising] = useState(false);
  const [text, setText] = useState(line.revisedTo ?? "");
  const same = line.value === line.literalValue;
  return (
    <tr className={changed ? "changed" : undefined}>
      <td>
        <b>{line.category}</b>
        <div className="row" style={{ marginTop: 4, gap: 4 }}>
          <span className={`pill ${line.confidence}`} title="How firmly the evidence pins this line down. Zero evidence is always low.">
            {line.confidence}
          </span>
          {line.basis ? <BasisPill basis={line.basis} /> : null}
        </div>
      </td>
      <td>
        <div>{line.value}</div>
        <div className="muted small" style={{ marginTop: 4 }}>{line.why}</div>
        {line.constraints?.length ? <div className="small muted" style={{ marginTop: 4 }}>Constraints: {line.constraints.join("; ")}</div> : null}
        <details style={{ marginTop: 6 }}>
          <summary className="small">Evidence{line.evidenceLedger?.length ? ` · ${line.evidenceLedger.length} Qloo requests` : ""}</summary>
          {!line.evidence.length ? <div className="small muted" style={{ marginTop: 6 }}>No Qloo evidence: this line comes from the client&apos;s words or a rule.</div> : null}
          {line.evidenceLedger?.length ? (
            <div className="small muted" style={{ marginTop: 6 }}>
              From ledger entries {line.evidenceLedger.map((s) => `#${s}`).join(", ")}; signals {line.signalEntityIds.length} resolved references.
            </div>
          ) : null}
          {line.history?.length ? (
            <div className="small" style={{ marginTop: 6 }}>
              Review history: {line.history.map((h) => `${h.status}${h.status === "revised" ? ` → ${h.value}` : ""} (${new Date(h.at).toLocaleString()})`).join(" · ")}
            </div>
          ) : null}
          {line.evidence.map((e) => (
            <div key={e.dimension} className="small" style={{ marginTop: 6 }}>
              <b>{DIMENSION_BY_ID[e.dimension].label}</b>: {e.crowdHits} of {e.crowdN} taste-matched places vs {e.baseHits} of {e.baseN} typical{" "}
              {city} places (×{e.lift.toFixed(1)}, P(higher) {Math.round(e.pGreater * 100)}%).
              {e.exemplars.length ? <> e.g. {e.exemplars.join(", ")}.</> : null}
            </div>
          ))}
        </details>
      </td>
      <td className={same ? "muted small" : "small"}>{same ? "Same" : line.literalValue}</td>
      <td>
        {line.status === "accepted" ? (
          <span className="pill high">accepted</span>
        ) : line.status === "revised" ? (
          <div className="small">
            <span className="pill low">revised</span> → {line.revisedTo}
          </div>
        ) : null}
        {revising ? (
          <div style={{ marginTop: 6 }}>
            <input type="text" value={text} placeholder="What did they want instead?" onChange={(e) => setText(e.target.value)} />
            <div className="row" style={{ marginTop: 6 }}>
              <button
                className="btn sm"
                disabled={busy || !text.trim()}
                onClick={() => {
                  setRevising(false);
                  act(() => post(`/api/briefs/${briefId}/decision`, { lineId: line.id, status: "revised", revisedTo: text }));
                }}
              >
                Save
              </button>
              <button className="btn sm" onClick={() => setRevising(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ marginTop: line.status === "proposed" ? 0 : 6 }}>
            {line.status !== "accepted" ? (
              <button className="btn sm" disabled={busy} onClick={() => act(() => post(`/api/briefs/${briefId}/decision`, { lineId: line.id, status: "accepted" }))}>
                Accept
              </button>
            ) : null}
            <button className="btn sm" disabled={busy} onClick={() => setRevising(true)}>
              Revise
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function Resolutions({ brief }: { brief: Brief }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const rerun = async (input: string, entityId: string) => {
    setBusy(true);
    setErr(undefined);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brief.input, pinned: { ...(brief.input.pinned ?? {}), [input]: entityId } }),
      });
      const text = await res.text();
      const last = text.trim().split("\n").map((l) => JSON.parse(l) as { type: string; brief?: Brief; message?: string }).at(-1);
      if (last?.type === "brief" && last.brief) router.push(`/brief/${last.brief.id}`);
      else throw new Error(last?.message ?? "Re-run failed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <section className="card section">
      <div className="eyebrow">What “{brief.input.clientLabel} loves” resolved to in Qloo</div>
      <p className="small muted">
        A wrong match is the quietest way for a taste agent to fail: everything downstream stays confident and describes someone else. Weak
        matches are dropped, ambiguous ones are flagged, and you can pin a different candidate (this re-runs the brief).
      </p>
      {err ? <div className="err">{err}</div> : null}
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>They said</th>
              <th>Matched</th>
              <th>Status</th>
              <th>Other candidates</th>
            </tr>
          </thead>
          <tbody>
            {brief.resolutions.map((r) => (
              <tr key={r.input}>
                <td>{r.input}</td>
                <td>
                  {r.chosen ? (
                    <>
                      {r.chosen.name} <span className="muted small">({r.chosen.type.replace("urn:entity:", "")})</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span className={`pill ${r.status === "resolved" ? "high" : r.status === "ambiguous" ? "low" : "bad"}`}>
                    {r.status === "not_found" ? "not found" : r.status === "abstained" ? "abstained" : r.status}
                  </span>
                  {r.confidence !== undefined ? <span className="small muted"> · confidence {Math.round(r.confidence * 100)}%</span> : null}
                  {r.note ? <div className="small muted" style={{ marginTop: 4 }}>{r.note}</div> : null}
                </td>
                <td>
                  <div className="row">
                    {r.alternatives.slice(0, 3).map((a) => (
                      <button key={a.entity_id} className="btn sm" disabled={busy} onClick={() => rerun(r.input, a.entity_id)} title="Use this one and re-run">
                        {a.name} <span className="muted">· {a.type.replace("urn:entity:", "")}</span>
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VenueEvidence({ brief }: { brief: Brief }) {
  const top = useMemo(() => [...brief.crowdVenues].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)).slice(0, 24), [brief.crowdVenues]);
  return (
    <section className="card section">
      <details>
        <summary>
          <span className="eyebrow" style={{ display: "inline" }}>The rooms behind the fingerprint ({brief.crowdVenues.length} taste-matched places)</span>
        </summary>
        <p className="small muted" style={{ marginTop: 10 }}>
          Each place counts toward an atmosphere when one of its Qloo tags or review keywords matches the lexicon (see Method). Untagged
          places are excluded from both sides.
        </p>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Affinity</th>
                <th>Reads as</th>
              </tr>
            </thead>
            <tbody>
              {top.map((v) => (
                <tr key={v.entity_id}>
                  <td>{v.name}</td>
                  <td>{v.affinity !== undefined ? v.affinity.toFixed(2) : "—"}</td>
                  <td className="small">
                    {v.matches.length
                      ? v.matches.map((m) => `${DIMENSION_BY_ID[m.dimension].short} (“${m.term}”)`).join(" · ")
                      : <span className="muted">no atmosphere terms</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Outcome({ brief, busy, act }: { brief: Brief; busy: boolean; act: (fn: () => Promise<Brief>) => void }) {
  const [note, setNote] = useState(brief.outcome?.note ?? "");
  const decided = brief.spec.filter((l) => l.status !== "proposed").length;
  return (
    <section className="card section">
      <div className="eyebrow">Outcome tracking</div>
      <p className="small muted">
        {decided} of {brief.spec.length} lines decided ({brief.spec.filter((l) => l.status === "accepted").length} accepted,{" "}
        {brief.spec.filter((l) => l.status === "revised").length} revised). After install, record how the client felt. Projects aggregates
        these across clients.
      </p>
      <div className="row">
        {[1, 2, 3, 4, 5].map((r) => (
          <button
            key={r}
            className={`btn sm ${brief.outcome?.rating === r ? "primary" : ""}`}
            disabled={busy}
            onClick={() => act(() => post(`/api/briefs/${brief.id}/outcome`, { rating: r, note }))}
          >
            {r}
          </button>
        ))}
        <input type="text" style={{ maxWidth: 380 }} placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </section>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <span className="row">
      {confirm ? (
        <>
          <span className="small">Delete this brief and its evidence for good?</span>
          <button
            className="btn sm"
            onClick={async () => {
              const res = await fetch(`/api/briefs/${id}`, { method: "DELETE" });
              if (res.ok) router.push("/projects");
              else setErr(((await res.json()) as { error?: string }).error ?? "Delete failed");
            }}
          >
            Yes, delete
          </button>
          <button className="btn sm" onClick={() => setConfirm(false)}>Keep</button>
        </>
      ) : (
        <button className="btn sm" onClick={() => setConfirm(true)}>Delete brief</button>
      )}
      {err ? <span className="small" style={{ color: "var(--bad)" }}>{err}</span> : null}
    </span>
  );
}

function LedgerPanel({ brief }: { brief: Brief }) {
  const [result, setResult] = useState<VerifyResult>();
  const counts = brief.ledger.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  return (
    <section className="card section">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">Evidence ledger</div>
          <h2>{brief.ledger.length} entries, hash-chained</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {counts.qloo_call ?? 0} Qloo calls · {counts.decision ?? 0} agent decisions · {counts.computation ?? 0} computations ·{" "}
            {counts.llm_call ?? 0} model calls · {counts.client_input ?? 0} client/pro inputs
          </p>
        </div>
        <div className="row">
          <button className="btn sm" onClick={async () => setResult(await verifyLedger(brief.ledger))}>Verify chain in your browser</button>
          <a className="btn sm" href={`/api/briefs/${brief.id}/bundle`}>Download evidence bundle</a>
        </div>
      </div>
      {result ? (
        <div className={`err`} style={{ marginTop: 10, background: result.ok ? "var(--good-bg)" : "var(--bad-bg)", color: result.ok ? "var(--good)" : "var(--bad)" }}>
          {result.ok
            ? `Intact: all ${result.checked} entries hash correctly and link to the one before. Head ${result.head.slice(0, 16)}…`
            : `Broken at entry ${result.firstBadSeq}: ${result.reason}.`}
        </div>
      ) : null}
      <p className="small muted" style={{ marginTop: 8 }}>
        An intact chain proves the record hasn&apos;t been edited, reordered or truncated since the head hash was issued. It doesn&apos;t prove the
        data is true: Qloo results are aggregate affinities, and the head hash should be compared with one recorded when the brief was shared.
      </p>
      <details style={{ marginTop: 12 }}>
        <summary className="small">Show entries</summary>
        <div style={{ marginTop: 8 }}>
          {brief.ledger.map((e) => (
            <div key={e.seq} className="ledger-row">
              <div className="mono muted">#{e.seq}</div>
              <div className="kind small"><span className="chip">{e.kind.replace("_", " ")}</span></div>
              <div className="body">
                <div>{e.summary}</div>
                <details>
                  <summary className="small muted">detail · <span className="hash">{e.hash.slice(0, 20)}…</span></summary>
                  <pre className="small" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--surface-2)", padding: 10, borderRadius: 8 }}>
                    {JSON.stringify(e.detail, null, 2)}
                  </pre>
                  <div className="hash">prev {e.prevHash}</div>
                  <div className="hash">hash {e.hash}</div>
                </details>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
