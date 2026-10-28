import Link from "next/link";
import type { Metadata } from "next";
import { Composer } from "@/components/Composer";
import { briefs } from "@/lib/store";
import { currentOwnerHash } from "@/lib/owner";
import { envReport } from "@/lib/env";
import { llmAvailable } from "@/lib/llm";
import { ROOM_LABEL } from "@/lib/rulebooks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace" };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export default async function Workspace({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const owner = await currentOwnerHash();
  const list = owner ? await briefs.list(owner, 60) : [];
  const env = envReport();
  return (
    <main id="main">
      <div className="wrap workspace">
        <aside className="rail" aria-label="Your briefs">
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="eyebrow" style={{ margin: 0 }}>
              Your briefs · {list.length}
            </div>
            {list.length ? (
              <Link href="/projects" className="small">
                Tracking →
              </Link>
            ) : null}
          </div>
          {list.length ? (
            <div className="list">
              {list.map((b) => (
                <Link key={b.id} href={`/brief/${b.id}`} className="item">
                  <span className="t">
                    <span>
                      {b.clientLabel}
                      {b.project ? <span className="muted"> · {b.project}</span> : null}
                    </span>
                    <span
                      className={`status-dot ${b.status === "NEEDS_CLARIFICATION" && !b.answered ? "ask" : b.status === "COMPLETE" || b.status === "NEEDS_CLARIFICATION" ? "ok" : "off"}`}
                      title={b.status.replace(/_/g, " ").toLowerCase()}
                    />
                  </span>
                  <span className="s">
                    “{b.words.join(", ")}” · {ROOM_LABEL[b.room]} · {b.city}
                  </span>
                  <span className="s">
                    {ago(b.createdAt)}
                    {b.dataMode === "fixture" ? " · demo data" : ""}
                    {b.shared ? " · shared" : ""}
                    {b.accepted + b.revised ? ` · ${b.accepted + b.revised}/${b.lines} decided` : ""}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card sunk small muted">Briefs you build in this browser appear here. Nobody else can list them.</div>
          )}
        </aside>
        <section>
          <div className="eyebrow amber">New brief</div>
          <h1 style={{ fontSize: "clamp(30px, 4vw, 48px)", maxWidth: 760 }}>Paste what your client wrote.</h1>
          <p className="lede" style={{ marginBottom: 20 }}>
            Tastespec pulls out the words they used and the things they love, asks Qloo where people with that taste actually spend their evenings, and turns “warm and modern” into
            a spec, a drawn room and a link for the client. You check the draft; one button does the rest.
          </p>
          <Composer llm={llmAvailable()} canRun={env.qlooMode !== "unconfigured"} initialText={typeof m === "string" ? m.slice(0, 3000) : ""} />
        </section>
      </div>
    </main>
  );
}
