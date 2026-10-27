import { NextResponse } from "next/server";
import { llmAvailable, llmModel } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { envReport } from "@/lib/env";
import { RULEBOOK_VERSION } from "@/lib/rulebooks";

export const dynamic = "force-dynamic";

/** Configuration health. Makes no external calls and never returns secret values. */
export function GET() {
  const env = envReport();
  const store = getStore();
  const ok = env.qlooMode !== "unconfigured" && env.issues.length === 0;
  return NextResponse.json(
    {
      ok,
      qloo: env.qlooMode,
      qlooBaseUrl: env.qlooMode === "fixture" ? null : env.qlooBaseUrl,
      issues: env.issues,
      llm: llmAvailable() ? llmModel() : "off",
      store: store.kind,
      durable: store.durable,
      rulebookVersion: RULEBOOK_VERSION,
    },
    { status: ok ? 200 : 503 },
  );
}
