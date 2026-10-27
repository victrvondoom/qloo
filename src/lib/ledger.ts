// Hash-chained evidence ledger. Every Qloo call, model call, decision and client
// answer becomes an entry whose hash covers the previous entry's hash, so any
// later edit to a brief's evidence is detectable. Uses WebCrypto so the same
// code verifies a downloaded bundle in the browser.

import type { LedgerEntry } from "./types";

export const GENESIS = "0".repeat(64);

/** JSON with sorted object keys, so the same value always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashInput(entry: Omit<LedgerEntry, "hash">): string {
  return canonicalJson({
    seq: entry.seq,
    ts: entry.ts,
    kind: entry.kind,
    summary: entry.summary,
    detail: entry.detail,
    prevHash: entry.prevHash,
  });
}

export class Ledger {
  readonly entries: LedgerEntry[];

  constructor(existing: LedgerEntry[] = []) {
    this.entries = [...existing];
  }

  get head(): string {
    return this.entries.at(-1)?.hash ?? GENESIS;
  }

  private queue: Promise<unknown> = Promise.resolve();

  /** Appends are serialised so concurrent Qloo calls can't fork the chain. */
  append(kind: LedgerEntry["kind"], summary: string, detail: Record<string, unknown> = {}): Promise<LedgerEntry> {
    const next = this.queue.then(() => this.appendNow(kind, summary, detail));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async appendNow(
    kind: LedgerEntry["kind"],
    summary: string,
    detail: Record<string, unknown>,
  ): Promise<LedgerEntry> {
    const partial = {
      seq: this.entries.length,
      ts: new Date().toISOString(),
      kind,
      summary,
      // Round-trip so the stored detail is exactly what was hashed.
      detail: JSON.parse(canonicalJson(detail)) as Record<string, unknown>,
      prevHash: this.head,
    };
    const entry: LedgerEntry = { ...partial, hash: await sha256Hex(hashInput(partial)) };
    this.entries.push(entry);
    return entry;
  }
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  firstBadSeq?: number;
  reason?: string;
  head: string;
}

/**
 * Re-hash the chain. A chain on its own can't reveal that entries were cut
 * off the end (the shorter chain is still internally valid), so pass the head
 * hash you recorded earlier as `expectedHead` to detect truncation or
 * extension. Without it, `ok` means "internally consistent", nothing more.
 */
export async function verifyLedger(entries: LedgerEntry[], expectedHead?: string): Promise<VerifyResult> {
  if (!Array.isArray(entries)) return { ok: false, checked: 0, firstBadSeq: 0, reason: "not a ledger", head: GENESIS };
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || typeof e !== "object") return { ok: false, checked: i, firstBadSeq: i, reason: "malformed entry", head: prev };
    if (e.seq !== i) return { ok: false, checked: i, firstBadSeq: i, reason: "sequence gap or reorder", head: prev };
    if (e.prevHash !== prev) return { ok: false, checked: i, firstBadSeq: i, reason: "broken link to previous entry", head: prev };
    const expected = await sha256Hex(hashInput(e));
    if (expected !== e.hash) return { ok: false, checked: i, firstBadSeq: i, reason: "entry content was modified", head: prev };
    prev = e.hash;
  }
  if (expectedHead && expectedHead !== prev) {
    return { ok: false, checked: entries.length, firstBadSeq: entries.length, reason: "head differs from the committed head: entries were removed or added at the end", head: prev };
  }
  return { ok: true, checked: entries.length, head: prev };
}
