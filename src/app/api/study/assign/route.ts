import { NextResponse } from "next/server";
import { jsonError, rateLimited, readJson } from "@/lib/http";
import { assign, sessionHash, studyStatus } from "@/lib/study-store";

export const dynamic = "force-dynamic";

/** Blinded assignment for one case. Requires explicit consent; creates an anonymous session cookie. */
export async function POST(req: Request) {
  if (rateLimited(req, "study", 120)) return jsonError("Too many requests.", 429);
  const body = await readJson<{ caseId?: string; consent?: boolean }>(req, 1024);
  if (!body.ok) return body.res;
  if (body.value.consent !== true) return jsonError("Please read and accept the consent notice first.", 400);
  if (typeof body.value.caseId !== "string") return jsonError("Missing case.", 400);
  const status = await studyStatus();
  if (!status.enabled) return jsonError(status.reason ?? "The study is not collecting responses here.", 503);
  const session = (await sessionHash(true))!;
  const r = await assign(session, body.value.caseId);
  if ("error" in r) return jsonError(String(r.error), r.status as number);
  return NextResponse.json(r);
}
