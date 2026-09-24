import { describe, expect, it } from "vitest";
import { oldEnoughForInviteReward } from "./invites";

const now = new Date("2026-09-25T12:00:00Z");

describe("oldEnoughForInviteReward", () => {
  it("needs 30 full days", () => {
    expect(oldEnoughForInviteReward("2026-08-26T12:00:00Z", now)).toBe(true);
    expect(oldEnoughForInviteReward("2026-08-26T12:00:01Z", now)).toBe(false);
    expect(oldEnoughForInviteReward("2015-01-01T00:00:00Z", now)).toBe(true);
  });

  it("rejects a missing or broken date", () => {
    expect(oldEnoughForInviteReward(null, now)).toBe(false);
    expect(oldEnoughForInviteReward(undefined, now)).toBe(false);
    expect(oldEnoughForInviteReward("soon", now)).toBe(false);
  });
});
