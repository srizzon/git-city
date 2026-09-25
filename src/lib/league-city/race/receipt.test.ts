import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signLapReceipt } from "../../../../party/lapToken";
import { verifyLapReceipt } from "./receipt";

const SECRET = "x".repeat(40);
const lap = { room: "acme", track: "sprint", dln: "alice", ms: 61234, exp: Date.now() + 60_000, nonce: "n1" };

describe("lap receipts", () => {
  beforeEach(() => {
    process.env.FORCE_PUSH_HMAC_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.FORCE_PUSH_HMAC_SECRET;
  });

  it("verifies what the race server signs", async () => {
    const token = await signLapReceipt(lap, SECRET);
    expect(verifyLapReceipt(token)).toEqual({ ok: true, receipt: lap });
  });

  it("rejects a changed time, another secret and an expired receipt", async () => {
    const token = await signLapReceipt(lap, SECRET);
    const [v, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...lap, ms: 1000 })).toString("base64url");
    expect(verifyLapReceipt(`${v}.${forged}.${sig}`)).toMatchObject({ ok: false, reason: "signature" });
    expect(verifyLapReceipt(await signLapReceipt(lap, "y".repeat(40)))).toMatchObject({ ok: false, reason: "signature" });
    expect(verifyLapReceipt(await signLapReceipt({ ...lap, exp: Date.now() - 1 }, SECRET))).toMatchObject({ ok: false, reason: "expired" });
  });
});
