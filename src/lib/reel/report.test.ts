import { describe, expect, it } from "vitest";
import { fillLog, weeklyReport, type PostRow, type StatRow } from "./report";

const post = (id: string, kind: "main" | "trial", hook: string, preset = "race"): PostRow => ({
  media_id: id,
  spec_id: `2026-10-20-${id}`,
  kind,
  permalink: null,
  preset,
  hook,
  opening_scene: "overview",
  length_s: 18,
  bed: "lofi-up-1.mp3",
  graduated: false,
  posted_at: "2026-10-20T15:00:00Z",
});
const stat = (id: string, views: number, reach: number, skip: number, devs: number): StatRow => ({
  media_id: id,
  taken_at: "2026-10-22T15:00:00Z",
  views,
  reach,
  likes: 1,
  comments: 10,
  shares: 2,
  saved: 3,
  avg_watch_ms: 12000,
  skip_rate: skip,
  devs_placed: devs,
});

describe("weeklyReport", () => {
  it("ranks a day's trials by who kept people past 3s, naming what each changed", () => {
    const md = weeklyReport(
      "2026-10-20",
      [post("main", "main", "11 devs"), post("t1", "trial", "orbit", "trial:shot"), post("t2", "trial", "Esse cara governa SP", "trial:voice")],
      [stat("main", 1000, 800, 45, 30), stat("t1", 900, 600, 50, 10), stat("t2", 900, 600, 30, 10)],
    );
    expect(md).toContain('1. voice: "Esse cara governa SP": 30% skipped in 3s');
    expect(md).toContain('2. shot: "orbit": 50% skipped in 3s');
    expect(md).toContain("3 reels, 2,800 views, 50 devs");
    expect(md.slice(md.indexOf("## Formats"))).not.toContain("trial:");
  });
});

describe("fillLog", () => {
  it("fills a posted reel's row with its date and 48h numbers", () => {
    const log = "| 04 | 2026-10-20 | race (main) | 04-2026-10-20-main | not yet | | 18s |";
    expect(fillLog(log, [post("main", "main", "11 devs")], [stat("main", 1000, 800, 45, 30)])).toBe(
      "| 04 | 2026-10-20 | race (main) | 04-2026-10-20-main | 2026-10-20 | 1,000 views, 10 comments, 30 new devs, 45% skipped in 3s | 18s |",
    );
  });
});
