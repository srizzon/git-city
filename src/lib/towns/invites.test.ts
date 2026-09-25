import { describe, expect, it } from "vitest";
import { accountOldEnough } from "./invites";

const now = new Date("2026-09-25T12:00:00Z");

describe("accountOldEnough", () => {
  it("needs 30 full days", () => {
    expect(accountOldEnough("2026-08-26T12:00:00Z", now)).toBe(true);
    expect(accountOldEnough("2026-08-26T12:00:01Z", now)).toBe(false);
    expect(accountOldEnough("2015-01-01T00:00:00Z", now)).toBe(true);
  });

  it("rejects a missing or broken date", () => {
    expect(accountOldEnough(null, now)).toBe(false);
    expect(accountOldEnough(undefined, now)).toBe(false);
    expect(accountOldEnough("soon", now)).toBe(false);
  });
});
