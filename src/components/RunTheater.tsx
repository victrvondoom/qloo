"use client";

import { NarrowingGraph } from "./NarrowingGraph";
import { Timeline } from "./Timeline";
import type { useAgentStream } from "./useAgentStream";
import { buildTasteGraph } from "@/lib/graph";
import type { BriefInput } from "@/lib/types";

/** The run, watched: the agent's graph narrows column by column while each step reports what it decided. */
export function RunTheater({ input, stream, onBack, onRetry }: { input: BriefInput; stream: ReturnType<typeof useAgentStream>; onBack: () => void; onRetry: () => void }) {
  const graph = stream.graph ?? buildTasteGraph({ input });
  const done = Boolean(stream.brief);
  return (
    <div className="theater">
      <div className="card" style={{ padding: 18 }}>
        <div className="panel-title">
          <div>
            <div className="eyebrow amber">
              {done ? "Done · opening the brief" : stream.error ? "Stopped" : (
                <>
                  <span className="live-dot" style={{ marginRight: 8 }} />
                  Reading {input.clientLabel}&apos;s taste
                </>
              )}
            </div>
            <h3 style={{ margin: 0 }}>
              {input.words.map((w) => `“${w}”`).join(" and ")} · {input.city}
            </h3>
          </div>
          <span className="small muted">The agent keeps no memory between clients: everything it knows about {input.clientLabel} is on this graph.</span>
        </div>
        <NarrowingGraph graph={graph} live compact />
      </div>
      <aside className="card" aria-live="polite">
        <div className="eyebrow">What the agent is doing</div>
        <Timeline steps={stream.steps} running={stream.running} />
        {stream.error ? (
          <>
            <div className="err" style={{ marginTop: 12 }}>{stream.error}</div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn sm primary" onClick={onRetry}>Try again</button>
              <button type="button" className="btn sm" onClick={() => location.reload()}>Edit the brief</button>
            </div>
          </>
        ) : stream.running ? (
          <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={onBack}>
            Cancel
          </button>
        ) : null}
      </aside>
    </div>
  );
}
