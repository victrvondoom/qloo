"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRESETS } from "./presets";
import { Timeline } from "./Timeline";
import { useAgentStream } from "./useAgentStream";
import { ROOM_LABEL, TRADE_LABEL } from "@/lib/rulebooks";
import type { BriefInput, RoomType, Trade } from "@/lib/types";

export function BriefForm() {
  const router = useRouter();
  const { steps, error, running, run } = useAgentStream();
  const [form, setForm] = useState<BriefInput>(PRESETS[0].input);
  const [wordsText, setWordsText] = useState(PRESETS[0].input.words.join(", "));
  const [lovesText, setLovesText] = useState(PRESETS[0].input.loves.join("\n"));

  const load = (input: BriefInput) => {
    setForm(input);
    setWordsText(input.words.join(", "));
    setLovesText(input.loves.join("\n"));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: BriefInput = {
      ...form,
      words: wordsText.split(",").map((w) => w.trim()).filter(Boolean),
      loves: lovesText.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    const brief = await run(input);
    if (brief) router.push(`/brief/${brief.id}`);
  };

  return (
    <div className="grid2" style={{ alignItems: "start" }}>
      <form className="card" onSubmit={submit}>
        <div className="eyebrow">New client brief</div>
        <div className="row" style={{ marginBottom: 14 }}>
          {PRESETS.map((p) => (
            <button type="button" key={p.key} className="btn sm" onClick={() => load(p.input)} title={p.blurb}>
              {p.title}
            </button>
          ))}
        </div>
        <div className="grid2" style={{ gap: 12 }}>
          <label className="field">
            <span>Client</span>
            <input type="text" value={form.clientLabel} onChange={(e) => setForm({ ...form, clientLabel: e.target.value })} />
          </label>
          <label className="field">
            <span>City</span>
            <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Chicago" />
          </label>
          <label className="field">
            <span>Trade</span>
            <select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value as Trade })}>
              {Object.entries(TRADE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Room</span>
            <select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value as RoomType })}>
              {Object.entries(ROOM_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Their words, as they said them</span>
          <input type="text" value={wordsText} onChange={(e) => setWordsText(e.target.value)} placeholder="warm, modern" />
        </label>
        <label className="field">
          <span>Things they love, one per line, any category. A hint in brackets helps: “The Bear (show)”.</span>
          <textarea value={lovesText} onChange={(e) => setLovesText(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn primary" type="submit" disabled={running}>
            {running ? "Working…" : "Build the brief"}
          </button>
          <span className="muted small">About 10 Qloo calls. Takes 10–30 seconds.</span>
        </div>
      </form>
      <div className="card" style={{ minHeight: 200 }}>
        <div className="eyebrow">What the agent is doing</div>
        {!steps.length && !running && !error ? (
          <p className="muted">
            Each step appears here as it happens: resolving the client&apos;s loves in Qloo, pulling the places their taste community
            chooses, comparing them with what&apos;s typical in their city, decoding their words, and deciding whether one question
            would change the spec.
          </p>
        ) : null}
        <Timeline steps={steps} running={running} />
        {error ? <div className="err" style={{ marginTop: 12 }}>{error}</div> : null}
      </div>
    </div>
  );
}
