import { NextResponse } from "next/server";
import { briefs } from "@/lib/store";
import { currentOwnerHash } from "@/lib/owner";

export const dynamic = "force-dynamic";

/** Lists only the current visitor's briefs. */
export async function GET() {
  const owner = await currentOwnerHash();
  return NextResponse.json({ briefs: owner ? await briefs.list(owner, 200) : [] });
}
