"use client";

import type { StepState } from "./useAgentStream";

export function Timeline({ steps, running }: { steps: StepState[]; running: boolean }) {
  if (!steps.length && !running) return null;
  return (
    <ol className="timeline" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id}>
          <span className={`dot ${s.status}`} aria-hidden />
          <div>
            <div style={{ fontWeight: s.status === "decision" ? 600 : 500 }}>
              {s.status === "decision" ? "Decision: " : ""}
              {s.label}
            </div>
            {s.detail ? <div className="muted small">{s.detail}</div> : null}
          </div>
        </li>
      ))}
      {running && !steps.length ? (
        <li>
          <span className="dot running" aria-hidden />
          <div>Starting…</div>
        </li>
      ) : null}
    </ol>
  );
}
