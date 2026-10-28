import Link from "next/link";
import { briefs as store, type BriefSummary } from "@/lib/store";
import { currentOwnerHash } from "@/lib/owner";
import { ROOM_LABEL, TRADE_LABEL } from "@/lib/rulebooks";

export const dynamic = "force-dynamic";

function rate(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

export default async function Projects() {
  const owner = await currentOwnerHash();
  // Only this browser's briefs: no visitor can list another's.
  const briefs: BriefSummary[] = owner ? await store.list(owner, 200) : [];
  // Metrics only count briefs with complete live evidence; fixture and fallback briefs are listed but excluded.
  const live = briefs.filter((b) => b.dataMode === "live" && b.status !== "UPSTREAM_UNAVAILABLE" && b.status !== "INSUFFICIENT_EVIDENCE");
  const pool = live.length ? live : briefs.filter((b) => b.status !== "UPSTREAM_UNAVAILABLE" && b.status !== "INSUFFICIENT_EVIDENCE");
  const decided = pool.reduce((a, b) => a + b.accepted + b.revised, 0);
  const accepted = pool.reduce((a, b) => a + b.accepted, 0);
  const lines = pool.reduce((a, b) => a + b.lines, 0);
  const diffs = pool.reduce((a, b) => a + b.literalDiffs, 0);
  const withLlm = pool.filter((b) => b.llmAgreement !== undefined);
  const llmAgree = withLlm.length ? withLlm.reduce((a, b) => a + (b.llmAgreement ?? 0), 0) / withLlm.length : undefined;
  const rated = pool.filter((b) => b.rating);
  return (
    <main id="main">
      <div className="wrap">
    <div>
      <div className="eyebrow">Tracking</div>
      <h1>Projects</h1>
      <p className="lede">
        Every brief, and what happened to it. The numbers that matter: how often the evidence changed the spec, how often the client accepted
        a line without revision, and how an LLM-only answer compared.
        {" "}Only briefs created in this browser are listed.
      </p>
      <div className="grid3 section">
        <div className="card">
          <div className="eyebrow">Lines changed by evidence</div>
          <div className="stat">{rate(diffs, lines)}</div>
          <div className="small muted">{diffs} of {lines} lines differ from the literal reading of the client&apos;s words</div>
        </div>
        <div className="card">
          <div className="eyebrow">Accepted without revision</div>
          <div className="stat">{rate(accepted, decided)}</div>
          <div className="small muted">{accepted} of {decided} decided lines</div>
        </div>
        <div className="card">
          <div className="eyebrow">LLM-only agreement</div>
          <div className="stat">{llmAgree === undefined ? "—" : `${Math.round(llmAgree * 100)}%`}</div>
          <div className="small muted">mean, over {withLlm.length} briefs with the counter-test</div>
        </div>
      </div>
      <p className="small muted">
        {rated.length ? `Average outcome rating ${(rated.reduce((a, b) => a + (b.rating ?? 0), 0) / rated.length).toFixed(1)}/5 over ${rated.length} briefs.` : "No outcome ratings yet."}
        {live.length ? ` Figures use the ${live.length} briefs with complete live Qloo evidence.` : briefs.length ? " No live-evidence briefs yet: figures shown are from fixture (synthetic) runs." : ""}
        {" "}Briefs that fell back to the literal reading are listed but excluded from the figures.
      </p>
      <section className="card section scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Job</th>
              <th>Words</th>
              <th>Changed</th>
              <th>Decided</th>
              <th>Question</th>
              <th>LLM agrees</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {briefs.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link href={`/brief/${b.id}`}>{b.clientLabel}</Link>
                  <div className="small muted">
                    {new Date(b.createdAt).toLocaleString()}
                    {b.dataMode === "fixture" ? " · FIXTURE" : " · LIVE"}
                    {b.evidenceMode === "degraded" ? " · DEGRADED" : ""}
                    {b.status && b.status !== "COMPLETE" ? ` · ${b.status.replace(/_/g, " ").toLowerCase()}` : ""}
                  </div>
                </td>
                <td className="small">{TRADE_LABEL[b.trade]} · {ROOM_LABEL[b.room]} · {b.city}</td>
                <td className="small"><em>{b.words.join(", ")}</em></td>
                <td>{b.literalDiffs}/{b.lines}</td>
                <td>{b.accepted + b.revised}/{b.lines}</td>
                <td className="small">{b.asked ? (b.answered ? "answered" : "pending") : "not needed"}</td>
                <td>{b.llmAgreement === undefined ? "—" : `${Math.round(b.llmAgreement * 100)}%`}</td>
                <td>{b.rating ?? "—"}</td>
              </tr>
            ))}
            {!briefs.length ? (
              <tr>
                <td colSpan={8} className="muted">No briefs yet. <Link href="/">Build one</Link>.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
      </div>
    </main>
  );
}
