import { timingSafeEqual } from "crypto";

const MAX_TIMESTAMP_DRIFT_MS = 300_000; // 5 minutes

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sign a payload with HMAC-SHA256. Payload format: `{click_id}.{timestamp}` */
export async function signPayload(secret: string, clickId: string, timestamp: number): Promise<string> {
  return hmacSha256(secret, `${clickId}.${timestamp}`);
}

/** Verify an HMAC signature with timing-safe comparison and timestamp freshness. */
export async function verifySignature(
  secret: string,
  clickId: string,
  timestamp: number,
  signature: string,
): Promise<{ valid: boolean; reason?: string }> {
  // Check timestamp freshness
  const drift = Math.abs(Date.now() - timestamp);
  if (drift > MAX_TIMESTAMP_DRIFT_MS) {
    return { valid: false, reason: "Timestamp expired" };
  }

  const expected = await hmacSha256(secret, `${clickId}.${timestamp}`);

  // Timing-safe compare
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) {
    return { valid: false, reason: "Invalid signature" };
  }

  if (!timingSafeEqual(a, b)) {
    return { valid: false, reason: "Invalid signature" };
  }

  return { valid: true };
}
