import { describe, expect, it } from "vitest";
import { isQualified } from "./visits";

const base = { signedIn: true, member: false, seconds: 0, drove: false };

describe("isQualified", () => {
  it("counts 30 seconds or a drive", () => {
    expect(isQualified({ ...base, seconds: 30 })).toBe(true);
    expect(isQualified({ ...base, seconds: 29 })).toBe(false);
    expect(isQualified({ ...base, drove: true })).toBe(true);
  });

  it("never counts members or signed-out visitors", () => {
    expect(isQualified({ ...base, member: true, seconds: 120, drove: true })).toBe(false);
    expect(isQualified({ ...base, signedIn: false, seconds: 120, drove: true })).toBe(false);
  });
});
