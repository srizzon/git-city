import { describe, expect, it, vi } from "vitest";
import { TOWNS_LAUNCH } from "./towns-launch";
import type { CampaignRenderContext } from "./types";

const ctx: CampaignRenderContext = {
  login: "octocat",
  links: {},
  confirmUrl: "https://thegitcity.com/confirm?t=x",
  stats: { buildings: 87600 },
};

const VARIANTS = ["announce", "repermission"] as const;

describe("towns launch copy", () => {
  it("asks one question and has one button in the announce email", () => {
    const e = TOWNS_LAUNCH.render("announce", ctx);
    expect(e.subject).toBe("Claude or Codex?");
    expect(e.text).toContain("The side with the most points per player wins the week.");
    expect(e.text).toContain("You can only pick one, and it's yours for the week.");
    expect(e.text).toContain("Pick my side:");
    expect(e.html.match(/Pick my side/g)).toHaveLength(1);
  });

  it("names the weekly Firecrawl prize and the smaller-side bonus", () => {
    const e = TOWNS_LAUNCH.render("announce", ctx);
    expect(e.preheader).toBe("Pick a side. The top 5 players each week win Firecrawl credits.");
    expect(e.text).toContain("The top 5 players each week win 2,500 Firecrawl credits. The smaller side gets bonus prize points.");
  });

  it("dates the war as a start before Oct 12 and as a fact after", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    expect(TOWNS_LAUNCH.render("announce", ctx).text).toContain("Starts Mon, Oct 12.");
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    expect(TOWNS_LAUNCH.render("announce", ctx).text).toContain("Started Oct 12.");
    vi.useRealTimers();
  });

  it("never says Monday or that coding decides the war", () => {
    for (const v of VARIANTS) {
      const e = TOWNS_LAUNCH.render(v, ctx);
      const all = [e.subject, e.preheader, e.text, e.html].join("\n");
      expect(all).not.toMatch(/Monday/);
      expect(all).not.toMatch(/codes? more/);
    }
  });
});
