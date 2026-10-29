"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postBrief, timeAgo } from "./api";
import type { BriefEvent } from "@/lib/store";
import type { Brief } from "@/lib/types";

const LABEL: Record<string, (p: Record<string, unknown>, b: Brief) => string> = {
  created: (p) => `Brief built (${String(p.status ?? "").replace(/_/g, " ").toLowerCase()}, ${p.lines} lines)`,
  answered: (p, b) => `${p.answer === "neither" ? "Answered “neither”" : `Chose ${p.answer === "A" ? b.question?.optionA.name : b.question?.optionB.name}`}${Array.isArray(p.changed) && p.changed.length ? ` · changed ${p.changed.join(", ")}` : ""}`,
  reaction: (p) => `${p.reaction === "love" ? "Loves" : p.reaction === "unsure" ? "Unsure about" : "Wants to change"} “${p.category ?? p.lineId}”`,
  decision: (p, b) => `${String(p.status)} “${b.spec.find((l) => l.id === p.lineId)?.category ?? p.lineId}”`,
  outcome: (p) => `Outcome rated ${p.rating}/5`,
  shared: () => "Client link created",
  unshared: () => "Client link revoked",
  depth_explored: (p) => `Explored depth ${p.level} (${p.crowdN} places${p.usable ? "" : ", too few"})`,
  depth_applied: (p) => `Spec switched to depth ${p.level}${Array.isArray(p.changed) && p.changed.length ? ` · changed ${p.changed.join(", ")}` : ""}`,
  prose_written: () => "Claude prose written for the hand-over",
  influence: (p) => `Influence measured: ${p.robust} of ${p.lines} lines survive dropping any one reference`,
};

function SharePanel({ brief, initiallyShared }: { brief: Brief; initiallyShared: boolean }) {
  const [shared, setShared] = useState(initiallyShared);
  const [url, setUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/briefs/${brief.id}/share`, { method: "POST" });
      const j = (await res.json()) as { path?: string; error?: string };
      if (j.path) {
        setUrl(`${location.origin}${j.path}`);
        setShared(true);
      }
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await fetch(`/api/briefs/${brief.id}/share`, { method: "DELETE" });
      setShared(false);
      setUrl(undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <div className="eyebrow amber">Client link</div>
      <h3>Send {brief.input.clientLabel} their room</h3>
      <p className="small muted">
        They see the direction, the room drawn at each scene, the reference places and every line in plain words. They can answer the question and react to lines; you see it here as it happens. No account needed, nothing about the evidence ledger or your notes is shown, and you can revoke the link at any time.
      </p>
      {url ? (
        <div className="share-box">
          <code>{url}</code>
          <button
            type="button"
            className="btn sm primary"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <a className="btn sm" href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      ) : shared ? (
        <p className="small">A link is live. Links are shown once; make a new one to copy it again (the old one stops working).</p>
      ) : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn sm" disabled={busy} onClick={create}>
          {shared ? "Make a new link" : "Create client link"}
        </button>
        {shared ? (
          <button type="button" className="btn sm ghost" disabled={busy} onClick={revoke}>
            Revoke
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Feed({ brief, onRemoteChange }: { brief: Brief; onRemoteChange: () => void }) {
  const [list, setList] = useState<BriefEvent[]>([]);
  const last = useRef(0);
  const seenUpdate = useRef(brief.updatedAt);
  const onChange = useRef(onRemoteChange);
  useEffect(() => {
    onChange.current = onRemoteChange;
  });
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/briefs/${brief.id}/events?after=${last.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { events: BriefEvent[]; updatedAt: string };
        if (stop) return;
        if (j.events.length) {
          last.current = j.events.at(-1)!.id;
          setList((l) => [...l, ...j.events]);
        }
        if (j.updatedAt !== seenUpdate.current) {
          seenUpdate.current = j.updatedAt;
          if (j.events.some((e) => e.actor === "client")) onChange.current();
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [brief.id]);
  return (
    <section className="card">
      <div className="panel-title">
        <div className="eyebrow">
          <span className="live-dot" style={{ marginRight: 8 }} />
          Activity
        </div>
        <span className="small muted">Updates every few seconds</span>
      </div>
      {list.length ? (
        <ul className="feed">
          {[...list].reverse().map((e) => (
            <li key={e.id}>
              <span className={`who ${e.actor}`} title={e.actor}>
                {e.actor === "client" ? brief.input.clientLabel.slice(0, 1) : e.actor === "agent" ? "A" : "D"}
              </span>
              <span>{(LABEL[e.kind] ?? ((p) => `${e.kind} ${JSON.stringify(p)}`))(e.payload, brief)}</span>
              <span className="t">{timeAgo(e.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>Nothing yet.</p>
      )}
    </section>
  );
}

export function ActivityTab({ brief, canEdit, shared, onBrief }: { brief: Brief; canEdit: boolean; shared: boolean; onBrief: (b: Brief) => void }) {
  const router = useRouter();
  const [note, setNote] = useState(brief.outcome?.note ?? "");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  if (!canEdit) return <p className="muted">Only the designer who created this brief can see its activity.</p>;
  const refresh = async () => {
    const res = await fetch(`/api/briefs/${brief.id}`, { cache: "no-store" });
    const j = (await res.json()) as { brief?: Brief };
    if (j.brief) onBrief(j.brief);
  };
  return (
    <div className="grid2" style={{ alignItems: "start" }}>
      <div className="stack">
        <SharePanel brief={brief} initiallyShared={shared} />
        <section className="card">
          <div className="eyebrow">After install</div>
          <h3>How did it land?</h3>
          <p className="small muted">
            {brief.spec.filter((l) => l.status !== "proposed").length} of {brief.spec.length} lines decided. Rate the outcome once the room is done; Projects aggregates these across clients.
          </p>
          <div className="row tight">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                className={`btn sm${brief.outcome?.rating === r ? " primary" : ""}`}
                onClick={async () => {
                  try {
                    onBrief((await postBrief(`/api/briefs/${brief.id}/outcome`, { rating: r, note })).brief);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                {r}
              </button>
            ))}
            <input type="text" style={{ maxWidth: 300 }} placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Outcome note" />
          </div>
        </section>
        <section className="card">
          <div className="eyebrow">Retention</div>
          <p className="small muted">Brief, evidence, activity and generated text are deleted together. Untouched briefs are removed after the retention period.</p>
          {confirm ? (
            <div className="row tight">
              <span className="small">Delete for good?</span>
              <button
                type="button"
                className="btn sm"
                onClick={async () => {
                  const res = await fetch(`/api/briefs/${brief.id}`, { method: "DELETE" });
                  if (res.ok) router.push("/app");
                  else setErr(((await res.json()) as { error?: string }).error ?? "Delete failed");
                }}
              >
                Yes, delete
              </button>
              <button type="button" className="btn sm ghost" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="btn sm ghost" onClick={() => setConfirm(true)}>
              Delete this brief
            </button>
          )}
          {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
        </section>
      </div>
      <Feed brief={brief} onRemoteChange={refresh} />
    </div>
  );
}
