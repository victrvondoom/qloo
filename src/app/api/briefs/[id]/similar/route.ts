import { NextResponse } from "next/server";
import { loadOwnedBrief } from "@/lib/http";
import { briefs } from "@/lib/store";
import { similarity } from "@/lib/studio";
import { DIMENSION_BY_ID } from "@/lib/dimensions";

export const dynamic = "force-dynamic";

/**
 * "Clients like this one": the owner's own past briefs nearest in measured taste
 * (cosine over atmosphere scores). Owner only; the agent itself never reads these.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadOwnedBrief((await params).id);
  if (!r.ok) return r.res;
  const base = r.brief.depth?.find((d) => d.level === 0)?.dimensions ?? r.brief.dimensions;
  const list = (await briefs.list(r.owner, 80)).filter((s) => s.id !== r.brief.id && (s.status === "COMPLETE" || s.status === "NEEDS_CLARIFICATION"));
  const scored = [];
  for (const s of list) {
    const other = await briefs.get(s.id);
    if (!other) continue;
    const dims = other.depth?.find((d) => d.level === 0)?.dimensions ?? other.dimensions;
    const shared = [...base].sort((a, b) => b.score - a.score).slice(0, 3).filter((d) => d.score > 0.2 && (dims.find((x) => x.id === d.id)?.score ?? 0) > 0.2).map((d) => DIMENSION_BY_ID[d.id].short);
    scored.push({ id: s.id, clientLabel: s.clientLabel, project: s.project, room: s.room, city: s.city, words: s.words, createdAt: s.createdAt, similarity: similarity(base, dims), shared });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return NextResponse.json({ similar: scored.slice(0, 4), considered: scored.length });
}
