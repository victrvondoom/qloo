// Server-side environment validation. Values are never echoed; only whether
// they are present and well-formed.

export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";

export interface EnvReport {
  qlooMode: "live" | "fixture" | "unconfigured";
  qlooBaseUrl: string;
  issues: string[];
}

export function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("QLOO_BASE_URL is not a valid URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("QLOO_BASE_URL must use https.");
  if (url.username || url.password || url.search || url.hash) throw new Error("QLOO_BASE_URL cannot contain credentials, a query or a fragment.");
  return url.toString().replace(/\/+$/, "");
}

export function envReport(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const issues: string[] = [];
  const mode = (env.QLOO_MODE ?? "").trim().toLowerCase();
  if (mode && mode !== "fixture" && mode !== "live") issues.push(`QLOO_MODE must be empty, "live" or "fixture".`);
  let base = HACKATHON_BASE_URL;
  try {
    base = validateBaseUrl(env.QLOO_BASE_URL?.trim() || HACKATHON_BASE_URL);
  } catch (e) {
    issues.push((e as Error).message);
  }
  if (mode === "fixture") return { qlooMode: "fixture", qlooBaseUrl: base, issues };
  const key = env.QLOO_API_KEY ?? "";
  if (!key) issues.push("QLOO_API_KEY is not set.");
  else if (/\s/.test(key) || key.length < 8) issues.push("QLOO_API_KEY looks malformed (whitespace or too short).");
  if (base !== HACKATHON_BASE_URL) issues.push("QLOO_BASE_URL is not the hackathon host; hackathon keys only work against https://hackathon.api.qloo.com.");
  return { qlooMode: key && !issues.some((i) => i.startsWith("QLOO_API_KEY")) ? "live" : "unconfigured", qlooBaseUrl: base, issues };
}

/** One-line JSON logs. Callers must not pass secrets; params are logged, headers never. */
export function log(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}
