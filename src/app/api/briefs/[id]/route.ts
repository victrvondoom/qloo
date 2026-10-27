import { NextResponse } from "next/server";
import { jsonError, loadBrief } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  return brief ? NextResponse.json({ brief }) : jsonError("Brief not found.", 404);
}
