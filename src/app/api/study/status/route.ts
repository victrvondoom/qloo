import { NextResponse } from "next/server";
import { studyStatus } from "@/lib/study-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await studyStatus());
}
