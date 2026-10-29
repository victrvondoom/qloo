"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { specHistory } from "@/lib/studio";
import { ROOM_LABEL } from "@/lib/rulebooks";
import type { Brief } from "@/lib/types";

/** The brief's life, read from its own ledger. */
export function HistoryPanel({ brief }: { brief: Brief }) {
  const items = useMemo(() => specHistory(brief), [brief]);
  return (
    <section className="card">
      <div className="eyebrow">Spec history · from the ledger</div>
      <ol className="history">
        {items.map((h) => (
          <li key={h.seq} className={`h-${h.kind}`}>
            <span className={`who ${h.actor}`}>{h.actor === "client" ? brief.input.clientLabel.slice(0, 1) : h.actor === "agent" ? "A" : "D"}</span>
            <div>
              <div className="small">{h.label}</div>
              <div className="tiny muted mono">
                #{h.seq} · {new Date(h.at).toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface Similar {
  id: string;
  clientLabel: string;
  project: string;
  room: Brief["input"]["room"];
  city: string;
  words: string[];
  similarity: number;
  shared: string[];
}

/** The designer's own past briefs nearest in measured taste. */
export function SimilarClients({ brief }: { brief: Brief }) {
  const [list, setList] = useState<Similar[]>();
  useEffect(() => {
    let live = true;
    fetch(`/api/briefs/${brief.id}/similar`)
      .then((r) => (r.ok ? r.json() : { similar: [] }))
      .then((j: { similar: Similar[] }) => live && setList(j.similar))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [brief.id]);
  return (
    <section className="card">
      <div className="eyebrow">Clients like this one · your past briefs</div>
      {!list ? (
        <div className="skeleton" style={{ height: 60 }} />
      ) : list.length ? (
        <div className="stack" style={{ gap: 8 }}>
          {list.map((s) => (
            <div key={s.id} className="row tight" style={{ flexWrap: "nowrap" }}>
            <Link href={`/brief/${s.id}`} className="similar grow">
              <span>
                <b>{s.clientLabel}</b>
                <span className="small muted">
                  {" "}
                  · “{s.words.join(", ")}” · {ROOM_LABEL[s.room]} · {s.city}
                </span>
                {s.shared.length ? <div className="tiny muted">both lean {s.shared.join(", ").toLowerCase()}</div> : null}
              </span>
              <span className="mono small">{Math.round(s.similarity * 100)}%</span>
            </Link>
            <Link className="btn sm ghost" href={`/compare?a=${brief.id}&b=${s.id}`} title="Merge both into one room">
              Duet
            </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>No other briefs of yours to compare yet.</p>
      )}
      <p className="tiny muted" style={{ margin: "8px 0 0" }}>Cosine similarity of measured atmospheres. Only you see this; the agent itself never reads other clients.</p>
    </section>
  );
}
