import { NextResponse } from "next/server";
import { jsonError, rateLimited, readJson } from "@/lib/http";
import { sessionHash, withdraw } from "@/lib/study-store";

export const dynamic = "force-dynamic";

/** Withdraw: delete this browser's responses, or those behind a withdraw code. */
export async function DELETE(req: Request) {
  if (rateLimited(req, "study-withdraw", 30)) return jsonError("Too many requests.", 429);
  const body = await readJson<{ code?: string }>(req, 256);
  const code = body.ok && typeof body.value.code === "string" ? body.value.code.trim().toLowerCase() : undefined;
  const deleted = await withdraw(await sessionHash(false), code);
  return NextResponse.json({ deleted });
}
