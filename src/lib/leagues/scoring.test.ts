import { describe, expect, it } from "vitest";
import {
  codePoints,
  detectOvertakes,
  gameXp,
  globalScore,
  isoDay,
  memberScore,
  rankStandings,
  weekDays,
  weekEnd,
  weekStart,
  type StandingInput,
  type XpRow,
} from "./scoring";

const xp = (source: string, amount: number, day = "2026-09-22"): XpRow => ({
  source,
  amount,
  created_at: `${day}T12:00:00+00:00`,
});

describe("codePoints", () => {
  it("gives 5 points per contribution", () => {
    expect(codePoints([{ day: "2026-09-21", contributions: 3 }])).toBe(15);
  });

  it("caps each day at 20 contributions", () => {
    expect(
      codePoints([
        { day: "2026-09-21", contributions: 50 },
        { day: "2026-09-22", contributions: 20 },
      ]),
    ).toBe(200);
  });

  it("maxes out at 700 for a week", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ day: `2026-09-2${i + 1}`, contributions: 999 }));
    expect(codePoints(days)).toBe(700);
  });

  it("ignores negative counts", () => {
    expect(codePoints([{ day: "2026-09-21", contributions: -4 }])).toBe(0);
  });
});

describe("gameXp", () => {
  it("caps a source per day", () => {
    expect(gameXp([xp("checkin", 10), xp("checkin", 10)])).toBe(10);
  });

  it("resets the cap on a new UTC day", () => {
    expect(gameXp([xp("checkin", 10, "2026-09-21"), xp("checkin", 10, "2026-09-22")])).toBe(20);
  });

  it("shares one cap across grouped sources", () => {
    expect(gameXp([xp("kudos_given", 10), xp("kudos_received", 10)])).toBe(15);
    expect(gameXp([xp("raid_win", 100), xp("raid_defend", 100)])).toBe(150);
  });

  it("excludes one-off sources", () => {
    const rows = ["github", "league_win", "achievement", "emblem", "career_profile", "job_apply", "referral", "referral_converted", "survey", "event_reward"].map(
      (s) => xp(s, 500),
    );
    expect(gameXp(rows)).toBe(0);
  });

  it("sums different sources", () => {
    expect(gameXp([xp("dailies", 25), xp("fly", 30), xp("visit", 5)])).toBe(60);
  });
});

describe("memberScore", () => {
  const days = [{ day: "2026-09-22", contributions: 4 }];
  const rows = [xp("dailies", 25)];

  it("adds game XP in xp mode", () => {
    expect(memberScore("xp", days, rows)).toEqual({ codePoints: 20, gameXp: 25, total: 45 });
  });

  it("uses code points only in contributions mode", () => {
    expect(memberScore("contributions", days, rows)).toEqual({ codePoints: 20, gameXp: 0, total: 20 });
  });
});

describe("globalScore", () => {
  it("needs 3 active members", () => {
    expect(globalScore([100, 200])).toBeNull();
    expect(globalScore([])).toBeNull();
  });

  it("averages per active member", () => {
    expect(globalScore([100, 200, 300])).toBe(200);
  });
});

describe("weekStart", () => {
  it("maps Sunday 23:59 UTC to the Monday before", () => {
    expect(isoDay(weekStart(new Date("2026-09-27T23:59:59Z")))).toBe("2026-09-21");
  });

  it("maps Monday 00:00 UTC to the same Monday", () => {
    expect(isoDay(weekStart(new Date("2026-09-28T00:00:00Z")))).toBe("2026-09-28");
  });

  it("uses UTC, not local time", () => {
    expect(isoDay(weekStart(new Date("2026-09-27T23:30:00-03:00")))).toBe("2026-09-28");
  });

  it("has a 7-day exclusive end", () => {
    const start = weekStart(new Date("2026-09-23T10:00:00Z"));
    expect(weekEnd(start).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(weekDays(start)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });
});

describe("rankStandings", () => {
  const entry = (id: number, total: number, cp: number, joined: string | null): StandingInput => ({
    developer_id: id,
    total,
    codePoints: cp,
    gameXp: total - cp,
    joined_at: joined,
  });

  it("sorts by total", () => {
    const r = rankStandings([entry(1, 10, 10, null), entry(2, 30, 0, null)]);
    expect(r.map((e) => [e.developer_id, e.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it("breaks ties by code points, then earlier joined_at", () => {
    const r = rankStandings([
      entry(1, 50, 10, "2026-01-01T00:00:00Z"),
      entry(2, 50, 40, "2026-06-01T00:00:00Z"),
      entry(3, 50, 10, "2025-12-01T00:00:00Z"),
    ]);
    expect(r.map((e) => e.developer_id)).toEqual([2, 3, 1]);
  });

  it("puts a missing joined_at last on a full tie", () => {
    const r = rankStandings([entry(1, 5, 5, null), entry(2, 5, 5, "2026-01-01T00:00:00Z")]);
    expect(r.map((e) => e.developer_id)).toEqual([2, 1]);
  });
});

describe("detectOvertakes", () => {
  const snap = (rows: [number, number][]) =>
    rankStandings(
      rows.map(([id, total]) => ({ developer_id: id, total, codePoints: total, gameXp: 0, joined_at: null, login: `u${id}` })),
    );

  it("reports who passed you", () => {
    const o = detectOvertakes(snap([[1, 100], [2, 50]]), snap([[1, 100], [2, 140]]));
    expect(o).toEqual([{ developerId: 1, overtakerLogin: "u2", gap: 40, newRank: 2 }]);
  });

  it("stays quiet when nothing changed", () => {
    expect(detectOvertakes(snap([[1, 100], [2, 50]]), snap([[1, 110], [2, 60]]))).toEqual([]);
  });

  it("ignores passes below the top 5 when you kept your rank", () => {
    const base: [number, number][] = [[1, 900], [2, 800], [3, 700], [4, 600], [5, 500], [6, 400], [7, 300], [8, 200]];
    const prev = snap(base);
    // 8 jumps over 7 and 6; 6 drops to 7th, 7 drops to 8th.
    const next = snap([...base.slice(0, 7), [8, 450]]);
    const ids = detectOvertakes(prev, next).map((o) => o.developerId);
    expect(ids).toEqual([6, 7]);
  });

  it("names the closest passer", () => {
    const o = detectOvertakes(snap([[1, 100], [2, 50], [3, 40]]), snap([[1, 100], [2, 300], [3, 200]]));
    expect(o.find((x) => x.developerId === 1)?.overtakerLogin).toBe("u3");
  });
});
