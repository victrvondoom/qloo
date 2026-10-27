import { NextResponse } from "next/server";
import { llmAvailable, llmModel } from "@/lib/llm";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const fixture = process.env.QLOO_MODE === "fixture";
  return NextResponse.json({
    qloo: fixture ? "fixture (synthetic data)" : process.env.QLOO_API_KEY ? "live" : "missing key",
    qlooBaseUrl: fixture ? null : process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com",
    llm: llmAvailable() ? llmModel() : "off",
    store: getStore().kind,
  });
}
