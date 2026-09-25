import { describe, expect, it } from "vitest";
import { LOT } from "./grid";
import { PORTAL } from "./identity-geometry";
import { introPath, introSeconds, type IntroFrame, type IntroPieces } from "./intro";

const pieces: IntroPieces = { h: 6, portal: [0, LOT / 2], tallest: 190 };
const end: IntroFrame = { pos: [-400, 440, 460], look: [0, 30, -264] };
const signY = PORTAL.height + PORTAL.beam / 2;

describe("introPath", () => {
  const [approach, orbit] = introPath(pieces, end).phases;

  it("approaches from far away at the sign's height, looking at the sign", () => {
    expect(approach.pos[0][2]).toBeGreaterThan(600);
    for (const [, y] of approach.pos) expect(Math.abs(y - signY)).toBeLessThanOrEqual(6);
    for (const l of approach.look) expect(l).toEqual([0, signY, LOT / 2]);
  });

  it("stops in front of the portal, never under or past it", () => {
    for (const [, , z] of approach.pos) expect(z).toBeGreaterThan(LOT / 2 + 40);
    expect(approach.ease).toBe("out");
    expect(approach.hold).toBeGreaterThan(0);
  });

  it("orbits from where the approach stopped to the scene's camera frame", () => {
    expect(orbit.pos[0]).toEqual(approach.pos.at(-1));
    expect(orbit.look[0]).toEqual(approach.look.at(-1));
    expect(orbit.pos.at(-1)).toEqual(end.pos);
    expect(orbit.look.at(-1)).toEqual(end.look);
  });

  it("turns more than half way round the town, above the rooftops mid-way", () => {
    const cx = 0;
    const cz = -5.5 * LOT;
    const angles = orbit.pos.map(([x, , z]) => Math.atan2(z - cz, x - cx));
    let swept = 0;
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1];
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      swept += d;
    }
    expect(Math.abs(swept)).toBeGreaterThan(Math.PI);
    expect(orbit.pos[Math.floor(orbit.pos.length / 2)][1]).toBeGreaterThan(190);
  });

  it("takes about 15 seconds, unhurried", () => {
    expect(introSeconds(introPath(pieces, end))).toBeGreaterThanOrEqual(13);
  });
});
