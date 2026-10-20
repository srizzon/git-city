// ─── Race receipts (verify side) ────────────────────────────
// Minted by the drive room (party/rallyToken.ts) for a timed finish, carried
// by the driver's client to /api/towns/[slug]/brasil/race, checked here with
// the shared FORCE_PUSH_HMAC_SECRET. Server only.
//
// Format: `rally1.<payload-base64url>.<sig-base64url>`

import { createHmac, timingSafeEqual } from "node:crypto";
import { RALLY_RECEIPT_VERSION, type RallyReceipt } from "../league-city/drive/rally";

const MAX_TOKEN_LENGTH = 1024;

function b64urlDecode(s: string): Buffer {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b + "=".repeat((4 - (b.length % 4)) % 4), "base64");
}

export type RallyReceiptResult = { ok: true; receipt: RallyReceipt } | { ok: false; reason: "format" | "signature" | "expired" | "payload" | "config" };

export function verifyRallyReceipt(token: unknown, now = Date.now()): RallyReceiptResult {
  const secret = process.env.FORCE_PUSH_HMAC_SECRET;
  if (!secret || secret.length < 32) return { ok: false, reason: "config" };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "format" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== RALLY_RECEIPT_VERSION) return { ok: false, reason: "format" };
  const [, body, sig] = parts;
  const want = createHmac("sha256", secret).update(`${RALLY_RECEIPT_VERSION}.${body}`).digest();
  const got = b64urlDecode(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "signature" };
  let r: RallyReceipt;
  try {
    r = JSON.parse(b64urlDecode(body).toString("utf8")) as RallyReceipt;
  } catch {
    return { ok: false, reason: "payload" };
  }
  const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 64;
  if (
    !r ||
    !str(r.room) ||
    !str(r.race) ||
    !str(r.key) ||
    !str(r.from) ||
    !str(r.to) ||
    !str(r.dln) ||
    !Number.isInteger(r.ms) ||
    !Number.isInteger(r.place) ||
    !Number.isInteger(r.n) ||
    typeof r.exp !== "number"
  ) {
    return { ok: false, reason: "payload" };
  }
  if (r.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, receipt: r };
}
