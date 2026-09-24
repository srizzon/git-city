// ─── Drive battle ───────────────────────────────────────────
// Item boxes and attacks for league city driving. Shared by the PartyKit
// party (party/drive.ts) and the client, so relative imports only.
//
// Boxes: BOX_COUNT slots per room. The server owns each slot's generation
// and when it's available; every client works out where a slot's box sits
// from the city (road and plaza lots) and that generation, so all players
// see it in the same place without the server knowing the map.
//
// Attacks never destroy a car, they only get in the way. Each player's own
// client decides whether their car was caught (like bumps).

import { LOT } from "../grid";
import type { CityObject } from "../types";

export const BATTLE_ITEMS = ["shock", "smoke", "oil", "ball"] as const;
export type BattleItem = (typeof BATTLE_ITEMS)[number];

export const ITEM_NAMES: Record<BattleItem, string> = {
  shock: "Shockwave",
  smoke: "Smoke",
  oil: "Oil slick",
  ball: "Bouncy ball",
};

export const BOX_COUNT = 12;
/** A taken box comes back this much later (ms). */
export const BOX_RESPAWN_MS = 6000;
/** Drive within this of a box (m) to take it. */
export const BOX_REACH = 3;
/** One take, one use per this long per driver (ms). */
export const TAKE_MIN_MS = 400;
export const USE_MIN_MS = 400;

export const SHOCK = { radius: 14, push: 16, hop: 4, life: 0.7 };
export const SMOKE = { radius: 9, life: 7 };
export const OIL = { radius: 3.5, life: 25, spin: 1.3 };
export const BALL = { radius: 1.1, speed: 42, life: 2.5, hitReach: 2.4, push: 14, hop: 5, spin: 0.9 };

export function isItem(v: unknown): v is BattleItem {
  return typeof v === "string" && (BATTLE_ITEMS as readonly string[]).includes(v);
}

export function randomItem(random: () => number = Math.random): BattleItem {
  return BATTLE_ITEMS[Math.floor(random() * BATTLE_ITEMS.length) % BATTLE_ITEMS.length];
}

function hash(a: number, b: number): number {
  let h = 2166136261;
  h = Math.imul(h ^ a, 16777619);
  h = Math.imul(h ^ b, 16777619);
  h ^= h >>> 13;
  return (Math.imul(h, 0x5bd1e995) >>> 0) / 4294967296;
}

/** Lot centers where boxes may appear: roads, then plazas, in a stable order. */
export function boxSpots(objects: readonly Pick<CityObject, "item_type" | "x" | "z" | "px">[]): [number, number][] {
  const lots = objects
    .filter((o) => o.px === null && (o.item_type === "road" || o.item_type === "plaza"))
    .map((o) => [o.x, o.z] as [number, number]);
  lots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return lots;
}

/** Where box slot `slot` sits at generation `gen`, in meters, or null in a city with no roads or plazas. */
export function boxPosition(spots: readonly [number, number][], slot: number, gen: number, unitToM: number): [number, number] | null {
  if (spots.length === 0) return null;
  const [lx, lz] = spots[Math.floor(hash(slot, gen) * spots.length) % spots.length];
  // A little off the lot center so boxes on one lot don't stack.
  const ox = (hash(slot + 101, gen) - 0.5) * 16;
  const oz = (hash(slot + 211, gen) - 0.5) * 16;
  return [(lx * LOT + ox) * unitToM, (lz * LOT + oz) * unitToM];
}

/** A point on the ground (m) and a direction, or null when junk. */
export function validUse(x: unknown, z: unknown, dx: unknown, dz: unknown): { x: number; z: number; dx: number; dz: number } | null {
  const nums = [x, z, dx, dz];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [px, pz, vx, vz] = nums as number[];
  if (Math.abs(px) > 1000 || Math.abs(pz) > 1000) return null;
  const m = Math.hypot(vx, vz);
  if (m < 0.1) return null;
  return { x: px, z: pz, dx: vx / m, dz: vz / m };
}

/** Where a thrown ball is `t` seconds after launch. */
export function ballPosition(x: number, z: number, dx: number, dz: number, t: number): [number, number] {
  return [x + dx * BALL.speed * t, z + dz * BALL.speed * t];
}

/** Velocity change (m/s) a shockwave at (sx, sz) gives a car at (x, z), or null when out of reach. */
export function shockKick(sx: number, sz: number, x: number, z: number): [number, number] | null {
  const dx = x - sx;
  const dz = z - sz;
  const d = Math.hypot(dx, dz);
  if (d > SHOCK.radius) return null;
  // Stronger up close; straight away from the blast.
  const k = SHOCK.push * (1 - (d / SHOCK.radius) * 0.6);
  if (d < 0.01) return [k, 0];
  return [(dx / d) * k, (dz / d) * k];
}
