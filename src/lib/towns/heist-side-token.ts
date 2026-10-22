// ─── City of the day: side tokens (sign side) ───────────────
// When a driver picks a side mid-drive, /api/towns/[slug]/brasil/heist signs
// it here with the shared FORCE_PUSH_HMAC_SECRET; the client hands the token
// to the drive room (party/heistToken.ts checks it), which then counts the
// driver as that side for the day. A side picked before driving comes with
// the room's own /smash/me instead. Server only.
//
// Format: `hs1.<payload-base64url>.<sig-base64url>`

import { createHmac } from "node:crypto";
import type { HeistSide } from "./heist";

export const SIDE_TOKEN_VERSION = "hs1";
/** A token is good for this long: long enough to reach the room. */
export const SIDE_TOKEN_TTL_MS = 10 * 60_000;

export interface SideToken {
  /** The driver's login, lowercase. */
  dln: string;
  day: string;
  side: HeistSide;
  exp: number;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function signSideToken(payload: SideToken): string | null {
  const secret = process.env.FORCE_PUSH_HMAC_SECRET;
  if (!secret || secret.length < 32) return null;
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(`${SIDE_TOKEN_VERSION}.${body}`).digest();
  return `${SIDE_TOKEN_VERSION}.${body}.${b64url(sig)}`;
}
