import Link from "next/link";
import { getStore, type BriefSummary } from "@/lib/store";
import { ROOM_LABEL, TRADE_LABEL } from "@/lib/rulebooks";

export const dynamic = "force-dynamic";

function rate(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

export default async function Projects() {
  const store = getStore();
  const briefs: BriefSummary[] = await store.list(200);
  const live = briefs.filter((b) => b.dataMode === "live");
  const pool = live.length ? live : briefs;
  const decided = pool.reduce((a, b) => a + b.accepted + b.revised, 0);
  const accepted = pool.reduce((a, b) => a + b.accepted, 0);
  const lines = pool.reduce((a, b) => a + b.lines, 0);
  const diffs = pool.reduce((a, b) => a + b.literalDiffs, 0);
  const withLlm = pool.filter((b) => b.llmAgreement !== undefined);
  const llmAgree = withLlm.length ? withLlm.reduce((a, b) => a + (b.llmAgreement ?? 0), 0) / withLlm.length : undefined;
  const rated = pool.filter((b) => b.rating);
  return (
    <div>
      <div className="eyebrow">Tracking</div>
      <h1>Projects</h1>
      <p className="lede">
        Every brief, and what happened to it. The numbers that matter: how often the evidence changed the spec, how often the client accepted
        a line without revision, and how an LLM-only answer compared.
        {store.kind === "file" ? " (Stored on this server's disk; configure KV for durable storage.)" : ""}
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
        {live.length && live.length < briefs.length ? ` Figures use the ${live.length} live-data briefs only.` : ""}
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
                  <div className="small muted">{new Date(b.createdAt).toLocaleString()}{b.dataMode === "fixture" ? " · simulated" : ""}</div>
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
  );
}
