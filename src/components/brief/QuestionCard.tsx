"use client";

import { DIMENSION_BY_ID } from "@/lib/dimensions";
import type { DimensionId } from "@/lib/types";

export interface QuestionLike {
  prompt: string;
  optionA: { name: string; carries?: DimensionId };
  optionB: { name: string; carries?: DimensionId };
  answer?: "A" | "B" | "neither";
  expectedChange?: number;
  entropyBits?: number;
}

/** The one question the agent decided was worth asking: two real places from the client's taste neighbourhood. */
export function QuestionCard({ q, clientLabel, fixture, canAnswer, busy, onAnswer, who = "designer" }: { q?: QuestionLike; clientLabel: string; fixture: boolean; canAnswer: boolean; busy: boolean; onAnswer: (a: "A" | "B" | "neither") => void; who?: "designer" | "client" }) {
  if (!q) return null;
  if (q.answer) {
    const chosen = q.answer === "A" ? q.optionA : q.answer === "B" ? q.optionB : undefined;
    const other = q.answer === "A" ? q.optionB : q.optionA;
    return (
      <div className="card sunk">
        <div className="eyebrow">Answered</div>
        <p style={{ margin: 0 }}>
          {chosen ? (
            <>
              {clientLabel} chose <b>{chosen.name}</b> over {other.name}
              {chosen.carries ? `: the spec now leans ${DIMENSION_BY_ID[chosen.carries].short.toLowerCase()}` : ""}.
            </>
          ) : (
            "Neither: the spec stays with the evidence alone."
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ borderColor: "var(--amber)", boxShadow: "0 0 0 4px var(--amber-glow)" }}>
      <div className="eyebrow amber">{who === "client" || q.expectedChange === undefined ? "One quick question" : `One question · about ${q.expectedChange.toFixed(1)} lines depend on it`}</div>
      <h3 style={{ fontSize: 22 }}>{q.prompt}</h3>
      <div className="choice">
        {(["A", "B"] as const).map((k) => {
          const o = k === "A" ? q.optionA : q.optionB;
          return (
            <button key={k} type="button" disabled={busy || !canAnswer} onClick={() => onAnswer(k)}>
              <b>{o.name}</b>
              {who === "designer" && o.carries ? <span className="small muted">reads as {DIMENSION_BY_ID[o.carries].short.toLowerCase()}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <button type="button" className="btn sm ghost" disabled={busy || !canAnswer} onClick={() => onAnswer("neither")}>
          Neither / don&apos;t know them
        </button>
        {who === "designer" ? (
          <span className="small muted">
            Both are {fixture ? "fictional demo places" : "places Qloo ranks highly for this taste"}. The agent simulated both answers first; evidence alone can&apos;t call it
            {q.entropyBits !== undefined ? ` (${q.entropyBits.toFixed(2)} bits)` : ""}.
          </span>
        ) : null}
      </div>
    </div>
  );
}
