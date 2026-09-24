import { describe, expect, it } from "vitest";
import {
  FLAG_BOOST,
  FLAG_HORN,
  SnapshotBuffer,
  carColor,
  decodeState,
  validBump,
  emptySnapshot,
  encodeState,
  guestName,
  validName,
  type CarSnapshot,
} from "./net";

const snap = (over: Partial<CarSnapshot> = {}): CarSnapshot => ({ ...emptySnapshot(), ...over });

describe("state encoding", () => {
  it("round-trips a car state, rounded to millimeters", () => {
    const s = snap({ x: 12.34567, y: 0.4, z: -80.1, qy: 0.7071, qw: 0.7071, speed: 21.5, steer: -0.3, slip: 0.6, flags: FLAG_BOOST | FLAG_HORN });
    const d = decodeState(encodeState(s))!;
    expect(d.x).toBeCloseTo(12.346, 3);
    expect(d.z).toBeCloseTo(-80.1);
    expect(d.qy).toBeCloseTo(0.7071, 3);
    expect(d.flags).toBe(FLAG_BOOST | FLAG_HORN);
  });

  it("refuses junk: wrong length, NaN, strings, out of bounds, bad flags", () => {
    const good = encodeState(snap());
    expect(decodeState(good.slice(1))).toBeNull();
    expect(decodeState([NaN, ...good.slice(1)])).toBeNull();
    expect(decodeState(["1", ...good.slice(1)])).toBeNull();
    expect(decodeState([5000, ...good.slice(1)])).toBeNull();
    expect(decodeState([...good.slice(0, 10), 99])).toBeNull();
    expect(decodeState([...good.slice(0, 10), 1.5])).toBeNull();
    expect(decodeState([...good.slice(0, 3), 0, 0, 0, 0, ...good.slice(7)])).toBeNull(); // zero quaternion
  });
});

describe("names and colors", () => {
  it("accepts GitHub logins and guest names only", () => {
    expect(validName("srizzon")).toBe(true);
    expect(validName("a-b-c")).toBe(true);
    expect(validName(guestName())).toBe(true);
    expect(validName("<script>")).toBe(false);
    expect(validName("x".repeat(40))).toBe(false);
    expect(validName(42)).toBe(false);
  });

  it("gives each name a stable color, case-insensitive", () => {
    expect(carColor("srizzon")).toBe(carColor("SRizzon"));
    expect(carColor("srizzon")).toMatch(/^#[0-9a-f]{6}$/);
    const colors = new Set(["ana", "bob", "cid", "dan", "eve", "fay", "gus", "hal"].map(carColor));
    expect(colors.size).toBeGreaterThan(3);
  });
});

describe("interpolation", () => {
  it("lerps position and holds the ends", () => {
    const b = new SnapshotBuffer();
    b.push(1000, snap({ x: 0 }));
    b.push(1100, snap({ x: 10 }));
    const out = emptySnapshot();
    expect(b.sample(1050, out)!.x).toBeCloseTo(5);
    expect(b.sample(900, out)!.x).toBe(0);
    expect(b.sample(2000, out)!.x).toBe(10);
  });

  it("turns the short way round between quaternions", () => {
    const b = new SnapshotBuffer();
    b.push(0, snap({ qy: 0, qw: 1 }));
    b.push(100, snap({ qy: 0, qw: -1 })); // same rotation, opposite sign
    const out = b.sample(50, emptySnapshot())!;
    expect(Math.abs(out.qw)).toBeCloseTo(1);
  });

  it("keeps a bounded history", () => {
    const b = new SnapshotBuffer();
    for (let i = 0; i < 100; i++) b.push(i * 66, snap({ x: i }));
    expect(b.sample(0, emptySnapshot())!.x).toBe(80);
    expect(b.latest!.x).toBe(99);
  });
});

describe("bumps", () => {
  it("accepts a sane velocity change and caps a huge one", () => {
    expect(validBump(3, -4)).toEqual({ x: 3, z: -4 });
    const big = validBump(300, 400)!;
    expect(Math.hypot(big.x, big.z)).toBeCloseTo(25);
  });
  it("refuses junk", () => {
    expect(validBump(NaN, 1)).toBeNull();
    expect(validBump("1", 1)).toBeNull();
    expect(validBump(0, 0)).toBeNull();
  });
});
