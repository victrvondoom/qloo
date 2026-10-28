"use client";

import { useState } from "react";
import { QuestionCard } from "./brief/QuestionCard";
import { RoomStage } from "./brief/RoomStage";
import type { DeepBrief } from "@/lib/deep/build";
import type { ClientView } from "@/lib/share";
import type { ClientReaction } from "@/lib/types";

const OPTIONS: { id: ClientReaction["reaction"]; label: string }[] = [
  { id: "love", label: "♥ Love it" },
  { id: "unsure", label: "Not sure" },
  { id: "change", label: "Change this" },
];

function LineCard({ line, feedback, busy, onReact }: { line: ClientView["spec"][number]; feedback?: ClientReaction; busy: boolean; onReact: (r: ClientReaction["reaction"], note?: string) => void }) {
  const [noteFor, setNoteFor] = useState<ClientReaction["reaction"]>();
  const [note, setNote] = useState(feedback?.note ?? "");
  return (
    <div className="client-line">
      <div>
        <div className="cat">{line.category}</div>
        <div className="v">{line.value}</div>
        <div className="small muted" style={{ marginTop: 4 }}>{line.why}</div>
        {noteFor ? (
          <div className="row tight" style={{ marginTop: 10 }}>
            <input type="text" value={note} placeholder={noteFor === "change" ? "What would you change?" : "What are you unsure about?"} onChange={(e) => setNote(e.target.value)} aria-label="Your note" style={{ maxWidth: 360 }} />
            <button
              type="button"
              className="btn sm primary"
              disabled={busy}
              onClick={() => {
                onReact(noteFor, note.trim() || undefined);
                setNoteFor(undefined);
              }}
            >
              Send
            </button>
          </div>
        ) : null}
      </div>
      <div className="react" role="group" aria-label={`Your reaction to ${line.category}`}>
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={feedback?.reaction === o.id}
            disabled={busy}
            onClick={() => (o.id === "love" ? onReact("love") : setNoteFor(o.id))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The client's side: their room, in plain words, with two things they can do. */
export function ClientBrief({ token, initialView, initialDeep }: { token: string; initialView: ClientView; initialDeep: DeepBrief }) {
  const [view, setView] = useState(initialView);
  const [deep, setDeep] = useState(initialDeep);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();

  const refresh = async () => {
    const r = await fetch(`/api/c/${token}`, { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { view: ClientView; deep: DeepBrief };
      setView(j.view);
      setDeep({ ...j.deep, risks: [], facts: [] });
    }
  };

  const send = async (path: string, body: unknown, thanks: string) => {
    setBusy(true);
    setErr(undefined);
    try {
      const r = await fetch(`/api/c/${token}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; changed?: string[] };
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      await refresh();
      setMsg(j.changed?.length ? `${thanks} ${j.changed.length} part${j.changed.length > 1 ? "s" : ""} of the plan updated.` : thanks);
      setTimeout(() => setMsg(undefined), 3200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const personal = view.status === "COMPLETE" || view.status === "NEEDS_CLARIFICATION";
  return (
    <div>
      <section className="client-hero">
        <div className="for">
          For {view.clientLabel} · {view.roomLabel} · {view.city}
        </div>
        <h1 style={{ fontStyle: "italic", fontWeight: 450, margin: "8px 0 12px" }}>{personal ? deep.title : `Your ${view.roomLabel.toLowerCase()}`}</h1>
        <p className="lede">{deep.summary}</p>
      </section>

      {view.dataMode === "fixture" ? (
        <div className="note" style={{ marginBottom: 16 }}>
          This is a demo built from synthetic data, not real taste research.
        </div>
      ) : null}

      <div className="card" style={{ padding: 14 }}>
        <RoomStage spec={view.spec.map((l) => ({ id: l.id, value: l.proposed }))} dims={view.dims} trade={view.trade} room={view.room} label={`Your ${view.roomLabel.toLowerCase()}, drawn from the plan`} />
        <p className="tiny muted" style={{ margin: "10px 2px 0" }}>An illustration of the plan, not a rendering of your room: it shows the light&apos;s colour, where it comes from and how it changes through the evening.</p>
      </div>

      {view.decoded.some((w) => w.meaning) ? (
        <section className="section">
          <div className="eyebrow">When you said</div>
          <div className="stack" style={{ gap: 10 }}>
            {view.decoded.map((w) => (
              <div key={w.word} className="card sunk" style={{ padding: 16 }}>
                <span className="serif" style={{ fontSize: 22, fontStyle: "italic" }}>“{w.word}”</span>
                <span className="muted"> we think you meant </span>
                <b>{w.meaning ?? "something we couldn't place"}</b>
                {w.literal && w.meaning && w.literal !== w.meaning ? <div className="small muted" style={{ marginTop: 4 }}>rather than “{w.literal}”</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view.question && !view.question.answer ? (
        <section className="section">
          <QuestionCard
            q={view.question}
            clientLabel={view.clientLabel}
            fixture={view.dataMode === "fixture"}
            canAnswer
            busy={busy}
            who="client"
            onAnswer={(a) => send("answer", { answer: a }, "Thank you.")}
          />
        </section>
      ) : null}

      <section className="section">
        <div className="panel-title">
          <div>
            <div className="eyebrow">The plan</div>
            <h2 style={{ margin: 0 }}>Line by line</h2>
          </div>
          <span className="small muted">Tell your designer what you love and what you&apos;d change.</span>
        </div>
        <div className="client-lines">
          {view.spec.map((l) => (
            <LineCard key={l.id} line={l} feedback={view.feedback[l.id]} busy={busy} onReact={(r, note) => send("react", { lineId: l.id, reaction: r, note }, "Sent to your designer.")} />
          ))}
        </div>
      </section>

      {deep.references.length ? (
        <section className="section">
          <div className="eyebrow">Places that feel like this</div>
          <div className="refs">
            {deep.references.map((r) => (
              <div key={r.entity_id} className="ref">
                <h4>{r.name}</h4>
                {r.city ? <div className="meta">{r.city}</div> : null}
                <div className="small">{r.why}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="eyebrow">Colours</div>
        <div className="swatches">
          {deep.palette.map((p) => (
            <div key={p.role} className="swatch">
              <div className="c" style={{ background: p.hex }} />
              <div className="l">
                <b>{p.name}</b>
                <span>{p.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card section">
        <div className="eyebrow">A note from your designer</div>
        <p className="quote" style={{ marginBottom: 0 }}>{deep.clientNote}</p>
      </section>

      <p className="tiny muted section">
        How this was made: your designer looked at the kinds of places that people who love the same things as you choose to spend time in (using the Qloo taste graph), compared them with what&apos;s typical in {view.city},
        and turned the difference into a plan. It describes tastes of people like you, not facts about you. Nothing you click here is shared beyond your designer.
      </p>

      {err ? <div className="err" role="alert">{err}</div> : null}
      {msg ? (
        <div className="toast" role="status">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
