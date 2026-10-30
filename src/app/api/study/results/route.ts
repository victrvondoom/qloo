import { NextResponse } from "next/server";
import { results } from "@/lib/study-store";

export const dynamic = "force-dynamic";

/** Aggregates only: counts, shares and intervals. No individual rows. */
export async function GET() {
  return NextResponse.json({ kind: "HUMAN study aggregates", ...(await results()) });
}
