import { describe, expect, it } from "vitest";
import { POINTS, brasiliaDay, pointsWeek, taggedFriends, totalOf, weekBreakdowns } from "./brasil-points";

describe("taggedFriends", () => {
  it("reads every @ but the account's, the commenter's and their own login", () => {
    expect(taggedFriends("srizzon SP @joao.silva @maria_dev bora", ["samuelrizzondev", "ana"])).toEqual(["joao.silva", "maria_dev"]);
    expect(taggedFriends("@samuelrizzondev @Ana @srizzon @bia", ["samuelrizzondev", "ana", "srizzon"])).toEqual(["bia"]);
  });
  it("once each, at most five, a sentence's period dropped", () => {
    expect(taggedFriends("@a @b @a @c @d @e @f @g", [])).toEqual(["a", "b", "c", "d", "e"]);
    expect(taggedFriends("vem @joao.", [])).toEqual(["joao"]);
  });
});

describe("days and weeks", () => {
  it("a day is Brasília's: 01:00 UTC is still the day before", () => {
    expect(brasiliaDay(new Date("2026-10-20T01:00:00Z"))).toBe("2026-10-19");
    expect(brasiliaDay(new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-20");
  });
  it("a week starts Monday 00:00 UTC (Sunday 21h in Brasília)", () => {
    expect(pointsWeek(new Date("2026-10-25T23:59:00Z"))).toBe("2026-10-19");
    expect(pointsWeek(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });
});

describe("weekBreakdowns", () => {
  it("adds the ledger and ten a day coded", () => {
    const b = weekBreakdowns(
      [
        { login: "Ana", kind: "comment", points: 5 },
        { login: "ana", kind: "invite", points: 50 },
        { login: "bia", kind: "story", points: 20 },
      ],
      new Map([
        ["ana", [3, 0, 1, 0, 0, 0, 0]],
        ["caio", [0, 0, 0, 0, 0, 0, 0]],
      ]),
    );
    expect(b.get("ana")).toMatchObject({ comment: 5, invite: 50, coded: 2 * POINTS.coded });
    expect(totalOf(b.get("ana")!)).toBe(75);
    expect(totalOf(b.get("bia")!)).toBe(20);
    expect(b.has("caio")).toBe(false);
  });
});
