// City of the day side tokens (party side). Mirrors src/lib/towns/heist-side-token.ts:
// the site signs a driver's side for the day, the room checks it here with the
// shared FORCE_PUSH_HMAC_SECRET before counting the driver as a robber or a cop.
//
// Format: `hs1.<payload-base64url>.<sig-base64url>`

import { isSide, type HeistSide } from "../src/lib/towns/heist";

const VERSION = "hs1";
const MAX_LENGTH = 512;

function b64urlBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The token's login, day and side, or null when it's forged, malformed or stale. */
export async function verifySideToken(token: unknown, secret: string, now = Date.now()): Promise<{ dln: string; day: string; side: HeistSide } | null> {
  if (typeof token !== "string" || token.length > MAX_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, body, sig] = parts;
  const enc = new TextEncoder();
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("HMAC", key, b64urlBytes(sig), enc.encode(`${VERSION}.${body}`)))) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlBytes(body))) as Record<string, unknown>;
    if (typeof p.dln !== "string" || typeof p.day !== "string" || !isSide(p.side) || typeof p.exp !== "number" || p.exp < now) return null;
    return { dln: p.dln, day: p.day, side: p.side };
  } catch {
    return null;
  }
}
