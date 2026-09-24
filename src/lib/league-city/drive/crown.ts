// ─── Crown Rush ─────────────────────────────────────────────
// Keep-away for league city driving, after Mario Kart's Shine Thief. The
// room server owns the match through this state machine; clients render it.
// Relative imports only (the PartyKit party bundles this file).
//
// - Anyone starts a match with 2+ drivers; a 3 s countdown, then the crown
//   appears at the spot the starter picked.
// - Each driver needs GOAL ms holding it in total. Losing it pauses your
//   count; if you lose it with less than FLOOR left, you're back to FLOOR.
// - A bump knocks the crown loose: it flies SCATTER m the way the bump
//   pushed (a blast throws it any way), and while it's in the air nobody
//   can take it. Like a Mario Kart hit, whoever lost it spins and can't take
//   it back for REGRAB ms, so the others get their chance. A bump with boost
//   steals it outright.
// - Right after a grab the holder can't lose it for IMMUNE ms.
// - Whoever reaches zero wins; after MATCH ms the one with the least left wins.

export const CROWN = {
  goal: 30_000,
  floor: 5_000,
  match: 180_000,
  countdown: 3_000,
  /** How long the result shows before the next match can start. */
  over: 8_000,
  /** Drive within this (m) of a loose crown to take it. */
  reach: 3.5,
  /** A knocked-off crown is in the air, untouchable, for this long (ms). */
  loose: 500,
  /** Whoever lost it can't take it back for this long (ms). */
  regrab: 2_500,
  immune: 1_500,
  /** A knocked-off crown lands this far (m) from the holder. */
  scatter: 9,
  /** A hit only counts when the two cars were this close (m) by their last states. */
  hitRange: 12,
  /** The holder's top speed multiplier. */
  holderSpeed: 0.9,
} as const;

export type CrownPhase = "idle" | "countdown" | "live" | "over";

export interface CrownState {
  phase: CrownPhase;
  /** Countdown end (live starts) and match end, server ms. */
  startsAt: number;
  endsAt: number;
  holder: string | null;
  /** Loose crown position (m), when nobody holds it. */
  x: number;
  z: number;
  /** A loose crown can be taken from this time (server ms). */
  takeAt: number;
  /** When the holder took it (server ms): immunity runs from here. */
  since: number;
  /** Holder's time is counted up to here (server ms). */
  counted: number;
  /** Where a knocked-off crown flew from (m), for its arc. */
  fromX: number;
  fromZ: number;
  /** Who lost it last, and until when they can't take it back (server ms). */
  lockId: string | null;
  lockUntil: number;
  /** Time each driver still needs (ms). */
  left: Record<string, number>;
  winner: string | null;
}

export function idleCrown(): CrownState {
  return {
    phase: "idle", startsAt: 0, endsAt: 0, holder: null, x: 0, z: 0, takeAt: 0, since: 0, counted: 0,
    fromX: 0, fromZ: 0, lockId: null, lockUntil: 0, left: {}, winner: null,
  };
}

/** Start a match (returns false when it can't start now). */
export function startCrown(s: CrownState, drivers: readonly string[], now: number, x: number, z: number): boolean {
  if (drivers.length < 2) return false;
  if (s.phase === "countdown" || s.phase === "live") return false;
  if (s.phase === "over" && now < s.endsAt + CROWN.over) return false;
  Object.assign(s, idleCrown());
  s.phase = "countdown";
  s.startsAt = now + CROWN.countdown;
  s.endsAt = s.startsAt + CROWN.match;
  s.x = x;
  s.z = z;
  s.fromX = x;
  s.fromZ = z;
  s.takeAt = s.startsAt;
  for (const d of drivers) s.left[d] = CROWN.goal;
  return true;
}

/** Count the holder's time down to `now` (call before any change). */
function settle(s: CrownState, now: number): void {
  if (s.phase !== "live" || !s.holder) return;
  const t = Math.min(now, s.endsAt);
  const held = Math.max(0, t - s.counted);
  s.left[s.holder] = Math.max(0, (s.left[s.holder] ?? CROWN.goal) - held);
  s.counted = t;
}

function finish(s: CrownState, winner: string | null, now: number): void {
  s.phase = "over";
  s.winner = winner;
  s.holder = null;
  s.endsAt = now;
}

/** Advance the clock. Returns true when the state changed in a way clients must hear about. */
export function tickCrown(s: CrownState, now: number): boolean {
  if (s.phase === "countdown" && now >= s.startsAt) {
    s.phase = "live";
    return true;
  }
  if (s.phase !== "live") return false;
  settle(s, now);
  if (s.holder && (s.left[s.holder] ?? 1) <= 0) {
    finish(s, s.holder, now);
    return true;
  }
  if (now >= s.endsAt) {
    // Time's up: least time left wins (ties: nobody).
    const ranked = Object.entries(s.left).sort((a, b) => a[1] - b[1]);
    const best = ranked[0];
    const tie = ranked[1] && ranked[1][1] === best?.[1];
    finish(s, best && best[1] < CROWN.goal && !tie ? best[0] : null, now);
    return true;
  }
  return false;
}

/** Take the loose crown. */
export function grabCrown(s: CrownState, id: string, now: number): boolean {
  if (s.phase !== "live" || s.holder || now < s.takeAt) return false;
  if (id === s.lockId && now < s.lockUntil) return false;
  s.holder = id;
  s.since = now;
  s.counted = now;
  s.left[id] ??= CROWN.goal;
  return true;
}

/** The holder, at (fromX, fromZ), loses the crown; it flies to (x, z). */
export function dropCrown(s: CrownState, now: number, x: number, z: number, fromX = x, fromZ = z): boolean {
  if (s.phase !== "live" || !s.holder || now - s.since < CROWN.immune) return false;
  settle(s, now);
  const h = s.holder;
  if ((s.left[h] ?? CROWN.goal) < CROWN.floor) s.left[h] = CROWN.floor;
  s.holder = null;
  s.x = x;
  s.z = z;
  s.fromX = fromX;
  s.fromZ = fromZ;
  s.takeAt = now + CROWN.loose;
  s.lockId = h;
  s.lockUntil = now + CROWN.regrab;
  return true;
}

/** A bump with boost: the crown goes straight to `thief`. */
export function stealCrown(s: CrownState, thief: string, now: number): boolean {
  if (s.phase !== "live" || !s.holder || s.holder === thief || now - s.since < CROWN.immune) return false;
  settle(s, now);
  const h = s.holder;
  if ((s.left[h] ?? CROWN.goal) < CROWN.floor) s.left[h] = CROWN.floor;
  s.holder = thief;
  s.since = now;
  s.counted = now;
  s.left[thief] ??= CROWN.goal;
  return true;
}

/** A driver left: drop the crown where they were and forget their time. */
export function leaveCrown(s: CrownState, id: string, now: number, x: number, z: number): boolean {
  let changed = false;
  if (s.holder === id) {
    settle(s, now);
    s.holder = null;
    s.x = x;
    s.z = z;
    s.fromX = x;
    s.fromZ = z;
    s.takeAt = now + CROWN.loose;
    changed = true;
  }
  if (id in s.left) {
    delete s.left[id];
    changed = true;
  }
  return changed;
}

/** Where a crown knocked off a holder at (x, z) lands: any direction, SCATTER m away. */
export function scatterFrom(x: number, z: number, seed: number): [number, number] {
  const a = ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * Math.PI * 2;
  return [x + Math.cos(a) * CROWN.scatter, z + Math.sin(a) * CROWN.scatter];
}

/** Where a crown lands when a car at (ax, az) bumps the holder at (vx, vz): the way the bump pushed, a little off-line. */
export function knockFrom(ax: number, az: number, vx: number, vz: number, seed: number): [number, number] {
  let dx = vx - ax;
  let dz = vz - az;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return scatterFrom(vx, vz, seed);
  dx /= d;
  dz /= d;
  const r = Math.sin(seed * 78.233) * 43758.5453;
  const wobble = (r - Math.floor(r) - 0.5) * 0.6; // ±~17°
  const c = Math.cos(wobble);
  const s = Math.sin(wobble);
  return [vx + (dx * c - dz * s) * CROWN.scatter, vz + (dx * s + dz * c) * CROWN.scatter];
}
