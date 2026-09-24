import { describe, expect, it } from "vitest";
import { pickTownOfWeek, type WeeklyVisitors } from "./featured";

const w = (league_id: string, visitors: number, first_at: string | null = null): WeeklyVisitors => ({
  league_id,
  visitors,
  first_at,
});

describe("pickTownOfWeek", () => {
  it("picks the most visitors", () => {
    expect(pickTownOfWeek([w("a", 3), w("b", 9), w("c", 5)], null)).toBe("b");
  });

  it("skips last week's winner for the runner-up", () => {
    expect(pickTownOfWeek([w("a", 3), w("b", 9), w("c", 5)], "b")).toBe("c");
  });

  it("breaks ties by the earlier first visit", () => {
    const rows = [w("a", 5, "2026-09-16T10:00:00Z"), w("b", 5, "2026-09-15T10:00:00Z")];
    expect(pickTownOfWeek(rows, null)).toBe("b");
  });

  it("lets the staff pick win", () => {
    expect(pickTownOfWeek([w("a", 9)], null, "z")).toBe("z");
    expect(pickTownOfWeek([w("a", 9)], "z", "z")).toBe("z");
  });

  it("returns null without visitors", () => {
    expect(pickTownOfWeek([], null)).toBeNull();
    expect(pickTownOfWeek([w("a", 0)], null)).toBeNull();
    expect(pickTownOfWeek([w("a", 4)], "a")).toBeNull();
  });
});
