import { describe, expect, it } from "vitest";
import { LOT } from "./grid";
import { INTRO_SECONDS, INTRO_STYLES, introPath, type IntroFrame, type IntroPieces } from "./intro";

const pieces: IntroPieces = { h: 6, portal: [0, LOT / 2], tallest: 190 };
const end: IntroFrame = { pos: [-400, 440, 460], look: [0, 30, -264] };

describe("introPath", () => {
  it("ends every style exactly on the scene's camera frame", () => {
    for (const s of INTRO_STYLES) {
      const p = introPath(pieces, s, end);
      expect(p.pos.at(-1)).toEqual(end.pos);
      expect(p.look.at(-1)).toEqual(end.look);
      expect(p.pos).toHaveLength(p.look.length);
      expect(p.duration).toBe(INTRO_SECONDS[s]);
    }
  });

  it("keeps it calm: few waypoints, at least 8 seconds", () => {
    for (const s of INTRO_STYLES) {
      const p = introPath(pieces, s, end);
      expect(p.pos.length).toBeLessThanOrEqual(6);
      expect(p.duration).toBeGreaterThanOrEqual(8);
    }
  });

  it("arrival goes low through the gate, then back above the rooftops", () => {
    const p = introPath(pieces, "arrival", end);
    const through = p.pos.findIndex(([, y, z]) => y < 20 && z < LOT / 2);
    expect(through).toBeGreaterThan(0);
    expect(p.pos[through + 1][1]).toBeGreaterThanOrEqual(250);
  });

  it("reveal starts facing the portal sign", () => {
    const p = introPath(pieces, "reveal", end);
    expect(p.look[0]).toEqual([0, 34, LOT / 2]);
    expect(p.pos[0][2]).toBeGreaterThan(LOT / 2);
  });

  it("orbit stays on the frame's circle while it comes down", () => {
    const p = introPath(pieces, "orbit", end);
    expect(p.pos[0][1]).toBeGreaterThan(end.pos[1]);
  });
});
