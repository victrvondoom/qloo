// Qloo Insights API client.
//
// Contract (Qloo hackathon developer guide; official @qloo/qloo-harness 0.1.26
// source): GET only, `X-Api-Key` header, hackathon keys only work against
// https://hackathon.api.qloo.com, `filter.type` is required on /v2/insights,
// list params are comma-joined, pagination is a 1-indexed `page` param. The
// harness caps results at 20 per request, so we page in 20s.
//
// Retry policy mirrors Qloo's own TypeScript client: at most 3 attempts, retry
// only 429/500/502/503/504 and network errors, honour Retry-After, jittered
// exponential backoff, never beyond the run's deadline. Responses over 5 MB are
// rejected.
//
// Every request is written to the brief's evidence ledger (endpoint, params,
// status, attempts, latency, Qloo request id, SHA-256 of the body, the ids and
// names returned). The API key is never logged or ledgered.

import { sha256Hex } from "../ledger";
import type { Ledger } from "../ledger";
import { HACKATHON_BASE_URL, log } from "../env";
import type { QlooEntity } from "../types";

export { HACKATHON_BASE_URL };

export type Params = Record<string, string | number | boolean | string[] | undefined>;

export interface RawResponse {
  status: number;
  body: unknown;
  requestId?: string;
  retryAfterMs?: number;
}

export interface Transport {
  readonly mode: "live" | "fixture";
  /** Optional label for wrappers (e.g. a simulated outage) so the ledger records it. */
  readonly note?: string;
  get(path: string, params: Params, signal?: AbortSignal): Promise<RawResponse>;
}

export type QlooErrorKind = "auth" | "rate_limit" | "upstream" | "network" | "timeout" | "bad_request" | "budget" | "cancelled" | "deadline";

/** Upstream error text can echo a credential back. Strip the configured key and anything shaped like one before it can reach a log, ledger or browser. */
export function redactSecrets(text: string): string {
  let out = text;
  const key = process.env.QLOO_API_KEY;
  if (key && key.length >= 8) out = out.split(key).join("[redacted]");
  return out.replace(/\b(?:sk|key|tok|token|api)[-_][A-Za-z0-9_-]{8,}\b/gi, "[redacted]").replace(/(x-api-key["']?\s*[:=]\s*)\S+/gi, "$1[redacted]");
}

export class QlooError extends Error {
  constructor(
    readonly kind: QlooErrorKind,
    readonly status: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(redactSecrets(`Qloo ${kind} (HTTP ${status}): ${message}`));
  }
}

export const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const PAGE_SIZE = 20;

export function encodeParams(params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    const s = Array.isArray(v) ? v.join(",") : String(v);
    if (s !== "") sp.set(k, s);
  }
  return sp.toString();
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export class HttpTransport implements Transport {
  readonly mode = "live" as const;
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = HACKATHON_BASE_URL,
    private readonly attemptTimeoutMs = 12_000,
  ) {}

  async get(path: string, params: Params, signal?: AbortSignal): Promise<RawResponse> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${path}?${encodeParams(params)}`;
    const timeout = AbortSignal.timeout(this.attemptTimeoutMs);
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
    const requestId = res.headers.get("x-qloo-request-id") ?? res.headers.get("x-request-id") ?? undefined;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return { status: 598, body: { message: "response too large" }, requestId };
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) return { status: 598, body: { message: "response too large" }, requestId };
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: "response was not JSON" };
    }
    return { status: res.status, body, requestId, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) };
  }
}

/** Proof Lab only: makes every insights call fail as if Qloo were down. Always labelled. */
export class SimulatedOutageTransport implements Transport {
  readonly note = "SIMULATED OUTAGE (Proof Lab challenge): insights calls return 503 by design";
  constructor(private readonly inner: Transport) {}
  get mode() {
    return this.inner.mode;
  }
  async get(path: string, params: Params, signal?: AbortSignal): Promise<RawResponse> {
    if (path === "/v2/insights") return { status: 503, body: { message: "simulated outage" } };
    return this.inner.get(path, params, signal);
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

function str(v: unknown, max = 300): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Keywords on place entities have appeared as strings and as {name, count}. */
function parseKeywords(props: Record<string, unknown>): string[] {
  const raw = props.keywords;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => (typeof k === "string" ? k.slice(0, 80) : str(asRecord(k)?.name, 80)))
    .filter((k): k is string => Boolean(k))
    .slice(0, 60);
}

export function parseEntity(raw: unknown): QlooEntity | undefined {
  const e = asRecord(raw);
  if (!e) return undefined;
  const id = str(e.entity_id, 120) ?? str(e.id, 120);
  const name = str(e.name, 200);
  if (!id || !name) return undefined;
  const props = asRecord(e.properties) ?? {};
  const query = asRecord(e.query);
  const tags = (Array.isArray(e.tags) ? e.tags : [])
    .slice(0, 80)
    .map((t) => {
      const r = asRecord(t);
      const tagId = str(r?.tag_id, 160) ?? str(r?.id, 160);
      const tagName = str(r?.name, 120);
      return tagId || tagName ? { tag_id: tagId ?? "", name: tagName ?? tagId ?? "", type: str(r?.type, 120) } : undefined;
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const types = Array.isArray(e.types) ? e.types.filter((t): t is string => typeof t === "string").slice(0, 10) : undefined;
  const geocode = asRecord(props.geocode);
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
    // Keep only the small, non-bulk fields we display; never store whole responses.
    properties: {
      ...(str(geocode?.city) ? { city: str(geocode?.city) } : {}),
      ...(str(props.address) ? { address: str(props.address) } : {}),
    },
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
  const id = str(t.id, 160) ?? str(t.tag_id, 160);
  const name = str(t.name, 120);
  if (!id && !name) return undefined;
  return {
    id: id ?? name!,
    name: name ?? id!,
    type: str(t.type) ?? str(t.subtype),
    affinity: num(t.affinity) ?? num(asRecord(t.query)?.affinity),
  };
}

function classify(status: number): QlooErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 599) return "network";
  if (status === 597) return "timeout";
  if (status >= 500) return "upstream";
  return "bad_request";
}

// ---------------------------------------------------------------- client

// Qloo answers keyed by mode and request only. Nothing in a key or an entry identifies a user or an owner; it is
// per-process memory, bounded in size and age, and holds only what Qloo returned for that exact request.
const CACHE_TTL_MS = Number(process.env.TASTESPEC_QLOO_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
const responseCache = new Map<string, { res: RawResponse; at: number }>();
const inflight = new Map<string, Promise<void>>();
const CACHE_MAX = 300;

export interface ClientOptions {
  /** Absolute epoch-ms deadline for the whole run; no attempt or backoff may pass it. */
  deadline?: number;
  signal?: AbortSignal;
  /** Maximum HTTP attempts for the run (retries count). */
  maxCalls?: number;
  /** Injected for tests so backoff doesn't sleep. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Set false to bypass the response cache and request de-duplication (used to measure what they save). */
  cache?: boolean;
}

export interface CallStats {
  requests: number;
  attempts: number;
  retries: number;
  failures: number;
  cacheHits: number;
  /** Requests that waited for an identical request already in flight instead of calling Qloo again. */
  deduped: number;
  ms: number;
}

export interface CallResult<T> {
  value: T;
  /** Ledger sequence numbers of the requests that produced this value. */
  evidence: number[];
  partial?: boolean;
}

export class QlooClient {
  readonly stats: CallStats = { requests: 0, attempts: 0, retries: 0, failures: 0, cacheHits: 0, deduped: 0, ms: 0 };
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly transport: Transport,
    private readonly ledger?: Ledger,
    private readonly opts: ClientOptions = {},
  ) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  get mode() {
    return this.transport.mode;
  }

  private remaining(): number {
    return this.opts.deadline ? this.opts.deadline - Date.now() : Number.POSITIVE_INFINITY;
  }

  private async call(path: string, params: Params, purpose: string): Promise<{ body: unknown; seq: number }> {
    const key = `${this.transport.mode}:${this.transport.note ?? ""}:${path}?${encodeParams(params)}`;
    const useCache = this.opts.cache !== false;
    // An identical request already in flight is waited for, then served from the cache it fills (or retried if it failed).
    const waiting = useCache ? inflight.get(key) : undefined;
    if (waiting) {
      await waiting.catch(() => {});
      this.stats.deduped++;
    }
    let release: (() => void) | undefined;
    if (useCache && !inflight.has(key)) inflight.set(key, new Promise<void>((r) => (release = r)));
    try {
      return await this.callOnce(key, path, params, purpose, useCache);
    } finally {
      if (release) {
        inflight.delete(key);
        release();
      }
    }
  }

  private async callOnce(key: string, path: string, params: Params, purpose: string, useCache: boolean): Promise<{ body: unknown; seq: number }> {
    const started = Date.now();
    this.stats.requests++;
    const hit = useCache ? responseCache.get(key) : undefined;
    if (hit && Date.now() - hit.at > CACHE_TTL_MS) responseCache.delete(key);
    let res: RawResponse | undefined = hit && Date.now() - hit.at <= CACHE_TTL_MS ? hit.res : undefined;
    const fromCache = Boolean(res);
    let attempts = 0;
    let lastError: QlooError | undefined;

    if (fromCache) this.stats.cacheHits++;
    while (!res || (!fromCache && attempts === 0)) {
      if (this.opts.signal?.aborted) throw new QlooError("cancelled", 0, "run was cancelled");
      if (this.remaining() <= 0) {
        lastError = new QlooError("deadline", 0, "run deadline reached");
        break;
      }
      if (this.opts.maxCalls !== undefined && this.stats.attempts >= this.opts.maxCalls) {
        lastError = new QlooError("budget", 0, `Qloo call budget of ${this.opts.maxCalls} exhausted`);
        break;
      }
      attempts++;
      this.stats.attempts++;
      try {
        res = await this.transport.get(path, params, this.opts.signal);
      } catch (err) {
        const aborted = this.opts.signal?.aborted;
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError") && !aborted;
        if (aborted) throw new QlooError("cancelled", 0, "run was cancelled");
        res = { status: timedOut ? 597 : 599, body: { message: err instanceof Error ? err.name : "network error" } };
      }
      const ok = res.status >= 200 && res.status < 300 && asRecord(res.body)?.success !== false;
      if (ok) {
        lastError = undefined;
        break;
      }
      const kind = classify(res.status);
      const message = str(asRecord(res.body)?.message) ?? str(asRecord(res.body)?.error) ?? JSON.stringify(asRecord(res.body)?.errors ?? "request failed").slice(0, 300);
      lastError = new QlooError(kind, res.status, message, res.requestId);
      const retryable = RETRYABLE.has(res.status) || res.status === 599 || res.status === 597;
      if (!retryable || attempts >= MAX_ATTEMPTS) break;
      const backoff = Math.min(8000, 400 * 2 ** (attempts - 1)) * (0.5 + this.random());
      const delay = Math.min(res.retryAfterMs ?? backoff, 30_000);
      if (delay > this.remaining() - 1000) break;
      this.stats.retries++;
      await this.sleep(delay);
      res = undefined;
    }

    const ms = Date.now() - started;
    this.stats.ms += ms;
    if (res && !lastError && !fromCache && useCache) {
      responseCache.set(key, { res, at: Date.now() });
      if (responseCache.size > CACHE_MAX) responseCache.delete(responseCache.keys().next().value!);
    }
    if (lastError) this.stats.failures++;
    const entry = await this.ledger?.append("qloo_call", `${purpose} — GET ${path} → ${lastError ? `${lastError.kind} ${lastError.status}` : res?.status}${fromCache ? " (cache)" : ""}`, {
      endpoint: path,
      params,
      status: res?.status ?? lastError?.status ?? 0,
      ok: !lastError,
      errorKind: lastError?.kind,
      attempts,
      ms,
      fromCache,
      transport: this.transport.mode,
      ...(this.transport.note ? { transportNote: this.transport.note } : {}),
      qlooRequestId: res?.requestId,
      responseSha256: res ? await sha256Hex(JSON.stringify(res.body ?? null)) : undefined,
      returned: res && !lastError ? summarizeReturned(res.body) : [],
    });
    log("qloo_call", { path, status: res?.status, ok: !lastError, attempts, ms, fromCache, mode: this.transport.mode, requestId: res?.requestId });
    if (lastError) throw lastError;
    return { body: res!.body, seq: entry?.seq ?? -1 };
  }

  async search(query: string, opts: { types?: string; take?: number } = {}): Promise<CallResult<QlooEntity[]>> {
    const { body, seq } = await this.call("/search", { query: query.slice(0, 120), types: opts.types, take: Math.min(opts.take ?? 5, PAGE_SIZE) }, `Resolve "${query.slice(0, 60)}"`);
    return { value: resultArray(body, "entities").map(parseEntity).filter((e): e is QlooEntity => Boolean(e)), evidence: [seq] };
  }

  /**
   * Fetches up to `want` entities in pages of 20 (`page` is 1-indexed). Stops
   * early on a short page. If a later page fails, earlier pages are kept and
   * the result is marked partial; if the first page fails, it throws.
   */
  async insightsEntities(params: Params, purpose: string, want = 40): Promise<CallResult<QlooEntity[]>> {
    const out: QlooEntity[] = [];
    const evidence: number[] = [];
    const pages = Math.ceil(want / PAGE_SIZE);
    for (let page = 1; page <= pages; page++) {
      try {
        const { body, seq } = await this.call("/v2/insights", { ...params, take: PAGE_SIZE, page }, `${purpose} (page ${page})`);
        evidence.push(seq);
        const batch = resultArray(body, "entities").map(parseEntity).filter((e): e is QlooEntity => Boolean(e));
        for (const e of batch) if (!out.some((x) => x.entity_id === e.entity_id)) out.push(e);
        if (batch.length < PAGE_SIZE) break;
      } catch (err) {
        if (page === 1) throw err;
        return { value: out.slice(0, want), evidence, partial: true };
      }
    }
    return { value: out.slice(0, want), evidence };
  }

  async insightsTags(params: Params, purpose: string): Promise<CallResult<ParsedTag[]>> {
    const { body, seq } = await this.call("/v2/insights", { ...params, "filter.type": "urn:tag", take: Math.min(Number(params.take ?? PAGE_SIZE), PAGE_SIZE) }, purpose);
    return { value: resultArray(body, "tags").map(parseTag).filter((t): t is ParsedTag => Boolean(t)), evidence: [seq] };
  }
}

export function clearQlooCache() {
  responseCache.clear();
}

function summarizeReturned(body: unknown): unknown {
  const results = asRecord(body)?.results;
  const list = Array.isArray(results) ? results : [...resultArray(body, "entities"), ...resultArray(body, "tags")];
  return list.slice(0, 40).map((r) => {
    const rec = asRecord(r) ?? {};
    return {
      id: str(rec.entity_id, 120) ?? str(rec.id, 120) ?? str(rec.tag_id, 120),
      name: str(rec.name, 120),
      affinity: num(rec.affinity) ?? num(asRecord(rec.query)?.affinity),
    };
  });
}
