import { describe, expect, it } from "vitest";
import { colleaguesLabel, companyStep, normalizeOrgInput, type OrgCheck } from "./company-step";

const base: OrgCheck = {
  org: "zard-ui",
  account: "org",
  townLabel: "Zard Town",
  avatarUrl: null,
  proof: "public",
  town: null,
  standing: "none",
  otherTown: null,
  colleagues: 3,
};
const town = { slug: "zard-ui", name: "Zard Town", buildings: 12, scoring: "xp" as const, isAdmin: false };

describe("normalizeOrgInput", () => {
  it.each([
    ["zard-ui", "zard-ui"],
    ["  @Zard-UI ", "zard-ui"],
    ["https://github.com/zard-ui", "zard-ui"],
    ["github.com/zard-ui/zard", "zard-ui"],
    ["https://github.com/orgs/zard-ui/people", "zard-ui"],
    ["www.github.com/zard-ui?tab=repos", "zard-ui"],
  ])("%s → %s", (raw, out) => {
    expect(normalizeOrgInput(raw)).toBe(out);
  });

  it.each(["", "   ", "-zard", "zard ui", "a".repeat(40), "https://gitlab.com/zard"])("rejects %j", (raw) => {
    expect(normalizeOrgInput(raw)).toBeNull();
  });
});

describe("companyStep", () => {
  it("has nothing to show before a check", () => {
    expect(companyStep(null)).toEqual({ kind: "none" });
  });

  it("names what GitHub said the login is", () => {
    expect(companyStep({ ...base, account: "none" }).kind).toBe("no_account");
    expect(companyStep({ ...base, account: "user" }).kind).toBe("person");
    expect(companyStep({ ...base, account: "error" }).kind).toBe("github_down");
  });

  it("asks for public membership when nothing proves it", () => {
    expect(companyStep({ ...base, proof: null }).kind).toBe("not_member");
    expect(companyStep({ ...base, proof: null, town, standing: "invited" }).kind).toBe("not_member");
  });

  it("builds a town that doesn't exist, with either proof", () => {
    expect(companyStep(base)).toEqual({ kind: "build", leaving: null });
    expect(companyStep({ ...base, proof: "private" })).toEqual({ kind: "build", leaving: null });
  });

  it("moves in to a town that exists", () => {
    expect(companyStep({ ...base, town })).toEqual({ kind: "move_in", invited: false, leaving: null });
    expect(companyStep({ ...base, town, standing: "invited" })).toEqual({ kind: "move_in", invited: true, leaving: null });
  });

  it("warns about the company town you'd leave", () => {
    const otherTown = { slug: "acme", name: "Acme Town" };
    expect(companyStep({ ...base, otherTown })).toEqual({ kind: "build", leaving: "Acme Town" });
    expect(companyStep({ ...base, town, otherTown })).toEqual({ kind: "move_in", invited: false, leaving: "Acme Town" });
  });

  it("opens the town for members, even without a fresh proof", () => {
    expect(companyStep({ ...base, town, standing: "member", proof: null })).toEqual({ kind: "open", slug: "zard-ui" });
    expect(companyStep({ ...base, town, standing: "member", otherTown: { slug: "zard-ui", name: "Zard Town" } })).toEqual({
      kind: "open",
      slug: "zard-ui",
    });
  });

  it("stops removed devs, proof or not", () => {
    expect(companyStep({ ...base, town, standing: "removed" }).kind).toBe("removed");
    expect(companyStep({ ...base, town, standing: "removed", proof: null }).kind).toBe("removed");
  });
});

describe("colleaguesLabel", () => {
  it("counts, with a cap", () => {
    expect(colleaguesLabel(1)).toBe("1 colleague");
    expect(colleaguesLabel(12)).toBe("12 colleagues");
    expect(colleaguesLabel(100)).toBe("100+ colleagues");
  });
});
