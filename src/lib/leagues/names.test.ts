import { describe, expect, it } from "vitest";
import { cleanLeagueName, companyLeagueName, isReservedSlug } from "./names";
import { LeagueError } from "./errors";

describe("cleanLeagueName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanLeagueName("  Night   Owls ")).toBe("Night Owls");
  });

  it("strips zero-width and bidi characters before checking the length", () => {
    expect(cleanLeagueName("Ni​ght‮ Owls﻿")).toBe("Night Owls");
    expect(() => cleanLeagueName("a​​​")).toThrow(LeagueError);
  });

  it("NFKC-normalizes lookalikes", () => {
    expect(cleanLeagueName("Ｎｉｇｈｔ Owls")).toBe("Night Owls");
  });

  it("rejects names out of range", () => {
    expect(() => cleanLeagueName("a")).toThrow(LeagueError);
    expect(() => cleanLeagueName("x".repeat(41))).toThrow(LeagueError);
  });
});

describe("companyLeagueName", () => {
  it("uses the cleaned display name", () => {
    expect(companyLeagueName("  Acme   Corp ", "acme")).toBe("Acme Corp");
  });

  it("falls back to the login when the name is rejected or missing", () => {
    expect(companyLeagueName("x".repeat(60), "acme")).toBe("acme");
    expect(companyLeagueName("​", "acme")).toBe("acme");
    expect(companyLeagueName(null, "acme")).toBe("acme");
  });
});

describe("isReservedSlug", () => {
  it("reserves app paths", () => {
    for (const s of ["verify", "api", "new", "create", "settings", "admin"]) expect(isReservedSlug(s)).toBe(true);
    expect(isReservedSlug("night-owls")).toBe(false);
  });
});
