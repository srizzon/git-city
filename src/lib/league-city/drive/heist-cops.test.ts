import { describe, expect, it } from "vitest";
import { COPS, FlowField, lineOfSight, newCar, roleOf, spawnSpot, stepCop, stepGang, type Car, type CopWorld, type Quarry } from "./heist-cops";

// A made-up city: a building on every lot except streets every 3rd row and
// column (so blocks of 2×2 buildings), lots of 20 m. Cars run at 60 fps.
const LOT = 20;
const street = (n: number) => ((n % 3) + 3) % 3 === 0;
function city(open: Set<string> = new Set()): CopWorld {
  return { lotM: LOT, blocked: (x, z) => !(street(x) || street(z)) && !open.has(`${x},${z}`) };
}
const DT = 1 / 60;
const lotOf = (m: number) => Math.round(m / LOT);

function chase(world: CopWorld, q: Quarry, stars: number, cars: Car[], seconds: number, move?: (q: Quarry, dt: number) => void) {
  const field = new FlowField();
  let t = 0;
  const log = { minGap: Infinity, closest: Infinity, inBuilding: 0, retired: 0 };
  for (let f = 0; f < seconds * 60; f++) {
    t += DT * 1000;
    move?.(q, DT);
    if (t - field.builtAt >= COPS.fieldEveryMs) field.build(world, q.x, q.z, t);
    for (const c of cars) {
      if (stepCop(c, q, stars, world, field, cars, t, DT)) log.retired++;
      const lx = lotOf(c.x);
      const lz = lotOf(c.z);
      if (world.blocked(lx, lz) && !(lx === lotOf(q.x) && lz === lotOf(q.z))) log.inBuilding++;
      log.closest = Math.min(log.closest, Math.hypot(c.x - q.x, c.z - q.z));
    }
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++) log.minGap = Math.min(log.minGap, Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z));
  }
  return log;
}

describe("flow field", () => {
  it("leads round the buildings to the player, the player's own lot free", () => {
    const w = city();
    const f = new FlowField(10);
    f.build(w, 1 * LOT, 1 * LOT, 0); // the player on a building lot
    expect(f.at(1, 1)).toBe(0);
    expect(f.at(2, 2)).toBe(-1); // a building
    expect(f.at(0, 1)).toBe(1);
    expect(f.at(6, 0)).toBeGreaterThan(5);
    expect(f.step(6, 0)).toEqual([5, 0]);
  });

  it("sees down a street, not through a block", () => {
    const w = city();
    expect(lineOfSight(w, 0, 0, 6 * LOT, 0)).toBe(true);
    expect(lineOfSight(w, 0, 0, 3 * LOT, 3 * LOT)).toBe(false);
  });
});

describe("cops", () => {
  it("reach a player smashing inside a block within 10 s, round the buildings", () => {
    const w = city();
    const q: Quarry = { x: 4 * LOT, z: 4 * LOT, vx: 0, vz: 0, h: 0 };
    const cars = [newCar("a", roleOf(0, 2), 0, -3 * LOT, 0, 0), newCar("b", roleOf(1, 2), 9 * LOT, 0, Math.PI, 0)];
    const log = chase(w, q, 2, cars, 10);
    expect(log.closest).toBeLessThan(8);
    expect(log.inBuilding).toBe(0);
    expect(log.retired).toBe(0);
  });

  it("keep apart instead of stacking up", () => {
    const w = city();
    const q: Quarry = { x: 0, z: 6 * LOT, vx: 0, vz: 0, h: 0 };
    const cars = [0, 1, 2, 3].map((i) => newCar(`c${i}`, roleOf(i, 4), (i - 1.5) * 4, 0, 0, 0));
    const log = chase(w, q, 4, cars, 8);
    expect(log.minGap).toBeGreaterThan(3);
  });

  it("a boosting player gets away; at one star a cop follows without catching up", () => {
    const w = city();
    const away: Quarry = { x: 0, z: 0, vx: 0, vz: 35, h: 0 };
    const cop = [newCar("a", "chase", 0, -40, 0, 0)];
    chase(w, away, 4, cop, 4, (q, dt) => (q.z += q.vz * dt));
    expect(away.z - cop[0].z).toBeGreaterThan(60);

    const slow: Quarry = { x: 0, z: 0, vx: 0, vz: 10, h: 0 };
    const tail = [newCar("t", "chase", 0, -80, 0, 0)];
    const log = chase(w, slow, 1, tail, 12, (q, dt) => (q.z += q.vz * dt));
    expect(log.closest).toBeGreaterThan(COPS.followGap * 0.6);
    expect(Math.hypot(slow.x - tail[0].x, slow.z - tail[0].z)).toBeLessThan(COPS.followGap + 20);
  });

  it("the blocker gets ahead of you and stops across the street", () => {
    const w = city();
    const q: Quarry = { x: 0, z: 0, vx: 0, vz: 8, h: 0 };
    const b = [newCar("b", "block", 0, 70, Math.PI, 0)];
    chase(w, q, 3, b, 6, (qq, dt) => (qq.z += qq.vz * dt));
    expect(b[0].z - q.z).toBeGreaterThan(5);
    expect(Math.abs(b[0].v)).toBeLessThan(3);
  });

  it("a car left far behind is handed back", () => {
    const w = city();
    const q: Quarry = { x: 0, z: 0, vx: 0, vz: 0, h: 0 };
    const far = [newCar("f", "chase", 0, -400, 0, 0)];
    expect(chase(w, q, 2, far, 0.1).retired).toBeGreaterThan(0);
  });
});

describe("spawning and the gang", () => {
  it("spawns on a free lot in the ring, behind the camera or ahead for the blocker", () => {
    const w = city();
    const f = new FlowField();
    const q: Quarry = { x: 0, z: 0, vx: 0, vz: 10, h: 0 };
    f.build(w, 0, 0, 0);
    const r = () => 0.5;
    const back = spawnSpot(w, f, q, 0, false, r)!;
    const front = spawnSpot(w, f, q, 0, true, r)!;
    expect(w.blocked(lotOf(back.x), lotOf(back.z))).toBe(false);
    expect(back.z).toBeLessThan(0);
    expect(front.z).toBeGreaterThan(0);
    const d = Math.hypot(back.x, back.z);
    expect(d).toBeGreaterThan(COPS.spawnMin - LOT);
    expect(d).toBeLessThan(COPS.spawnMax + LOT);
  });

  it("the gang runs from a cop close by", () => {
    const w = city();
    const f = new FlowField();
    const cop: Quarry = { x: 0, z: 0, vx: 0, vz: 0, h: 0 };
    f.build(w, 0, 0, 0);
    const g = newCar("g", "chase", 0, 30, 0, 0);
    for (let i = 0; i < 120; i++) stepGang(g, cop, { x: 0, z: 0 }, w, f, [g], 17, i * 16, DT);
    expect(Math.hypot(g.x, g.z)).toBeGreaterThan(40);
  });
});
