// Small helpers shared by API routes.

import { NextResponse } from "next/server";
import { getStore } from "./store";
import { currentOwnerHash, isOwner } from "./owner";
import type { Brief } from "./types";

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function requestId(req: Request): string {
  return req.headers.get("x-vercel-id") ?? req.headers.get("x-request-id") ?? crypto.randomUUID();
}

/** Parse a JSON body with a hard size cap (default 16 KB). */
export async function readJson<T>(req: Request, maxBytes = 16_384): Promise<{ ok: true; value: T } | { ok: false; res: Response }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return { ok: false, res: jsonError("Request body too large.", 413) };
  const text = await req.text();
  if (text.length > maxBytes) return { ok: false, res: jsonError("Request body too large.", 413) };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, res: jsonError("Body must be JSON.") };
  }
}

export async function loadBrief(id: string): Promise<Brief | undefined> {
  return getStore().get(id);
}

/** Load a brief the current visitor owns, or an error response. */
export async function loadOwnedBrief(id: string): Promise<{ ok: true; brief: Brief; owner: string } | { ok: false; res: Response }> {
  const brief = await loadBrief(id);
  if (!brief) return { ok: false, res: jsonError("Brief not found.", 404) };
  const owner = await currentOwnerHash();
  if (!isOwner(brief.ownerHash, owner)) return { ok: false, res: jsonError("Only the designer who created this brief can change it.", 403) };
  return { ok: true, brief, owner: owner! };
}

const hits = new Map<string, number[]>();

/** Per-instance sliding-window limiter so a public demo can't drain the Qloo quota. */
export function rateLimited(req: Request, bucket: string, limit: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value!);
  return false;
}

export const RUN_LIMIT = Number(process.env.TASTESPEC_RUNS_PER_10_MIN ?? 12);
export const WRITE_LIMIT = 120;
