"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ModeBadges } from "../Badges";
import { NarrowingGraph, pathwayText } from "../NarrowingGraph";
import { ActivityTab } from "./ActivityTab";
import { postBrief } from "./api";
import { DeepBriefView } from "./DeepBriefView";
import { DepthLadder } from "./DepthLadder";
import { EvidenceTab } from "./EvidenceTab";
import { InfluencePanel } from "./InfluencePanel";
import { QuestionCard } from "./QuestionCard";
import { RoomStage } from "./RoomStage";
import { SpecList } from "./SpecList";
import { buildDeepBrief } from "@/lib/deep/build";
import { buildTasteGraph } from "@/lib/graph";
import { ROOM_LABEL, TRADE_LABEL } from "@/lib/rulebooks";
import type { Brief } from "@/lib/types";

type Tab = "spec" | "handover" | "pathways" | "evidence" | "activity";

export function BriefWorkspace({ initial, canEdit, shared, llm }: { initial: Brief; canEdit: boolean; shared: boolean; llm: string | null }) {
  const [brief, setBrief] = useState(initial);
  const [tab, setTab] = useState<Tab>("spec");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [changedIds, setChangedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string>();
  const [focusLine, setFocusLine] = useState<string>();

  const deep = useMemo(() => buildDeepBrief(brief), [brief]);
  const graph = useMemo(() => buildTasteGraph(brief), [brief]);
  const fallback = brief.status === "UPSTREAM_UNAVAILABLE" || brief.status === "INSUFFICIENT_EVIDENCE";
  const diffs = brief.spec.filter((l) => l.value !== l.literalValue).length;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(undefined), 2600);
  };

  const accept = (next: Brief, note?: string) => {
    const changed = next.spec.filter((l) => brief.spec.find((p) => p.id === l.id)?.value !== l.value).map((l) => l.id);
    setChangedIds(changed);
    setBrief(next);
    if (note) flash(note);
    else if (changed.length) flash(`${changed.length} line${changed.length > 1 ? "s" : ""} changed`);
  };

  const act = async (fn: () => Promise<Brief>, note?: string) => {
    setBusy(true);
    setError(undefined);
    try {
      accept(await fn(), note);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "spec", label: "Spec", count: brief.spec.length },
    { id: "handover", label: "Hand-over" },
    { id: "pathways", label: "Pathways", count: graph.nodes.length },
    { id: "evidence", label: "Evidence", count: brief.ledger.length },
    ...(canEdit ? [{ id: "activity" as const, label: "Client & activity" }] : []),
  ];

  return (
    <div>
      <header className="brief-head">
        <div>
          <div className="row tight">
            <span className="eyebrow" style={{ margin: 0 }}>
              {TRADE_LABEL[brief.input.trade]} · {ROOM_LABEL[brief.input.room]} · {brief.input.city}
              {brief.input.project ? ` · ${brief.input.project}` : ""}
            </span>
            <ModeBadges brief={brief} />
          </div>
          <h1>
            {brief.input.clientLabel} said {brief.input.words.map((w) => `“${w}”`).join(" and ")}.
            {!fallback ? (
              <>
                <br />
                <span className="direction">They mean {deep.title}.</span>
              </>
            ) : null}
          </h1>
          <p className="lede" style={{ margin: 0 }}>
            {fallback
              ? brief.status === "UPSTREAM_UNAVAILABLE"
                ? "Qloo couldn't be reached, so this is the literal reading of their words: nothing below is personalised."
                : "Not enough taste evidence to personalise, so the agent abstained: this is the literal reading of their words."
              : `${diffs} of ${brief.spec.length} lines differ from a literal reading. ${deep.summary.split(". ").slice(1, 2).join(". ")}${deep.summary.split(". ").length > 1 ? "." : ""}`}
          </p>
        </div>
        <div className="row no-print">
          {canEdit ? (
            <button type="button" className="btn" onClick={() => setTab("activity")}>
              Share with {brief.input.clientLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setTab("handover");
              setTimeout(() => window.print(), 300);
            }}
          >
            Hand-over PDF
          </button>
        </div>
      </header>

      {!canEdit ? (
        <div className="note no-print" style={{ marginBottom: 16 }}>
          Read-only view. Only the designer who created this brief can decide lines, answer, go deeper or share it.
        </div>
      ) : null}
      {brief.warnings.length ? (
        <div className="stack no-print" style={{ gap: 6, marginBottom: 16 }}>
          {brief.warnings.map((w) => (
            <div key={w} className="note">
              {w}
            </div>
          ))}
        </div>
      ) : null}
      {error ? <div className="err" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div className="brief-hero">
        <div className="card" style={{ padding: 14 }}>
          <RoomStage spec={brief.spec} dims={brief.dimensions} trade={brief.input.trade} room={brief.input.room} label={`${ROOM_LABEL[brief.input.room]} drawn from ${brief.input.clientLabel}'s spec`} />
        </div>
        <div className="stack">
          <QuestionCard q={brief.question} clientLabel={brief.input.clientLabel} fixture={brief.dataMode === "fixture"} canAnswer={canEdit} busy={busy} onAnswer={(a) => act(async () => (await postBrief(`/api/briefs/${brief.id}/answer`, { answer: a })).brief)} />
          {!fallback ? (
            <div className="card">
              <div className="eyebrow">Strongest signals</div>
              <div className="stack" style={{ gap: 8 }}>
                {[...brief.dimensions]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((d) => (
                    <div key={d.id} className="row between" style={{ gap: 8 }}>
                      <span>
                        <b>{d.label}</b>
                        <span className="small muted"> · e.g. {d.exemplars.slice(0, 2).map((e) => e.name).join(", ") || "—"}</span>
                      </span>
                      <span className="mono small" title={d.clientAdjusted ? "Moved by the client's answer" : "Measured lift"}>
                        {d.clientAdjusted ? "answer · " : ""}×{d.lift.toFixed(1)}
                      </span>
                    </div>
                  ))}
              </div>
              <p className="tiny muted" style={{ margin: "10px 0 0" }}>
                ×lift: how much more often places their taste neighbourhood chooses carry this atmosphere than typical {brief.input.city} places.
              </p>
            </div>
          ) : null}
          <DepthLadder brief={brief} canEdit={canEdit} onBrief={(b, _changed, note) => accept(b, note)} />
        </div>
      </div>

      <div className="tabs section no-print" role="tablist" aria-label="Brief sections">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count !== undefined ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "spec" ? (
          <SpecList
            brief={brief}
            changedIds={changedIds}
            canEdit={canEdit}
            busy={busy}
            decide={(lineId, status, revisedTo) => act(async () => (await postBrief(`/api/briefs/${brief.id}/decision`, { lineId, status, revisedTo })).brief, status === "accepted" ? "Accepted" : status === "revised" ? "Revision saved" : "Back to proposed")}
          />
        ) : tab === "handover" ? (
          <DeepBriefView brief={brief} canEdit={canEdit} llm={llm} />
        ) : tab === "pathways" ? (
          <div className="stack">
            <div className="panel-title">
              <div>
                <div className="eyebrow">Pathways</div>
                <h2 style={{ margin: 0 }}>Every line, traced back to what they said</h2>
              </div>
              <span className="small muted" style={{ maxWidth: 460 }}>
                The agent keeps no memory between clients. This graph is all it knows about {brief.input.clientLabel}: hover or tap a node to light its pathway.
              </span>
            </div>
            <div className="row tight">
              {brief.spec.map((l) => (
                <button key={l.id} type="button" className={`btn sm${focusLine === l.id ? " primary" : ""}`} onClick={() => setFocusLine(focusLine === l.id ? undefined : l.id)}>
                  {l.category}
                </button>
              ))}
            </div>
            {focusLine ? (
              <div className="callout">
                {pathwayText(graph, `s:${focusLine}`).map((hop, i, arr) => (
                  <span key={i}>
                    {hop}
                    {i < arr.length - 1 ? <span className="muted"> → </span> : null}
                  </span>
                ))}
              </div>
            ) : null}
            <NarrowingGraph key={focusLine ?? "none"} graph={graph} initialFocus={focusLine ? `s:${focusLine}` : undefined} />
            <InfluencePanel brief={brief} canEdit={canEdit} onBrief={(b) => accept(b, "Influence measured")} />
          </div>
        ) : tab === "evidence" ? (
          <EvidenceTab brief={brief} canEdit={canEdit} />
        ) : (
          <ActivityTab brief={brief} canEdit={canEdit} shared={shared} onBrief={(b) => accept(b)} />
        )}
      </div>

      <div className="row small muted section no-print">
        <span>
          Brief <code>{brief.id}</code> · {brief.rulebookVersion} · {brief.stats.qlooRequests} Qloo requests · {Math.round(brief.stats.totalMs / 100) / 10}s
        </span>
        <span className="spacer grow" />
        <Link href="/app">All briefs</Link>
        <Link href="/method">How this works</Link>
      </div>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
