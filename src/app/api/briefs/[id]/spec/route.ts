import { NextResponse } from "next/server";
import { jsonError, loadBrief } from "@/lib/http";
import { specReport } from "@/lib/spec-service";
import { buildExport, exportCsv, exportHtml, exportJson } from "@/lib/spec-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The compiled specification, its verification, and (for the owner) the revision it came from.
 * ?format=report (default, JSON for the app) | json | csv | html (print to PDF in the browser). Add &download=1 to save.
 * Read by link like the brief itself; the pasted message is only included for the owner.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const r = await specReport(brief);
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "report";
  if (format === "report") return NextResponse.json({ spec: r.spec, verification: r.verification, revision: r.revision, sensitivity: r.sensitivity, review: r.review, canEdit: r.canEdit });
  const x = buildExport(r.spec, r.verification, { revision: r.revision?.diff, sensitivity: r.sensitivity, review: r.review });
  const name = `tastespec-${r.spec.client.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v${r.spec.version}${x.documentStatus === "DRAFT_CHECKS_FAILED" ? "-DRAFT" : ""}`;
  const disposition = url.searchParams.get("download") ? `attachment; filename="${name}` : "inline";
  if (format === "json") return new NextResponse(exportJson(x), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": disposition === "inline" ? "inline" : `${disposition}.json"` } });
  if (format === "csv") return new NextResponse(exportCsv(x), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition === "inline" ? "inline" : `${disposition}.csv"` } });
  if (format === "html") return new NextResponse(exportHtml(x), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'", "Content-Disposition": disposition === "inline" ? "inline" : `${disposition}.html"` } });
  return jsonError("Unknown format.", 400);
}
