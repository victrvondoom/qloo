"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent, Brief, BriefInput, TasteGraph } from "@/lib/types";

export interface StepState {
  id: string;
  label: string;
  status: "running" | "done" | "warn" | "error" | "decision";
  detail?: string;
}

/** POST /api/run and fold the NDJSON event stream into timeline and graph state. cancel() aborts the request (and the server-side run). */
export function useAgentStream() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [brief, setBrief] = useState<Brief | undefined>();
  const [graph, setGraph] = useState<TasteGraph | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => controller.current?.abort(), []);

  const run = useCallback(async (input: BriefInput): Promise<Brief | undefined> => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setSteps([]);
    setGraph(undefined);
    setBrief(undefined);
    setError(undefined);
    setRunning(true);
    let result: Brief | undefined;
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ac.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let decisionN = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as AgentEvent;
          if (e.type === "step") {
            setSteps((prev) => {
              const i = prev.findIndex((s) => s.id === e.id);
              const next: StepState = { id: e.id, label: e.label, status: e.status, detail: e.detail };
              return i >= 0 ? prev.map((s, j) => (j === i ? next : s)) : [...prev, next];
            });
          } else if (e.type === "decision") {
            const id = `decision-${decisionN++}`;
            setSteps((prev) => [...prev, { id, label: e.label, status: "decision", detail: e.detail }]);
          } else if (e.type === "graph") {
            setGraph(e.graph);
          } else if (e.type === "brief") {
            result = e.brief;
            setBrief(e.brief);
          } else if (e.type === "error") {
            throw new Error(e.state && e.state !== "FAILED" ? `${e.state}: ${e.message}` : e.message);
          }
        }
      }
      if (!result) throw new Error("The run ended without a brief.");
    } catch (err) {
      const aborted = ac.signal.aborted;
      setError(aborted ? "Cancelled." : err instanceof Error ? err.message : String(err));
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
    } finally {
      if (controller.current === ac) controller.current = null;
      setRunning(false);
    }
    return result;
  }, []);

  return { steps, graph, brief, error, running, run, cancel };
}
