"use client";

import { useMemo, useState } from "react";
import { edgeKey, tracePath } from "@/lib/graph";
import type { GraphColumn, GraphNode, TasteGraph } from "@/lib/types";

// The agent's only memory of this client: a graph that narrows left to right.
// Hover (or focus) any node to light the pathway it sits on; click to pin it.

const COLS: GraphColumn[] = ["said", "means", "rooms", "atmospheres", "decisions", "spec"];
const SHORT: Record<GraphColumn, string> = { said: "They said", means: "Could mean", rooms: "Rooms chosen", atmospheres: "Atmospheres", decisions: "Decisions", spec: "Spec" };
const W = 1200;
const PAD = 16;
const HEAD = 84;
const NODE_H = 36;
const GAP = 7;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const r2 = (x: number) => Math.round(x * 100) / 100;

export function NarrowingGraph({ graph, live = false, initialFocus, compact = false }: { graph: TasteGraph; live?: boolean; initialFocus?: string; compact?: boolean }) {
  const [hover, setHover] = useState<string>();
  const [pinned, setPinned] = useState<string | undefined>(initialFocus);
  const focus = hover ?? pinned;

  const layout = useMemo(() => {
    const colW = (W - PAD * 2) / COLS.length;
    const byCol = COLS.map((c) => graph.nodes.filter((n) => n.column === c));
    const tallest = Math.max(1, ...byCol.map((ns) => ns.length));
    const bodyH = tallest * (NODE_H + GAP);
    const pos = new Map<string, { x: number; y: number; w: number; node: GraphNode }>();
    byCol.forEach((ns, ci) => {
      const h = ns.length * (NODE_H + GAP);
      const top = HEAD + (bodyH - h) / 2;
      ns.forEach((node, i) => pos.set(node.id, { x: PAD + ci * colW + 8, y: top + i * (NODE_H + GAP), w: colW - 22, node }));
    });
    return { colW, pos, height: HEAD + bodyH + PAD };
  }, [graph]);

  const path = useMemo(() => (focus && layout.pos.has(focus) ? tracePath(graph, focus) : undefined), [focus, graph, layout]);

  const maxCount = compact ? 22 : 30;

  return (
    <div className="graph-wrap" onMouseLeave={() => setHover(undefined)}>
      <svg viewBox={`0 0 ${W} ${layout.height}`} role="group" aria-label="Narrowing graph: what the client said, what it could mean, the rooms their taste chooses, atmospheres, decisions and spec lines">
        {COLS.map((c, i) => {
          const col = graph.columns.find((x) => x.id === c);
          const x = PAD + i * layout.colW + 8;
          return (
            <g key={c}>
              <text x={x} y={22} className="col-title">
                {`${String(i + 1).padStart(2, "0")} ${SHORT[c]}`}
                <title>{col?.title ?? c}</title>
              </text>
              <text x={x} y={52} className="col-count">{col?.count ?? 0}</text>
              {col?.note ? (
                <text x={x + 34} y={51} className="col-title" style={{ letterSpacing: "0.04em", textTransform: "none" }}>
                  {col.note}
                </text>
              ) : null}
              {i > 0 ? <line x1={x - 14} y1={12} x2={x - 14} y2={layout.height - 8} stroke="var(--line)" strokeDasharray="2 4" /> : null}
            </g>
          );
        })}
        <g>
          {graph.edges.map((e) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + a.w;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const k = edgeKey(e);
            const on = path?.edges.has(k);
            return (
              <path
                key={k}
                className={`edge${on ? " on" : path ? " dim" : ""}`}
                d={`M${r2(x1)},${r2(y1)} C${r2(mx)},${r2(y1)} ${r2(mx)},${r2(y2)} ${r2(x2)},${r2(y2)}`}
                strokeWidth={r2(on ? 1.4 + 2 * e.weight : 0.6 + 1.6 * e.weight)}
                opacity={r2(0.25 + 0.4 * e.weight)}
                strokeDasharray={e.kind === "bounds" ? "4 3" : undefined}
              />
            );
          })}
        </g>
        {graph.nodes.map((n) => {
          const p = layout.pos.get(n.id)!;
          const on = path?.nodes.has(n.id);
          const cls = ["node", n.muted ? "muted" : "", on ? "on" : path ? "dim" : "", live ? "enter" : "" /* CSS runs the entrance once, when a node is first inserted */].filter(Boolean).join(" ");
          return (
            <g
              key={n.id}
              className={cls}
              tabIndex={0}
              role="button"
              aria-pressed={pinned === n.id}
              aria-label={`${n.label}${n.sub ? `, ${n.sub}` : ""}. Show its pathway.`}
              onMouseEnter={() => setHover(n.id)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(undefined)}
              onClick={() => setPinned((cur) => (cur === n.id ? undefined : n.id))}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setPinned((cur) => (cur === n.id ? undefined : n.id));
                }
              }}
            >
              <rect x={r2(p.x)} y={r2(p.y)} width={r2(p.w)} height={NODE_H} rx={8} />
              <rect className="bar" x={r2(p.x + 1)} y={r2(p.y + NODE_H - 3)} width={r2(Math.max(2, (p.w - 2) * Math.min(1, Math.max(0, n.weight))))} height={2} rx={1} />
              <text x={r2(p.x + 9)} y={r2(p.y + 15)}>{clip(n.label, maxCount)}</text>
              {n.sub ? (
                <text x={r2(p.x + 9)} y={r2(p.y + 28)} className="sub">
                  {clip(n.sub, maxCount + 6)}
                </text>
              ) : null}
              <title>{`${n.label}${n.sub ? ` — ${n.sub}` : ""}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The pathway of one node, as a sentence of hops (for screen readers and the side panel). */
export function pathwayText(graph: TasteGraph, nodeId: string): string[] {
  const p = tracePath(graph, nodeId);
  return COLS.map((c) =>
    graph.nodes
      .filter((n) => n.column === c && p.nodes.has(n.id) && !n.muted)
      .slice(0, 4)
      .map((n) => n.label)
      .join(", "),
  ).filter(Boolean);
}
