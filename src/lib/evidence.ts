// Machine-checkable evidence report for a brief.
//
// Classes, per spec line:
//   evidence_supported  basis qloo_evidence, cites atmospheres with counts AND
//                       Qloo requests that exist in the ledger and succeeded
//   derived             decided by a hard constraint or by the client's answer
//   client_stated       the literal reading of the client's own words (incl. fallback)
//   unsupported         claims evidence it can't back (missing or failed refs)
//
// Source types are kept distinct throughout:
//   qloo_observed   a field present in a Qloo response (entity ids, tags, keywords, affinity)
//   qloo_aggregate  Qloo's aggregate affinity ranking (who-likes-what, not one person)
//   app_mapping     Tastespec's lexicon + rulebook (versioned)
//   llm             a model's output (counter-test, unfamiliar words, client note)
//   client          what the client or pro said

import type { Brief, LedgerEntry, SpecLine } from "./types";

export const EVIDENCE_SCHEMA_VERSION = "tastespec-evidence/1";

export type LineClass = "evidence_supported" | "derived" | "client_stated" | "unsupported";

export interface LineEvidence {
  lineId: string;
  category: string;
  value: string;
  class: LineClass;
  basis: SpecLine["basis"];
  confidence: SpecLine["confidence"];
  sources: { type: "qloo_observed" | "qloo_aggregate" | "app_mapping" | "llm" | "client"; ref: string }[];
  problems: string[];
}

export interface EvidenceReport {
  schema: string;
  briefId: string;
  dataMode: Brief["dataMode"];
  evidenceMode: Brief["evidenceMode"];
  status: Brief["status"];
  rulebookVersion: string;
  counts: Record<LineClass, number>;
  lines: LineEvidence[];
  caveat: string;
}

function ledgerBySeq(ledger: LedgerEntry[]) {
  return new Map(ledger.map((e) => [e.seq, e]));
}

export function classifyLine(line: SpecLine, ledger: Map<number, LedgerEntry>, rulebookVersion: string): LineEvidence {
  const problems: string[] = [];
  const sources: LineEvidence["sources"] = [{ type: "app_mapping", ref: rulebookVersion }];
  let cls: LineClass;
  switch (line.basis) {
    case "qloo_evidence": {
      if (!line.evidence.length) problems.push("no atmosphere evidence cited");
      if (!line.evidenceLedger.length) problems.push("no Qloo request cited");
      for (const seq of line.evidenceLedger) {
        const e = ledger.get(seq);
        if (!e) problems.push(`cited ledger entry #${seq} does not exist`);
        else if (e.kind === "qloo_call" && e.detail.ok === false) problems.push(`cited Qloo request #${seq} failed`);
        else if (e.kind === "qloo_call") sources.push({ type: "qloo_aggregate", ref: `ledger#${seq}` });
        else if (e.kind === "client_input") sources.push({ type: "client", ref: `ledger#${seq}` });
      }
      for (const ev of line.evidence) for (const id of ev.exemplarIds ?? []) sources.push({ type: "qloo_observed", ref: `entity:${id}` });
      for (const id of line.signalEntityIds) sources.push({ type: "qloo_observed", ref: `signal:${id}` });
      cls = problems.length ? "unsupported" : "evidence_supported";
      break;
    }
    case "client_answer":
    case "constraint":
      cls = "derived";
      sources.push({ type: "client", ref: line.basis === "client_answer" ? "clarifying answer" : "client words (constraint)" });
      for (const c of line.constraints) sources.push({ type: "app_mapping", ref: c });
      break;
    default:
      cls = "client_stated";
      sources.push({ type: "client", ref: "client words" });
  }
  for (const h of line.history ?? []) sources.push({ type: "client", ref: `review:${h.status}@${h.at}` });
  return { lineId: line.id, category: line.category, value: line.value, class: cls, basis: line.basis, confidence: line.confidence, sources, problems };
}

export function evidenceReport(brief: Brief): EvidenceReport {
  const map = ledgerBySeq(brief.ledger);
  const lines = brief.spec.map((l) => classifyLine(l, map, brief.rulebookVersion ?? "unknown"));
  const counts = { evidence_supported: 0, derived: 0, client_stated: 0, unsupported: 0 } as Record<LineClass, number>;
  for (const l of lines) counts[l.class]++;
  return {
    schema: EVIDENCE_SCHEMA_VERSION,
    briefId: brief.id,
    dataMode: brief.dataMode,
    evidenceMode: brief.evidenceMode,
    status: brief.status,
    rulebookVersion: brief.rulebookVersion,
    counts,
    lines,
    caveat:
      "Qloo evidence is aggregate affinity among people who like the same things. It supports a design direction; it is not a fact about this client. A verified hash chain proves the record is unchanged, not that the data is true.",
  };
}
