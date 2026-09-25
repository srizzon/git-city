import { describe, expect, it } from "vitest";
import { freshQuest, nextStep, parseQuest, questSteps } from "./quest";

describe("town quest", () => {
  it("reads what was stored and nothing else", () => {
    expect(parseQuest(null)).toBeNull();
    expect(parseQuest("done")).toBeNull();
    expect(parseQuest("{bad")).toBeNull();
    expect(parseQuest(JSON.stringify({ drive: true, invite: "yes" }))).toEqual({ ...freshQuest(), drive: true });
  });

  it("lights the first step not done, in order, whatever order they happened", () => {
    const s = { ...freshQuest(), build: true, place: true };
    expect(nextStep(s, questSteps(true))).toBe("drive");
    expect(nextStep({ ...s, drive: true }, questSteps(true))).toBe("invite");
    expect(nextStep({ drive: true, build: true, place: true, invite: true }, questSteps(true))).toBeNull();
  });

  it("phones only invite", () => {
    expect(nextStep(freshQuest(), questSteps(false))).toBe("invite");
    expect(nextStep({ ...freshQuest(), invite: true }, questSteps(false))).toBeNull();
  });
});
