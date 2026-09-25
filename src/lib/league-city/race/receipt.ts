// ─── Lap receipts (verify side) ─────────────────────────────
// Minted by the PartyKit race server (party/lapToken.ts) for a valid lap,
// carried by the driver's client to /api/towns/[slug]/race/lap, checked here
// with the shared FORCE_PUSH_HMAC_SECRET.
//
// Format: `lap1.<payload-base64url>.<sig-base64url>`

import { createHmac, timingSafeEqual } from "node:crypto";
import { RECEIPT_VERSION, type LapReceipt } from "./net";

const MAX_TOKEN_LENGTH = 1024;

function b64urlDecode(s: string): Buffer {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b + "=".repeat((4 - (b.length % 4)) % 4), "base64");
}

export type ReceiptResult = { ok: true; receipt: LapReceipt } | { ok: false; reason: "format" | "signature" | "expired" | "payload" | "config" };

export function verifyLapReceipt(token: unknown, now = Date.now()): ReceiptResult {
  const secret = process.env.FORCE_PUSH_HMAC_SECRET;
  if (!secret || secret.length < 32) return { ok: false, reason: "config" };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "format" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== RECEIPT_VERSION) return { ok: false, reason: "format" };
  const [, body, sig] = parts;
  const want = createHmac("sha256", secret).update(`${RECEIPT_VERSION}.${body}`).digest();
  const got = b64urlDecode(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "signature" };
  let r: LapReceipt;
  try {
    r = JSON.parse(b64urlDecode(body).toString("utf8")) as LapReceipt;
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (
    !r ||
    typeof r.room !== "string" ||
    typeof r.track !== "string" ||
    typeof r.dln !== "string" ||
    typeof r.nonce !== "string" ||
    !Number.isInteger(r.ms) ||
    typeof r.exp !== "number"
  ) {
    return { ok: false, reason: "payload" };
  }
  if (r.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, receipt: r };
}
