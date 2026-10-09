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
  it("is a letter from Samuel with one button", () => {
    const e = TOWNS_LAUNCH.render("announce", ctx);
    expect(e.subject).toBe("Git City Towns is live");
    expect(e.text).toContain("Now I'm launching Git City Towns");
    expect(e.text).toContain("What's a town");
    expect(e.text).toContain("Create a town for your crew:");
    expect(e.text).toContain("Hey @octocat,");
    expect(e.text).toContain("Today 87,600 developers have a building in it, you included.");
    expect(e.text).toContain("Samuel");
    expect(e.html.match(/Pick my side/g)).toHaveLength(1);
  });

  it("covers what a town is, the battle, smash, the prize and the live count", () => {
    const e = TOWNS_LAUNCH.render("announce", ctx);
    for (const s of ["The first battle", "The prize", "Right now"]) expect(e.html).toContain(s);
    expect(e.text).toContain("Firecrawl gives 2,500 credits to each of the top 5 players every week.");
    expect(e.html).toContain("/towns/opengraph-image");
    expect(e.html).toContain("/demolished-image");
  });

  it("dates the war as a start before Oct 12 and as a fact after", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    expect(TOWNS_LAUNCH.render("announce", ctx).text).toContain("From Mon, Oct 12, everything you do in Git City scores");
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    expect(TOWNS_LAUNCH.render("announce", ctx).text).toContain("Since Oct 12, everything you do in Git City scores");
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
