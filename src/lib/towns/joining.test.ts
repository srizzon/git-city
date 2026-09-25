import { describe, expect, it } from "vitest";
import { isJoinMode, joinAction, requestIsLive, type JoinRequestRow } from "./joining";

const now = new Date("2026-09-25T12:00:00Z");
const req = (status: JoinRequestRow["status"], daysAgo: number): JoinRequestRow => ({
  status,
  created_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
});
const base = { kind: "custom" as const, mode: "request" as const, membership: null, tokenOk: false, request: null, now };

describe("requestIsLive", () => {
  it("keeps pending and declined requests for 14 days", () => {
    expect(requestIsLive(req("pending", 1), now)).toBe(true);
    expect(requestIsLive(req("declined", 13.9), now)).toBe(true);
    expect(requestIsLive(req("pending", 14), now)).toBe(false);
  });

  it("ignores approved, cancelled and missing requests", () => {
    expect(requestIsLive(req("approved", 1), now)).toBe(false);
    expect(requestIsLive(req("cancelled", 1), now)).toBe(false);
    expect(requestIsLive(null, now)).toBe(false);
  });
});

describe("joinAction", () => {
  it("members see nothing to do", () => {
    expect(joinAction({ ...base, membership: { status: "active", removed_by: null } })).toBe("member");
  });

  it("company towns always go through verification", () => {
    expect(joinAction({ ...base, kind: "company", mode: "open" })).toBe("verify");
    expect(joinAction({ ...base, kind: "company", tokenOk: true })).toBe("verify");
  });

  it("an invite or the admin's link joins in any mode", () => {
    expect(joinAction({ ...base, mode: "invite", membership: { status: "invited", removed_by: null } })).toBe("join");
    expect(joinAction({ ...base, mode: "invite", tokenOk: true })).toBe("join");
  });

  it("removed members only come back through an invite", () => {
    const removed = { status: "former" as const, removed_by: 7 };
    expect(joinAction({ ...base, mode: "open", membership: removed })).toBe("none");
    expect(joinAction({ ...base, membership: removed })).toBe("none");
  });

  it("follows the town's mode for everyone else", () => {
    expect(joinAction({ ...base, mode: "open" })).toBe("join");
    expect(joinAction({ ...base, mode: "invite" })).toBe("none");
    expect(joinAction(base)).toBe("ask");
    expect(joinAction({ ...base, request: req("pending", 2) })).toBe("pending");
    expect(joinAction({ ...base, request: req("declined", 2) })).toBe("pending");
    expect(joinAction({ ...base, request: req("declined", 20) })).toBe("ask");
  });

  it("members who left on their own can rejoin by the mode", () => {
    expect(joinAction({ ...base, mode: "open", membership: { status: "former", removed_by: null } })).toBe("join");
  });
});

describe("isJoinMode", () => {
  it("accepts the three modes only", () => {
    expect(["open", "request", "invite"].every(isJoinMode)).toBe(true);
    expect(isJoinMode("public")).toBe(false);
    expect(isJoinMode(null)).toBe(false);
  });
});
