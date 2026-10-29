import { NextResponse } from "next/server";
import { jsonError, loadBrief } from "@/lib/http";
import { fixtureScheduleCsv, specJson } from "@/lib/studio";

export const dynamic = "force-dynamic";

/** Fixture schedule (CSV) or structured spec (JSON) for an electrician or a lighting-design tool. Read-only, like the bundle. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const format = new URL(req.url).searchParams.get("format") ?? "csv";
  const base = `tastespec-${brief.input.clientLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${brief.id.slice(2, 8)}`;
  if (format === "json") {
    return new NextResponse(JSON.stringify(specJson(brief), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${base}-spec.json"` } });
  }
  if (format !== "csv") return jsonError("format must be csv or json.");
  return new NextResponse(fixtureScheduleCsv(brief), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-fixture-schedule.csv"` } });
}
