// Qloo Insights API client.
//
// Contract (from Qloo's hackathon developer guide and the official
// @qloo/qloo-harness source): GET only, `X-Api-Key` header, hackathon keys only
// work against https://hackathon.api.qloo.com, `filter.type` is required on
// /v2/insights, list params are comma-joined. Response parsing is tolerant:
// `results` may be an array or an object keyed by "entities" / "tags".
//
// Every call is written to the brief's evidence ledger: endpoint, params,
// status, latency, a SHA-256 digest of the response body and the ids/names it
// returned. The API key is never logged.

import { sha256Hex } from "../ledger";
import type { Ledger } from "../ledger";
import type { QlooEntity } from "../types";

export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";

export type Params = Record<string, string | number | boolean | string[] | undefined>;

export interface Transport {
  readonly mode: "live" | "fixture";
  get(path: string, params: Params): Promise<{ status: number; body: unknown }>;
}

export class QlooError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Qloo HTTP ${status}: ${message}`);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

export function encodeParams(params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return sp.toString();
}

export class HttpTransport implements Transport {
  readonly mode = "live" as const;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = HACKATHON_BASE_URL,
    private readonly timeoutMs = 12_000,
  ) {}

  async get(path: string, params: Params) {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${path}?${encodeParams(params)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }
}

// ---------------------------------------------------------------- parsing

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export function resultArray(body: unknown, key: string): unknown[] {
  const results = asRecord(body)?.results;
  if (Array.isArray(results)) return results;
  const inner = asRecord(results)?.[key];
  return Array.isArray(inner) ? inner : [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Keywords on place entities have appeared as strings and as {name, count}. */
function parseKeywords(props: Record<string, unknown>): string[] {
  const raw = props.keywords;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => (typeof k === "string" ? k : str(asRecord(k)?.name)))
    .filter((k): k is string => Boolean(k))
    .slice(0, 60);
}

export function parseEntity(raw: unknown): QlooEntity | undefined {
  const e = asRecord(raw);
  if (!e) return undefined;
  const id = str(e.entity_id) ?? str(e.id);
  const name = str(e.name);
  if (!id || !name) return undefined;
  const props = asRecord(e.properties) ?? {};
  const query = asRecord(e.query);
  const tags = (Array.isArray(e.tags) ? e.tags : [])
    .map((t) => {
      const r = asRecord(t);
      const tagId = str(r?.tag_id) ?? str(r?.id);
      const tagName = str(r?.name);
      return tagId || tagName ? { tag_id: tagId ?? "", name: tagName ?? tagId ?? "", type: str(r?.type) } : undefined;
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const types = Array.isArray(e.types) ? e.types.filter((t): t is string => typeof t === "string") : undefined;
  return {
    entity_id: id,
    name,
    type: str(e.type) ?? types?.find((t) => t.startsWith("urn:entity:")),
    subtype: str(e.subtype),
    types,
    popularity: num(e.popularity),
    affinity: num(e.affinity) ?? num(query?.affinity),
    tags,
    keywords: parseKeywords(props),
    properties: props,
  };
}

export interface ParsedTag {
  id: string;
  name: string;
  type?: string;
  affinity?: number;
}

export function parseTag(raw: unknown): ParsedTag | undefined {
  const t = asRecord(raw);
  if (!t) return undefined;
  const id = str(t.id) ?? str(t.tag_id);
  const name = str(t.name);
  if (!id && !name) return undefined;
  return {
    id: id ?? name!,
    name: name ?? id!,
    type: str(t.type) ?? str(t.subtype),
    affinity: num(t.affinity) ?? num(asRecord(t.query)?.affinity),
  };
}

// ---------------------------------------------------------------- client

const responseCache = new Map<string, { status: number; body: unknown }>();
const CACHE_MAX = 400;

export class QlooClient {
  constructor(
    private readonly transport: Transport,
    private readonly ledger?: Ledger,
  ) {}

  get mode() {
    return this.transport.mode;
  }

  /** One GET with a single bounded retry on 429/5xx; every attempt is ledgered. */
  private async call(path: string, params: Params, purpose: string): Promise<unknown> {
    const key = `${this.transport.mode}:${path}?${encodeParams(params)}`;
    let attempt = 0;
    for (;;) {
      const started = Date.now();
      const cached = responseCache.get(key);
      let status: number;
      let body: unknown;
      let fromCache = false;
      try {
        if (cached) {
          ({ status, body } = cached);
          fromCache = true;
        } else {
          ({ status, body } = await this.transport.get(path, params));
        }
      } catch (err) {
        status = 599;
        body = { message: err instanceof Error ? err.message : String(err) };
      }
      const ok = status >= 200 && status < 300 && asRecord(body)?.success !== false;
      if (ok && !fromCache) {
        responseCache.set(key, { status, body });
        if (responseCache.size > CACHE_MAX) responseCache.delete(responseCache.keys().next().value!);
      }
      await this.ledger?.append("qloo_call", `${purpose} — GET ${path} → ${status}${fromCache ? " (cache)" : ""}`, {
        endpoint: path,
        params,
        status,
        ms: Date.now() - started,
        fromCache,
        transport: this.transport.mode,
        responseSha256: await sha256Hex(JSON.stringify(body ?? null)),
        returned: summarizeReturned(body),
      });
      if (ok) return body;
      const message = str(asRecord(body)?.message) ?? str(asRecord(body)?.error) ?? JSON.stringify(asRecord(body)?.errors ?? "request failed");
      const error = new QlooError(status, message);
      if (error.retryable && attempt === 0) {
        attempt++;
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw error;
    }
  }

  async search(query: string, opts: { types?: string; take?: number } = {}): Promise<QlooEntity[]> {
    const body = await this.call("/search", { query, types: opts.types, take: opts.take ?? 5 }, `Resolve "${query}"`);
    return resultArray(body, "entities").map(parseEntity).filter((e): e is QlooEntity => Boolean(e));
  }

  async insightsEntities(params: Params, purpose: string): Promise<QlooEntity[]> {
    const body = await this.call("/v2/insights", params, purpose);
    return resultArray(body, "entities").map(parseEntity).filter((e): e is QlooEntity => Boolean(e));
  }

  async insightsTags(params: Params, purpose: string): Promise<ParsedTag[]> {
    const body = await this.call("/v2/insights", { ...params, "filter.type": "urn:tag" }, purpose);
    return resultArray(body, "tags").map(parseTag).filter((t): t is ParsedTag => Boolean(t));
  }
}

function summarizeReturned(body: unknown): unknown {
  const results = asRecord(body)?.results;
  const list = Array.isArray(results)
    ? results
    : [...resultArray(body, "entities"), ...resultArray(body, "tags")];
  return list.slice(0, 50).map((r) => {
    const rec = asRecord(r) ?? {};
    return {
      id: str(rec.entity_id) ?? str(rec.id) ?? str(rec.tag_id),
      name: str(rec.name),
      affinity: num(rec.affinity) ?? num(asRecord(rec.query)?.affinity),
    };
  });
}
