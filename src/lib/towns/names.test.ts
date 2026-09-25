import { describe, expect, it } from "vitest";
import { townDisplayName } from "./names";

describe("townDisplayName", () => {
  it("adds Town", () => {
    expect(townDisplayName("Acme")).toBe("Acme Town");
    expect(townDisplayName("  Rust Gang ")).toBe("Rust Gang Town");
  });

  it("keeps a name that already ends in Town", () => {
    expect(townDisplayName("Pixel Town")).toBe("Pixel Town");
    expect(townDisplayName("pixel town")).toBe("pixel town");
  });

  it("only matches the whole word", () => {
    expect(townDisplayName("Downtown")).toBe("Downtown Town");
  });
});
