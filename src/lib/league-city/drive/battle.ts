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

export const BATTLE_ITEMS = ["shock", "bomb", "missile"] as const;
export type BattleItem = (typeof BATTLE_ITEMS)[number];

export const ITEM_NAMES: Record<BattleItem, string> = {
  shock: "Shockwave",
  bomb: "Bomb",
  missile: "Missile",
};

export const BOX_COUNT = 12;
/** A taken box comes back this much later (ms). */
export const BOX_RESPAWN_MS = 6000;
/** Drive within this of a box (m) to take it. */
export const BOX_REACH = 3;
/** One take, one use per this long per driver (ms). */
export const TAKE_MIN_MS = 400;
export const USE_MIN_MS = 400;

/** Blast: shove (m/s, sideways) and lift (m/s, up) at the center, fading to 40% at the edge. */
export const SHOCK = { radius: 16, push: 14, lift: 11, life: 0.8 };
/** Dropped behind you; arms after `arm` s; whoever comes within `trigger` m goes up. */
export const BOMB = { trigger: 4.5, arm: 0.8, life: 30, radius: 7, push: 12, lift: 12 };
/** Fired ahead; turns toward its target at `turn` rad/s; explodes within `hitReach` m. */
export const MISSILE = { speed: 38, turn: 2.4, life: 3.5, hitReach: 2.6, push: 13, lift: 12, range: 140, cone: 0.8 };
/** Spin (N·m·s) a blast gives a car, so it tumbles. */
export const TUMBLE = 2600;
/** Your own bomb can't catch you for this long (s). */
export const OWN_BOMB_GRACE = 2;

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

/**
 * Velocity change (m/s: sideways x, z and up) a blast at (bx, bz) gives a car
 * at (x, z) within `radius`, or null when out of reach. Straight away from
 * the blast, strongest at the center.
 */
export function blastKick(
  bx: number,
  bz: number,
  x: number,
  z: number,
  blast: { radius: number; push: number; lift: number },
): [number, number, number] | null {
  const dx = x - bx;
  const dz = z - bz;
  const d = Math.hypot(dx, dz);
  if (d > blast.radius) return null;
  const k = 1 - (d / blast.radius) * 0.6;
  const [ux, uz] = d < 0.01 ? [1, 0] : [dx / d, dz / d];
  return [ux * blast.push * k, uz * blast.push * k, blast.lift * k];
}

/** The car a missile goes for: nearest within range inside the cone ahead of (x, z, dx, dz). */
export function missileTarget<T extends { id: string; x: number; z: number }>(x: number, z: number, dx: number, dz: number, cars: readonly T[]): T | null {
  let best: T | null = null;
  let bestD = MISSILE.range;
  for (const c of cars) {
    const ox = c.x - x;
    const oz = c.z - z;
    const d = Math.hypot(ox, oz);
    if (d < 0.5 || d > bestD) continue;
    const cos = (ox * dx + oz * dz) / d;
    if (cos < Math.cos(MISSILE.cone)) continue;
    bestD = d;
    best = c;
  }
  return best;
}

export interface MissileState {
  x: number;
  z: number;
  /** Heading, radians (atan2 of dx, dz). */
  h: number;
}

/** Move a missile one step toward (tx, tz), or straight on without a target. */
export function stepMissile(m: MissileState, target: { x: number; z: number } | null, dt: number): MissileState {
  let h = m.h;
  if (target) {
    const want = Math.atan2(target.x - m.x, target.z - m.z);
    const diff = Math.atan2(Math.sin(want - h), Math.cos(want - h));
    h += Math.max(-MISSILE.turn * dt, Math.min(MISSILE.turn * dt, diff));
  }
  return { x: m.x + Math.sin(h) * MISSILE.speed * dt, z: m.z + Math.cos(h) * MISSILE.speed * dt, h };
}
