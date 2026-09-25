// HMAC-signed lap receipts (PartyKit side). Mirrors src/lib/league-city/race/receipt.ts.
// The race server times every lap itself; for a valid one by a GitHub login
// it signs a receipt the driver's client carries to /api/towns/[slug]/race/lap,
// which checks the signature with the shared FORCE_PUSH_HMAC_SECRET and that
// the login is the signed-in viewer before saving the time.
//
// Format: `lap1.<payload-base64url>.<sig-base64url>`

import { RECEIPT_VERSION, type LapReceipt } from "../src/lib/league-city/race/net";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signLapReceipt(payload: LapReceipt, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const body = base64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${RECEIPT_VERSION}.${body}`)));
  return `${RECEIPT_VERSION}.${body}.${base64url(sig)}`;
}

export function randomNonce(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return base64url(arr);
}
