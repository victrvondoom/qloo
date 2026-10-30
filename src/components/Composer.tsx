"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EXAMPLES } from "./examples";
import { RunTheater } from "./RunTheater";
import { useAgentStream } from "./useAgentStream";
import { rangeLabel } from "@/lib/constraints";
import { parseIntakeHeuristic, type IntakeDraft } from "@/lib/intake";
import { ROOM_LABEL, TRADE_LABEL } from "@/lib/rulebooks";
import type { BriefInput, RoomType, Trade } from "@/lib/types";

type Overrides = Partial<Pick<BriefInput, "clientLabel" | "city" | "room" | "trade" | "words" | "loves" | "project">>;

function ChipsInput({ values, onChange, placeholder, label, italic = false }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; label: string; italic?: boolean }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...values, ...parts.filter((p) => !values.includes(p))]);
    setText("");
  };
  return (
    <div className="chips-edit" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      {values.map((v) => (
        <span key={v} className={`chip${italic ? " word" : ""}`}>
          {italic ? `“${v}”` : v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-label={label}
        value={text}
        placeholder={values.length ? "" : placeholder}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
    </div>
  );
}

/**
 * One message in, one action out. The draft fills in as you type (parsed in the
 * browser, nothing sent anywhere); every field stays editable; "Build the brief"
 * is the only step. With a model key on the server, "Read with Claude" tidies
 * the draft, and anything it adds that isn't in the message is dropped.
 */
export function Composer({ llm, canRun, initialText = "" }: { llm: boolean; canRun: boolean; initialText?: string }) {
  const router = useRouter();
  const stream = useAgentStream();
  const [text, setText] = useState(initialText);
  const [over, setOver] = useState<Overrides>({});
  const [model, setModel] = useState<{ draft: IntakeDraft; dropped: string[] } | undefined>();
  const [reading, setReading] = useState(false);
  const [readErr, setReadErr] = useState<string>();

  const parsed = useMemo(() => (text.trim().length >= 8 ? parseIntakeHeuristic(text) : undefined), [text]);
  const base = model?.draft ?? parsed;
  const input: BriefInput = {
    clientLabel: over.clientLabel ?? base?.clientLabel ?? "Client",
    city: over.city ?? base?.city ?? "",
    room: over.room ?? base?.room ?? "living_room",
    trade: over.trade ?? base?.trade ?? "lighting",
    words: over.words ?? base?.words ?? [],
    loves: over.loves ?? base?.loves ?? [],
    project: over.project,
    cctRange: base?.cctRange,
  };
  const problems = [
    ...(input.city ? [] : ["a city"]),
    ...(input.words.length ? [] : ["at least one of their words"]),
    ...(input.loves.length >= 2 ? [] : ["two or more things they love"]),
  ];
  const ready = problems.length === 0 && canRun && !stream.running;

  const loadExample = (t: string) => {
    setText(t);
    setOver({});
    setModel(undefined);
  };

  const readWithClaude = async () => {
    setReading(true);
    setReadErr(undefined);
    try {
      const res = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = (await res.json()) as { draft?: IntakeDraft; dropped?: string[]; error?: string; note?: string };
      if (!res.ok || !j.draft) throw new Error(j.error ?? "Couldn't read the message.");
      setModel({ draft: j.draft, dropped: j.dropped ?? [] });
      setOver({});
      if (j.note) setReadErr(j.note);
    } catch (e) {
      setReadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  };

  const build = async () => {
    const brief = await stream.run({ ...input, sourceText: text || undefined });
    if (brief) router.push(`/brief/${brief.id}`);
  };

  if (stream.running || stream.steps.length || stream.error) {
    return <RunTheater input={input} stream={stream} onBack={() => stream.cancel()} onRetry={build} />;
  }

  return (
    <div className="stack">
      <div className="composer">
        <label htmlFor="client-message" className="sr-only">
          The client&apos;s message
        </label>
        <textarea
          id="client-message"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setModel(undefined);
          }}
          placeholder="Paste what your client wrote: an email, a DM, notes from the first call. “We want the living room warm and modern… we love Khruangbin and The Bear…”"
          autoFocus
        />
        <div className="bar">
          <span className="hint">Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e.key} type="button" className="btn sm ghost" title={e.blurb} onClick={() => loadExample(e.text)}>
              {e.label}
            </button>
          ))}
          <span className="spacer grow" />
          {llm && text.trim().length >= 8 ? (
            <button type="button" className="btn sm" onClick={readWithClaude} disabled={reading}>
              {reading ? "Reading…" : model ? "Read again with Claude" : "Read with Claude"}
            </button>
          ) : null}
        </div>
      </div>

      {base ? (
        <div className="card">
          <div className="panel-title">
            <div>
              <div className="eyebrow amber">The brief, as read from the message</div>
              <h3 style={{ margin: 0 }}>Check it, then build</h3>
            </div>
            <span className="pill plain">{model ? "read by Claude · grounded in the message" : "read in your browser · nothing sent"}</span>
          </div>
          <div className="draft">
            <div className="line">
              <label htmlFor="d-client">Client</label>
              <div className="row tight">
                <input id="d-client" type="text" value={input.clientLabel} onChange={(e) => setOver({ ...over, clientLabel: e.target.value })} style={{ maxWidth: 220 }} />
                <input aria-label="Project or job name (optional)" type="text" value={over.project ?? ""} placeholder="Project (optional)" onChange={(e) => setOver({ ...over, project: e.target.value || undefined })} style={{ maxWidth: 260 }} />
              </div>
            </div>
            <div className="line">
              <label>They said</label>
              <ChipsInput label="Their words" values={input.words} onChange={(words) => setOver({ ...over, words })} placeholder="warm, modern…" italic />
            </div>
            <div className="line">
              <label>They love</label>
              <ChipsInput label="Things they love" values={input.loves} onChange={(loves) => setOver({ ...over, loves })} placeholder="Bands, shows, films, brands, places…" />
            </div>
            {input.cctRange ? (
              <div className="line">
                <label>Hard limit</label>
                <span className="chip">
                  Light: {rangeLabel(input.cctRange)} <span className="tiny muted">· written in their message; outranks the evidence</span>
                </span>
              </div>
            ) : null}
            <div className="line">
              <label htmlFor="d-city">Where</label>
              <div className="row tight">
                <input id="d-city" type="text" value={input.city} placeholder="City" onChange={(e) => setOver({ ...over, city: e.target.value })} style={{ maxWidth: 190 }} />
                <select aria-label="Room" value={input.room} onChange={(e) => setOver({ ...over, room: e.target.value as RoomType })} style={{ maxWidth: 210 }}>
                  {Object.entries(ROOM_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select aria-label="Trade" value={input.trade} onChange={(e) => setOver({ ...over, trade: e.target.value as Trade })} style={{ maxWidth: 190 }}>
                  {Object.entries(TRADE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {model?.dropped.length ? (
            <p className="small muted" style={{ marginTop: 12 }}>
              Dropped from Claude&apos;s reading because the message doesn&apos;t say it: {model.dropped.join("; ")}.
            </p>
          ) : null}
          {readErr ? <div className="note" style={{ marginTop: 12 }}>{readErr}</div> : null}
          <div className="divider" />
          <div className="row between">
            <span className="small muted">
              {problems.length ? `Still needs ${problems.join(", ")}.` : `About 10 Qloo calls; usually under 20 seconds.`}
              {!canRun ? " This server can't run briefs (Qloo isn't configured)." : ""}
            </span>
            <button type="button" className="btn primary lg" disabled={!ready} onClick={build}>
              Build the brief <span className="arrow">→</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid2">
          {EXAMPLES.slice(0, 2).map((e) => (
            <button key={e.key} type="button" className="card" style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => loadExample(e.text)}>
              <div className="eyebrow">Example · {e.label}</div>
              <p className="serif" style={{ fontSize: 17, margin: "6px 0 8px", fontStyle: "italic" }}>
                “{e.text.split("\n")[0].slice(0, 150)}…”
              </p>
              <span className="small muted">{e.blurb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
