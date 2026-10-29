import { NextResponse } from "next/server";
import { currentOwnerHash } from "@/lib/owner";
import { briefs } from "@/lib/store";
import { tasteAxes } from "@/lib/studio";
import { DIMENSION_BY_ID } from "@/lib/dimensions";

export const dynamic = "force-dynamic";

/** The current visitor's briefs as points in a 3D taste space. Owner-scoped. */
export async function GET() {
  const owner = await currentOwnerHash();
  if (!owner) return NextResponse.json({ points: [] });
  const list = await briefs.list(owner, 120);
  const points = [];
  for (const s of list) {
    if (s.status !== "COMPLETE" && s.status !== "NEEDS_CLARIFICATION") continue;
    const b = await briefs.get(s.id);
    if (!b) continue;
    const dims = b.depth?.find((d) => d.level === 0)?.dimensions ?? b.dimensions;
    const v = Object.fromEntries(dims.map((d) => [d.id, d.score]));
    const top = [...dims].sort((x, y) => y.score - x.score)[0];
    points.push({ id: s.id, label: s.clientLabel, words: s.words, city: s.city, room: s.room, dataMode: s.dataMode, top: top ? DIMENSION_BY_ID[top.id].short : "", ...tasteAxes(v) });
  }
  return NextResponse.json({ points });
}
