// HMAC-signed race receipts (party side). Mirrors src/lib/towns/brasil-race-receipt.ts.
// The drive room times every racer itself; for a finish by a GitHub login it
// signs a receipt the driver's client carries to /api/towns/[slug]/brasil/race,
// which checks the signature with the shared FORCE_PUSH_HMAC_SECRET and that
// the login is the signed-in viewer before saving the time.
//
// Format: `rally1.<payload-base64url>.<sig-base64url>`

import { RALLY_RECEIPT_VERSION, type RallyReceipt } from "../src/lib/league-city/drive/rally";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signRallyReceipt(payload: RallyReceipt, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const body = base64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${RALLY_RECEIPT_VERSION}.${body}`)));
  return `${RALLY_RECEIPT_VERSION}.${body}.${base64url(sig)}`;
}

export function raceId(): string {
  const arr = new Uint8Array(9);
  crypto.getRandomValues(arr);
  return base64url(arr);
}
