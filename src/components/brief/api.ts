import type { Brief } from "@/lib/types";

/** POST JSON to an owner endpoint and return the updated brief (or throw the server's message). */
export async function postBrief(url: string, body: unknown): Promise<{ brief: Brief; changed?: string[] }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { brief?: Brief; changed?: string[]; error?: string };
  if (!res.ok || !j.brief) throw new Error(j.error ?? `Request failed (${res.status})`);
  return { brief: j.brief, changed: j.changed };
}

/** Read an NDJSON stream line by line. */
export async function readNdjson(res: Response, onLine: (v: Record<string, unknown>) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onLine(JSON.parse(line) as Record<string, unknown>);
    }
  }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString();
}
