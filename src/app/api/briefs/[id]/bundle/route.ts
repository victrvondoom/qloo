import { jsonError, loadBrief } from "@/lib/http";
import { publicView } from "@/lib/store";
import { evidenceReport } from "@/lib/evidence";

export const dynamic = "force-dynamic";

/** The evidence bundle: brief, hash-chained ledger and a per-line evidence report, for offline audit. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const view = publicView(brief);
  const bundle = {
    format: "tastespec-evidence-bundle/2",
    howToVerify:
      "Each ledger entry's hash is SHA-256 over canonical JSON (sorted keys) of {seq, ts, kind, summary, detail, prevHash}. The first prevHash is 64 zeros. Upload this file at /verify, or recompute it yourself.",
    whatVerificationProves:
      "An intact chain proves the recorded entries have not been edited, reordered or truncated relative to the head hash below. It does not prove that Qloo returned accurate data, or that the head hash is the one originally issued; compare the head hash with one you recorded earlier for that.",
    headHash: brief.ledger.at(-1)?.hash,
    evidenceReport: evidenceReport(view),
    brief: view,
  };
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tastespec-${brief.id}.json"`,
    },
  });
}
