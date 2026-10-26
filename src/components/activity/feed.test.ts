import { describe, expect, it } from "vitest";
import { formatEvent, type FeedEvent } from "./feed";

const dev = (login: string) => ({ login, avatar_url: null });

const event = (
  event_type: string,
  opts: { actor?: string | null; target?: string | null; metadata?: Record<string, unknown> } = {},
): FeedEvent => ({
  id: "1",
  event_type,
  actor_id: opts.actor ? 1 : null,
  target_id: opts.target ? 2 : null,
  metadata: opts.metadata ?? {},
  created_at: "2026-10-19T12:00:00Z",
  actor: opts.actor ? dev(opts.actor) : null,
  target: opts.target ? dev(opts.target) : null,
});

const highlight = (actor: string | null, name: string, value?: unknown) =>
  event("dev_highlight", { actor, metadata: { highlight: name, value } });

describe("formatEvent: the viewer as the subject", () => {
  it("default: 'you are active', not 'you is active'", () => {
    expect(formatEvent(event("something_new", { actor: "me" }), "me")).toBe(
      "You are active in the city",
    );
  });

  it("dev_highlight default: 'you are in the city'", () => {
    expect(formatEvent(highlight("me", "unknown"), "me")).toBe("You are in the city");
  });

  it("dev_highlight contributions: 'you have'", () => {
    expect(formatEvent(highlight("me", "contributions", 1234), "me")).toBe(
      `You have ${(1234).toLocaleString()} contributions`,
    );
  });

  it("dev_highlight stars: 'you have' and 'your repos'", () => {
    expect(formatEvent(highlight("me", "stars", 50), "me")).toBe(
      "You have 50 stars across your repos",
    );
  });

  it("dev_highlight streak: 'you are on a streak'", () => {
    expect(formatEvent(highlight("me", "streak", 7), "me")).toBe(
      "You are on a 7-day commit streak",
    );
  });

  it("dev_highlight language: 'you build', not 'you builds'", () => {
    expect(formatEvent(highlight("me", "language", "Rust"), "me")).toBe("You build with Rust");
  });

  it("dev_highlight repos: 'you have'", () => {
    expect(formatEvent(highlight("me", "repos", 12), "me")).toBe("You have 12 public repos");
  });

  it("building_claimed: 'your building', not 'their building'", () => {
    expect(formatEvent(event("building_claimed", { actor: "me" }), "me")).toBe(
      "You claimed your building",
    );
  });

  it("visit_milestone: 'your building', not \"you's building\"", () => {
    const e = event("visit_milestone", { actor: "me", metadata: { visit_count: 40 } });
    expect(formatEvent(e, "me")).toBe("Your building got 40 visits today");
  });

  it("visit_milestone with the viewer as the target", () => {
    const e = event("visit_milestone", { target: "me", metadata: { visit_count: 3 } });
    expect(formatEvent(e, "me")).toBe("Your building got 3 visits today");
  });
});

describe("formatEvent: the viewer as the target", () => {
  it("raid_success: 'raided your building', not \"you's building\"", () => {
    const e = event("raid_success", { actor: "rival", target: "me" });
    expect(formatEvent(e, "me")).toBe("@rival raided your building");
  });

  it("raid_success with the viewer as the attacker", () => {
    const e = event("raid_success", { actor: "me", target: "rival" });
    expect(formatEvent(e, "me")).toBe("You raided @rival's building");
  });

  it("kudos_given and referral keep 'you' as the object", () => {
    expect(formatEvent(event("kudos_given", { actor: "a", target: "me" }), "me")).toBe(
      "@a gave kudos to you",
    );
    expect(formatEvent(event("referral", { actor: "a", target: "me" }), "me")).toBe(
      "@a brought you to the city",
    );
  });
});

describe("formatEvent: past-tense branches stay untouched", () => {
  it.each([
    ["achievement_unlocked", { achievement_name: "First Blood" }, 'You unlocked "First Blood"'],
    ["achievement_unlocked", { count: 3 }, "You unlocked 3 achievements"],
    ["item_purchased", { item_id: "crown" }, "You bought crown"],
    ["item_equipped", { item_id: "crown" }, "You equipped crown"],
    ["dev_joined", {}, "You joined the city"],
    ["rank_up", { new_rank: 5 }, "You climbed to #5"],
    ["leaderboard_change", { position: 3 }, "You entered the top 3"],
    ["streak_checkin", { streak: 4 }, "You checked in (4-day streak)"],
    ["github_star_verified", {}, "You unlocked the GitHub Star"],
    ["drop_pulled", {}, "You pulled a reward drop"],
    ["dailies_completed", {}, "You completed today's missions"],
  ])("%s", (type, metadata, expected) => {
    expect(formatEvent(event(type, { actor: "me", metadata }), "me")).toBe(expected);
  });

  it("dev_highlight rank", () => {
    expect(formatEvent(highlight("me", "rank", 9), "me")).toBe("You ranked #9 in the city");
  });

  it("gift_sent and raid_failed", () => {
    const gift = event("gift_sent", { actor: "me", target: "b", metadata: { item_id: "aura" } });
    expect(formatEvent(gift, "me")).toBe("You gifted aura to @b");
    expect(formatEvent(event("raid_failed", { actor: "a", target: "me" }), "me")).toBe(
      "You defended against @a",
    );
    expect(formatEvent(event("raid_failed", { actor: "me", target: "b" }), "me")).toBe(
      "@b defended against you",
    );
  });
});

describe("formatEvent: other developers keep the third-person text", () => {
  const cases: [string, FeedEvent, string][] = [
    ["default", event("something_new", { actor: "dev" }), "@dev is active in the city"],
    ["highlight default", highlight("dev", "unknown"), "@dev is in the city"],
    ["contributions", highlight("dev", "contributions", 10), "@dev has 10 contributions"],
    ["stars", highlight("dev", "stars", 5), "@dev has 5 stars across their repos"],
    ["streak", highlight("dev", "streak", 2), "@dev is on a 2-day commit streak"],
    ["language", highlight("dev", "language", "Go"), "@dev builds with Go"],
    ["repos", highlight("dev", "repos", 8), "@dev has 8 public repos"],
    [
      "building_claimed",
      event("building_claimed", { actor: "dev" }),
      "@dev claimed their building",
    ],
    [
      "visit_milestone",
      event("visit_milestone", { target: "dev", metadata: { visit_count: 9 } }),
      "@dev's building got 9 visits today",
    ],
    [
      "raid_success",
      event("raid_success", { actor: "dev", target: "other" }),
      "@dev raided @other's building",
    ],
  ];

  it.each(cases)("%s, for an unrelated viewer", (_name, e, expected) => {
    expect(formatEvent(e, "me")).toBe(expected);
  });

  it.each(cases)("%s, with no viewer", (_name, e, expected) => {
    expect(formatEvent(e)).toBe(expected);
    expect(formatEvent(e, null)).toBe(expected);
  });
});

describe("formatEvent: missing logins and case", () => {
  it("falls back to 'someone' with the singular verb", () => {
    expect(formatEvent(event("something_new"), "me")).toBe("Someone is active in the city");
    expect(formatEvent(highlight(null, "contributions", 2), "me")).toBe(
      "Someone has 2 contributions",
    );
    expect(formatEvent(event("building_claimed"), "me")).toBe("Someone claimed their building");
    expect(formatEvent(event("visit_milestone"), "me")).toBe(
      "Someone's building got many visits today",
    );
  });

  it("matches the viewer login case-insensitively", () => {
    expect(formatEvent(event("something_new", { actor: "Me" }), "mE")).toBe(
      "You are active in the city",
    );
    expect(formatEvent(highlight("ME", "language", "C"), "me")).toBe("You build with C");
    expect(formatEvent(event("raid_success", { actor: "a", target: "Me" }), "ME")).toBe(
      "@a raided your building",
    );
  });

  it("resolves the login from metadata when the actor record is missing", () => {
    const e = event("something_new", { metadata: { login: "me" } });
    expect(formatEvent(e, "me")).toBe("You are active in the city");
  });

  it("keeps the handle's own casing for other developers", () => {
    expect(formatEvent(event("something_new", { actor: "MixedCase" }), "me")).toBe(
      "@MixedCase is active in the city",
    );
  });
});

describe("formatEvent: capitalization", () => {
  it("capitalizes a sentence that opens with 'your' or 'you'", () => {
    expect(formatEvent(event("visit_milestone", { actor: "me" }), "me")).toMatch(/^Your /);
    expect(formatEvent(event("something_new", { actor: "me" }), "me")).toMatch(/^You /);
  });

  it("leaves a handle-led sentence starting with '@'", () => {
    expect(formatEvent(event("something_new", { actor: "dev" }), "me")).toMatch(/^@dev /);
  });
});
