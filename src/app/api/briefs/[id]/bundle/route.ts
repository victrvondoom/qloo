import { jsonError, loadBrief } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The evidence bundle: the full brief plus its hash-chained ledger, for offline audit. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const brief = await loadBrief((await params).id);
  if (!brief) return jsonError("Brief not found.", 404);
  const bundle = {
    format: "tastespec-evidence-bundle/1",
    howToVerify:
      "Each ledger entry's hash is SHA-256 over canonical JSON (sorted keys) of {seq, ts, kind, summary, detail, prevHash}. The first prevHash is 64 zeros. Upload this file at /verify, or recompute it yourself.",
    headHash: brief.ledger.at(-1)?.hash,
    brief,
  };
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tastespec-${brief.id}.json"`,
    },
  });
}
