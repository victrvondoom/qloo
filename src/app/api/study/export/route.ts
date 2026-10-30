import { NextResponse } from "next/server";
import { allResponses } from "@/lib/study-store";

export const dynamic = "force-dynamic";

/**
 * Anonymous per-response export for the study owner. Off unless STUDY_ADMIN_TOKEN is set;
 * then it needs `Authorization: Bearer <token>`. Rows carry no session id, name or IP.
 */
export async function GET(req: Request) {
  const token = process.env.STUDY_ADMIN_TOKEN;
  if (!token) return NextResponse.json({ error: "Export is disabled: set STUDY_ADMIN_TOKEN on the server." }, { status: 404 });
  if (req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rows = await allResponses();
  const format = new URL(req.url).searchParams.get("format");
  if (format === "csv") {
    const cols = ["case_id", "case_version", "data_mode", "left_system", "right_system", "reflects", "designer", "clarity", "constraints", "confidence"] as const;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => String(r[c])).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tastespec-study-responses.csv"' } });
  }
  return NextResponse.json({ responses: rows });
}
