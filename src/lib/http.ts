// Small helpers shared by API routes.

import { NextResponse } from "next/server";
import { getStore } from "./store";
import type { Brief } from "./types";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function loadBrief(id: string): Promise<Brief | undefined> {
  return getStore().get(id);
}

const hits = new Map<string, number[]>();

/** Per-instance sliding-window limiter so a public demo can't drain the Qloo quota. */
export function rateLimited(req: Request, limit = Number(process.env.TASTESPEC_RUNS_PER_10_MIN ?? 12)): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}
