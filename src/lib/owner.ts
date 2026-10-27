// Visitor ownership without accounts. Each browser gets a random 128-bit owner
// secret in an httpOnly cookie; briefs store only its SHA-256. Only the owner
// can list their briefs, record decisions, answer the question, rate the outcome
// or delete. A brief's 96-bit id works as a read-only share link (capability
// URL), which is how a pro sends a spec to a client.

import { cookies } from "next/headers";
import { sha256Hex } from "./ledger";

export const OWNER_COOKIE = "ts_owner";
const OWNER_RE = /^[0-9a-f]{32}$/;

function newSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The current visitor's owner hash, or undefined if they have no cookie yet. */
export async function currentOwnerHash(): Promise<string | undefined> {
  const v = (await cookies()).get(OWNER_COOKIE)?.value;
  return v && OWNER_RE.test(v) ? sha256Hex(`owner:${v}`) : undefined;
}

/** Get or create the owner secret; sets the cookie when new. Route handlers only. */
export async function ensureOwnerHash(): Promise<string> {
  const jar = await cookies();
  let v = jar.get(OWNER_COOKIE)?.value;
  if (!v || !OWNER_RE.test(v)) {
    v = newSecret();
    jar.set(OWNER_COOKIE, v, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return sha256Hex(`owner:${v}`);
}

export function isOwner(briefOwnerHash: string | undefined, visitor: string | undefined): boolean {
  return Boolean(briefOwnerHash && visitor && briefOwnerHash === visitor);
}
