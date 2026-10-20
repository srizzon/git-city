import { describe, expect, it } from "vitest";
import { betHost, countedVoter, launchWeekFor, opensText, slotWeekOf, linkRules, normalizeRepo, normalizeUrl, podium, projectSlug, readProjectInput, textRules, timeLeft, weekClosesAt } from "./brasil-projects";

describe("normalizeUrl", () => {
  it("keeps https links, upgrades http and bare domains, drops the fragment and trailing slash", () => {
    expect(normalizeUrl("https://Pixquery.dev/")).toEqual({ url: "https://pixquery.dev", host: "pixquery.dev" });
    expect(normalizeUrl("http://cepzin.com.br/docs#api")).toEqual({ url: "https://cepzin.com.br/docs", host: "cepzin.com.br" });
    expect(normalizeUrl("tabnews.com.br")).toEqual({ url: "https://tabnews.com.br", host: "tabnews.com.br" });
  });
  it("refuses IPs, ports, logins, local hosts and other schemes", () => {
    for (const bad of ["http://10.0.0.1", "https://site.com:8080", "https://a:b@site.com", "https://localhost", "ftp://site.com", "javascript:alert(1)", ""]) {
      expect("error" in normalizeUrl(bad)).toBe(true);
    }
  });
});

describe("normalizeRepo", () => {
  it("reads any form of a GitHub repo link", () => {
    expect(normalizeRepo("github.com/srizzon/git-city")).toBe("https://github.com/srizzon/git-city");
    expect(normalizeRepo("https://www.github.com/srizzon/git-city.git")).toBe("https://github.com/srizzon/git-city");
    expect(normalizeRepo("https://github.com/srizzon/git-city/")).toBe("https://github.com/srizzon/git-city");
  });
  it("refuses anything else", () => {
    expect(normalizeRepo("https://gitlab.com/a/b")).toBeNull();
    expect(normalizeRepo("https://github.com/srizzon")).toBeNull();
  });
});

describe("linkRules", () => {
  const rule = (u: string) => {
    const n = normalizeUrl(u);
    if ("error" in n) throw new Error(n.error);
    return linkRules(n.url, n.host);
  };
  it("refuses shorteners, chat links and files", () => {
    expect(rule("https://bit.ly/abc").verdict).toBe("reject");
    expect(rule("https://wa.me/5511999").verdict).toBe("reject");
    expect(rule("https://site.com/app.apk").verdict).toBe("reject");
  });
  it("refuses betting domains", () => {
    for (const host of ["pixbet.com", "bet365.com", "brazino777.com", "fortune-tigrinho.net", "cassinopix.com", "www.slots-br.io"]) {
      expect(rule(`https://${host}`).category).toBe("gambling");
    }
  });
  it("lets real projects through", () => {
    for (const host of ["alphabet.com", "better-auth.com", "beta.app.dev", "tibet.org", "cepzin.com.br", "github.com"]) {
      expect(rule(`https://${host}`).verdict).toBe("approve");
    }
  });
});

describe("betHost", () => {
  it("reads a domain's labels", () => {
    expect(betHost("vai-de-bet.com")).toBe(true);
    expect(betHost("betterstack.com")).toBe(false);
  });
});

describe("textRules", () => {
  it("sends gambling and get-rich lines to review", () => {
    expect(textRules("Ganhe dinheiro com o jogo do tigrinho").verdict).toBe("review");
    expect(textRules("Renda extra todo dia no pix").verdict).toBe("review");
  });
  it("lets a normal tagline through", () => {
    expect(textRules("Book a time slot with your team").verdict).toBe("approve");
    expect(textRules("SQL for your Pix statements").verdict).toBe("approve");
  });
});

describe("readProjectInput", () => {
  const ok = { name: "pixquery", tagline: "SQL for your Pix statements", description: "", url: "pixquery.dev", repo: "", category: "devtool" };
  it("reads a good form", () => {
    expect(readProjectInput(ok)).toEqual({ input: { name: "pixquery", tagline: "SQL for your Pix statements", description: "", url: "https://pixquery.dev", repo: null, category: "devtool" } });
  });
  it("names what's wrong", () => {
    expect(readProjectInput({ ...ok, name: "" })).toEqual({ error: "Give it a name." });
    expect(readProjectInput({ ...ok, category: "casino" })).toEqual({ error: "Pick a category." });
    expect(readProjectInput({ ...ok, repo: "gitlab.com/a/b" })).toEqual({ error: "The repo has to be a github.com/owner/name link." });
    expect(readProjectInput({ ...ok, tagline: "x".repeat(81) })).toEqual({ error: "The tagline fits 80 characters." });
  });
});

describe("countedVoter", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  it("counts an account 30 days old with contributions", () => {
    expect(countedVoter({ account_created_at: "2026-09-01T00:00:00Z", contributions: 3 }, now)).toBe(true);
  });
  it("doesn't count a new account, an inactive one, or one we know nothing about", () => {
    expect(countedVoter({ account_created_at: "2026-10-10T00:00:00Z", contributions: 300 }, now)).toBe(false);
    expect(countedVoter({ account_created_at: "2020-01-01T00:00:00Z", contributions: 0 }, now)).toBe(false);
    expect(countedVoter({ account_created_at: null, contributions: 10 }, now)).toBe(false);
  });
});

describe("podium", () => {
  it("most votes first, the earlier launch wins a tie, no zero-vote winners", () => {
    const rows = [
      { id: "a", votes: 5, liveAt: 3 },
      { id: "b", votes: 9, liveAt: 2 },
      { id: "c", votes: 5, liveAt: 1 },
      { id: "d", votes: 4, liveAt: 0 },
      { id: "e", votes: 0, liveAt: 0 },
    ];
    expect(podium(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(podium([{ id: "x", votes: 0, liveAt: 1 }])).toEqual([]);
  });
});

describe("weeks and slugs", () => {
  it("a week closes the next Monday 00:00 UTC", () => {
    expect(new Date(weekClosesAt("2026-10-19")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(timeLeft("2026-10-19", Date.parse("2026-10-21T00:00:00Z"))).toBe("5d left");
    expect(timeLeft("2026-10-19", Date.parse("2026-10-25T20:00:00Z"))).toBe("4h left");
  });
  it("slugs are plain ascii", () => {
    expect(projectSlug("Cãozinho App!", "x7")).toBe("caozinho-app-x7");
    expect(projectSlug("🔥", "x7")).toBe("project-x7");
  });
});

describe("launchWeekFor and slots", () => {
  it("a project going live early in the week competes in it", () => {
    expect(launchWeekFor(new Date("2026-10-21T12:00:00Z"))).toBe("2026-10-19");
  });
  it("in the last 24 hours it competes the next week", () => {
    expect(launchWeekFor(new Date("2026-10-25T20:00:00Z"))).toBe("2026-10-26");
    expect(launchWeekFor(new Date("2026-10-24T23:00:00Z"))).toBe("2026-10-19");
  });
  it("a project's slot is the week it competes in, or would have when posted", () => {
    expect(slotWeekOf({ launch_week: "2026-10-19", created_at: "2026-10-25T23:00:00Z" })).toBe("2026-10-19");
    expect(slotWeekOf({ launch_week: null, created_at: "2026-10-25T23:00:00Z" })).toBe("2026-10-26");
  });
  it("says when a week opens in Brasília", () => {
    expect(opensText("2026-10-26", Date.parse("2026-10-23T00:00:00Z"))).toBe("Sun 21:00 (Brasília) · in 3d");
  });
});
