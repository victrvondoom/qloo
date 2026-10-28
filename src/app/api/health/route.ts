import { NextResponse } from "next/server";
import { llmAvailable, llmModel } from "@/lib/llm";
import { storeInfo } from "@/lib/store";
import { envReport } from "@/lib/env";
import { RULEBOOK_VERSION } from "@/lib/rulebooks";

export const dynamic = "force-dynamic";

/** Configuration health. Makes no external calls and never returns secret values or file paths. */
export async function GET() {
  const env = envReport();
  let db: { kind: string; durable: boolean; briefs: number; storedBytes: number } | { error: string };
  try {
    const i = await storeInfo();
    db = { kind: i.kind, durable: i.durable, briefs: i.briefs, storedBytes: i.storedBytes };
  } catch (err) {
    db = { error: err instanceof Error ? err.message.slice(0, 200) : "database unavailable" };
  }
  const ok = env.qlooMode !== "unconfigured" && env.issues.length === 0 && !("error" in db);
  return NextResponse.json(
    {
      ok,
      qloo: env.qlooMode,
      qlooBaseUrl: env.qlooMode === "fixture" ? null : env.qlooBaseUrl,
      issues: env.issues,
      llm: llmAvailable() ? llmModel() : "off",
      db,
      rulebookVersion: RULEBOOK_VERSION,
      node: process.versions.node,
      platform: process.platform,
    },
    { status: ok ? 200 : 503 },
  );
}
