import { describe, expect, it } from "vitest";
import { TOWN_REDIRECTS } from "./redirects";

// Mirrors Next's matching for these three shapes: an exact path, or a prefix
// followed by :slug* (zero or more segments).
function resolve(path: string): string | null {
  for (const r of TOWN_REDIRECTS) {
    if (r.source.endsWith("/:slug*")) {
      const base = r.source.slice(0, -"/:slug*".length);
      if (path === base) return r.destination.slice(0, -"/:slug*".length);
      if (path.startsWith(`${base}/`)) return r.destination.replace(":slug*", path.slice(base.length + 1));
    } else if (path === r.source) {
      return r.destination;
    }
  }
  return null;
}

describe("town redirects", () => {
  it("maps every old path to its town path", () => {
    expect(resolve("/leagues")).toBe("/towns");
    expect(resolve("/leagues/verify")).toBe("/towns/new?kind=company");
    expect(resolve("/towns/verify")).toBe("/towns/new?kind=company");
    expect(resolve("/league/acme")).toBe("/town/acme");
    expect(resolve("/league/acme/settings")).toBe("/town/acme/settings");
  });

  it("never redirects a new path", () => {
    for (const p of ["/towns", "/towns/new", "/town/acme", "/town/acme/settings", "/leaguers"]) {
      expect(resolve(p)).toBeNull();
    }
  });

  it("is permanent", () => {
    expect(TOWN_REDIRECTS.every((r) => r.permanent)).toBe(true);
  });
});
