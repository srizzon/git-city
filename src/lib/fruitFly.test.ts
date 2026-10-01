import { describe, expect, it } from "vitest";
import { FLY, ObstacleGrid, spawnFly, stepFly, type FlyMode, type FlyObstacle, type FlyState } from "./fruitFly";

// Deterministic RNG so runs are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A block of buildings laid out like the city's lots.
function block(): FlyObstacle[] {
  const out: FlyObstacle[] = [];
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      out.push({ x: i * 38, z: j * 32, hw: 12, hd: 10, h: 20 + ((i * 7 + j * 13) & 63) });
    }
  }
  return out;
}

// Only the grid cell under the fly: checking every building every step made
// the stress tests slow enough to time out alongside the rest of the suite.
function inside(f: FlyState, grid: ObstacleGrid) {
  return grid.near(f.x, f.z, 0, []).some((i) => {
    const o = grid.obstacles[i];
    return Math.abs(f.x - o.x) < o.hw && Math.abs(f.z - o.z) < o.hd && f.y < o.h - 0.01;
  });
}

describe("ObstacleGrid", () => {
  it("returns each nearby obstacle once and skips far ones", () => {
    const obstacles: FlyObstacle[] = [
      { x: 0, z: 0, hw: 100, hd: 100, h: 10 }, // spans many cells
      { x: 5000, z: 5000, hw: 5, hd: 5, h: 10 },
    ];
    const grid = new ObstacleGrid(obstacles, 32);
    expect(grid.near(0, 0, 150, [])).toEqual([0]);
    expect(grid.near(5000, 5000, 10, [])).toEqual([1]);
  });
});

describe("stepFly", () => {
  it("cruises, lands on roofs, takes off again and never enters a building", () => {
    const obstacles = block();
    const grid = new ObstacleGrid(obstacles);
    const rng = mulberry32(7);
    const flies = [spawnFly(0, 0, rng, grid), spawnFly(0, 0, rng, grid), spawnFly(0, 0, rng, grid)];
    const seen = new Set<FlyMode>();
    const dt = 1 / 60;
    let bad = 0;
    for (let t = 0; t < 60 * 120; t++) {
      for (const f of flies) {
        stepFly(f, dt, { grid, homeX: 0, homeZ: 0, flies, rng });
        seen.add(f.mode);
        if (!Number.isFinite(f.x + f.y + f.z) || inside(f, grid)) bad++;
        // Sitting exactly on the roof it picked.
        if (f.mode === "landed" && Math.abs(f.y - obstacles[f.perch].h) > 1e-5) bad++;
      }
    }
    expect(bad).toBe(0);
    expect([...seen].sort()).toEqual(["approach", "cruise", "landed", "landing", "takeoff"]);
  });

  it("keeps landing and never clips through random skylines", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = mulberry32(seed * 99);
      const obstacles: FlyObstacle[] = [];
      for (let i = -6; i <= 6; i++) {
        for (let j = -6; j <= 6; j++) {
          // Mostly low roofs with the odd tower, like the real city.
          obstacles.push({ x: i * 38, z: j * 32, hw: 6 + r() * 10, hd: 5 + r() * 9, h: 8 + r() * r() * 260 });
        }
      }
      const grid = new ObstacleGrid(obstacles);
      const rng = mulberry32(seed);
      const flies = [spawnFly(0, 0, rng, grid), spawnFly(0, 0, rng, grid), spawnFly(0, 0, rng, grid)];
      const prev = flies.map((f) => f.mode);
      let landings = 0, clipped = 0;
      for (let t = 0; t < 60 * 120; t++) {
        flies.forEach((f, k) => {
          stepFly(f, 1 / 60, { grid, homeX: 0, homeZ: 0, flies, rng });
          if (inside(f, grid)) clipped++;
          if (f.mode === "landed" && prev[k] !== "landed") landings++;
          prev[k] = f.mode;
        });
      }
      expect(clipped).toBe(0);
      expect(landings).toBeGreaterThan(5);
    }
  });

  it("flies around the plaza monument without landing on it or hugging its towers", () => {
    // The gate monument as measured in the running city: two 190-tall towers on
    // wide bases, thin posts, the plaza slab and the tilted sign's box.
    const landmark: FlyObstacle[] = [
      [160, 94, 124, 124, 30], [160, 94, 79, 79, 190], [175, 69, 9, 7, 165], [145, 120, 9, 7, 165],
      [-160, -94, 124, 124, 30], [-160, -94, 79, 79, 190], [-145, -120, 9, 7, 165], [-175, -69, 9, 7, 165],
      [40, -68, 337, 273, 12], [37, -63, 325, 255, 80], [40, -68, 302, 229, 77],
    ].map(([x, z, w, d, h]) => ({ x, z, hw: w / 2, hd: d / 2, h, perch: false }));
    // Ordinary buildings around it so there are roofs to land on.
    const buildings: FlyObstacle[] = [];
    for (let i = -6; i <= 6; i++) {
      for (let j = -6; j <= 6; j++) {
        if (Math.abs(i) <= 5 && Math.abs(j) <= 5) continue; // the plaza
        buildings.push({ x: i * 38, z: j * 32, hw: 12, hd: 10, h: 20 + ((i * 7 + j * 13) & 63) });
      }
    }
    const obstacles = [...buildings, ...landmark];
    const grid = new ObstacleGrid(obstacles);
    let clipped = 0, onLandmark = 0, longestHug = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed);
      const flies = [spawnFly(0, 0, rng, grid), spawnFly(0, 0, rng, grid), spawnFly(0, 0, rng, grid)];
      const hugging = flies.map(() => 0);
      for (let t = 0; t < 60 * 120; t++) {
        flies.forEach((f, k) => {
          stepFly(f, 1 / 60, { grid, homeX: 0, homeZ: 0, flies, rng });
          if (inside(f, grid)) clipped++;
          if (f.mode === "landed" && obstacles[f.perch].perch === false) onLandmark++;
          // Rising with almost no forward speed: hovering up a wall.
          const hug = (f.mode === "cruise" || f.mode === "approach") && Math.hypot(f.vx, f.vz) < 4 && f.vy > 5;
          hugging[k] = hug ? hugging[k] + 1 : 0;
          longestHug = Math.max(longestHug, hugging[k]);
        });
      }
    }
    expect(clipped).toBe(0);
    expect(onLandmark).toBe(0);
    expect(longestHug).toBeLessThan(60 * 2);
  });

  it("stays roughly within its roaming area", () => {
    const grid = new ObstacleGrid([]);
    const rng = mulberry32(3);
    const f = spawnFly(1000, -500, rng);
    for (let t = 0; t < 60 * 60; t++) {
      stepFly(f, 1 / 60, { grid, homeX: 1000, homeZ: -500, flies: [f], rng });
      expect(Math.hypot(f.x - 1000, f.z + 500)).toBeLessThan(FLY.roam * 1.6);
      expect(f.y).toBeLessThan(FLY.maxAltitude + 30);
    }
  });

  it("respawns near home when the camera jumps far away", () => {
    const grid = new ObstacleGrid([]);
    const rng = mulberry32(1);
    const f = spawnFly(0, 0, rng, grid);
    stepFly(f, 1 / 60, { grid, homeX: 10_000, homeZ: 10_000, flies: [f], rng });
    expect(Math.hypot(f.x - 10_000, f.z - 10_000)).toBeLessThanOrEqual(FLY.roam);
  });
});
