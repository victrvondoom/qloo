import { NextResponse } from "next/server";
import { jsonError, rateLimited, readJson } from "@/lib/http";
import { respond, sessionHash, studyStatus, type RespondBody } from "@/lib/study-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (rateLimited(req, "study-respond", 60)) return jsonError("Too many requests.", 429);
  const body = await readJson<RespondBody>(req, 2048);
  if (!body.ok) return body.res;
  if (!(await studyStatus()).enabled) return jsonError("The study is not collecting responses here.", 503);
  const session = await sessionHash(false);
  if (!session) return jsonError("Start from the consent screen so a response can be tied to your anonymous session.", 400);
  const r = await respond(session, body.value);
  if ("error" in r) return jsonError(String(r.error), r.status as number);
  return NextResponse.json(r);
}
