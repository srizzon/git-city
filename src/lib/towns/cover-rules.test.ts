import { describe, expect, it } from "vitest";
import { COVER_EVERY_MS, coverDue } from "./cover-rules";

const now = new Date("2026-09-26T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("coverDue", () => {
  it("wants a first cover", () => {
    expect(coverDue({ path: null, version: null, pinned: false, at: null }, 3, now)).toBe(true);
  });
  it("never replaces a pinned cover", () => {
    expect(coverDue({ path: null, version: null, pinned: true, at: null }, 3, now)).toBe(false);
    expect(coverDue({ path: "a", version: 1, pinned: true, at: ago(COVER_EVERY_MS * 9) }, 3, now)).toBe(false);
  });
  it("retakes a day-old cover only when the city changed", () => {
    expect(coverDue({ path: "a", version: 3, pinned: false, at: ago(COVER_EVERY_MS * 9) }, 3, now)).toBe(false);
    expect(coverDue({ path: "a", version: 2, pinned: false, at: ago(COVER_EVERY_MS + 1) }, 3, now)).toBe(true);
    expect(coverDue({ path: "a", version: 2, pinned: false, at: ago(COVER_EVERY_MS - 1000) }, 3, now)).toBe(false);
  });
});
