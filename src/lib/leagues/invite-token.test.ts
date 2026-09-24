import { describe, expect, it } from "vitest";
import { customJoinDecision, newInviteToken, tokenMatches } from "./invite-token";

describe("invite tokens", () => {
  it("are url-safe and unique", () => {
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newInviteToken()).not.toBe(a);
  });

  it("match only the exact token", () => {
    const t = newInviteToken();
    expect(tokenMatches(t, t)).toBe(true);
    expect(tokenMatches(t.slice(1), t)).toBe(false);
    expect(tokenMatches(`${t}x`, t)).toBe(false);
    expect(tokenMatches("", t)).toBe(false);
    expect(tokenMatches(null, t)).toBe(false);
  });

  it("never match a league without a token", () => {
    expect(tokenMatches("anything", null)).toBe(false);
    expect(tokenMatches(null, null)).toBe(false);
  });
});

describe("customJoinDecision", () => {
  it("lets invited members in without a token", () => {
    expect(customJoinDecision({ status: "invited", removed_by: null }, false)).toBe("invited");
  });

  it("needs the token for newcomers and members who left", () => {
    expect(customJoinDecision(null, false)).toBe("needs_invite");
    expect(customJoinDecision(null, true)).toBe("token");
    expect(customJoinDecision({ status: "former", removed_by: null }, true)).toBe("token");
  });

  it("keeps removed members out even with the token", () => {
    expect(customJoinDecision({ status: "former", removed_by: 7 }, true)).toBe("removed");
  });

  it("is a no-op for active members", () => {
    expect(customJoinDecision({ status: "active", removed_by: null }, false)).toBe("active");
  });
});
