import type { Brief, LineBasis } from "@/lib/types";

/** Data provenance badges. LIVE is shown only for real Qloo data with complete evidence. */
export function ModeBadges({ brief }: { brief: Pick<Brief, "dataMode" | "evidenceMode" | "status"> }) {
  const fallback = brief.status === "UPSTREAM_UNAVAILABLE" || brief.status === "INSUFFICIENT_EVIDENCE";
  return (
    <span className="row" style={{ gap: 6, display: "inline-flex" }}>
      {brief.dataMode === "fixture" ? (
        <span className="pill low" title="Synthetic fixture data, not Qloo">FIXTURE · synthetic</span>
      ) : brief.evidenceMode === "degraded" || fallback ? (
        <span className="pill bad" title="Some Qloo evidence was unavailable">LIVE · DEGRADED</span>
      ) : (
        <span className="pill high" title="Evidence came from the Qloo API">LIVE · Qloo</span>
      )}
      {brief.status && brief.status !== "COMPLETE" ? <span className="pill medium">{brief.status.replace(/_/g, " ").toLowerCase()}</span> : null}
    </span>
  );
}

export const BASIS_LABEL: Record<LineBasis, { label: string; tone: string; help: string }> = {
  qloo_evidence: { label: "Qloo evidence", tone: "high", help: "Moved or confirmed by measured lift in Qloo place data." },
  client_words: { label: "Client's words", tone: "medium", help: "The literal reading of what the client said; the evidence didn't decide it." },
  client_answer: { label: "Client's answer", tone: "high", help: "Decided by the client's answer to the clarifying question." },
  constraint: { label: "Hard constraint", tone: "medium", help: "Bounded by a rule, e.g. no light cooler than 3000K for a client who asked for warm." },
  literal_fallback: { label: "Literal fallback", tone: "bad", help: "No usable Qloo evidence, so the literal reading is used with no personalisation." },
};

export function BasisPill({ basis }: { basis: LineBasis }) {
  const b = BASIS_LABEL[basis] ?? BASIS_LABEL.client_words;
  return (
    <span className={`pill ${b.tone}`} title={b.help}>
      {b.label}
    </span>
  );
}
