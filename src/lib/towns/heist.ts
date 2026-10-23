// ─── Brasil town: city of the day ───────────────────────────
// Cops and robbers on the Brasil map. Each day one city pays double for its
// buildings: robbers knock them down and keep the points only once they've
// pushed (left the city's ring and held out 5 s), cops bust robbers for points
// and get a bonus if the city ends the day mostly standing. Residents of the
// city are cops; anyone else picks a side for the day. What the HUD draws is
// a HeistView; the numbers here are the starting values, tuned by playing.
// Pure.

export const HEIST = {
  /** Points a building in the city of the day pays (double the map's). */
  building: 10,
  /** Smash points a robber can bank a day in the city of the day. */
  dayCap: 100,
  /** Seconds outside the ring with no cop near to push. */
  pushSecs: 5,
  /** A car's hearts; each hit costs one, zero is a bust. */
  hearts: 5,
  /** Points a bust pays the cop. */
  bust: 15,
  /** Share of the city's buildings standing at midnight for the cops' bonus. */
  standGoal: 0.7,
  /** The cops' bonus (each cop with a bust). */
  standBonus: 30,
} as const;

export type HeistSide = "robber" | "cop";
export type KitItem = "missile" | "duck" | "bomb" | "magnet" | "bluescreen";

/** One slot of a side's kit: ready, or charging with this many seconds left. */
export interface KitSlot {
  item: KitItem;
  /** Q and E for the side's own two, F for the missile (F is the attack key everywhere). */
  key: "Q" | "E" | "F";
  /** 0 when ready; otherwise 0…1 of the charge still to go. */
  charging: number;
  secs: number;
}

export const KIT: Record<HeistSide, KitItem[]> = {
  robber: ["duck", "bomb", "missile"],
  cop: ["magnet", "bluescreen", "missile"],
};

export const KIT_NAMES: Record<KitItem, [en: string, pt: string]> = {
  missile: ["Missile", "Míssil"],
  duck: ["Rubber duck", "Pato"],
  bomb: ["Bomb", "Bomba"],
  magnet: ["Magnet", "Ímã"],
  bluescreen: ["Blue screen", "Tela azul"],
};

export interface HeistCity {
  name: string;
  uf: string;
  buildings: number;
  /** Share standing now, 0…1. */
  standing: number;
}

export type HeistFlash = { kind: "pushed"; pts: number } | { kind: "bust"; pts: number } | { kind: "busted"; pts: number; by: string | null } | { kind: "bluescreen"; by: string | null };

/** A one-line word on what your kit just did (or what a duck did), a moment under the panel. */
export type HeistNote = { kind: "zapped" | "pulled"; who: string | null } | { kind: "noAim" } | { kind: "ducked" } | { kind: "tripped" };

export interface HeistView {
  city: HeistCity;
  side: HeistSide | null;
  /** You live in the city: a cop without choosing. */
  resident: boolean;
  robber: { unpushed: number; stars: number; hearts: number; push: { secsLeft: number; done: number; paused: boolean } | null; inside?: boolean; hit?: "cop" | "shot" | "blast" | "magnet" | null; takedown?: boolean; copNear?: boolean } | null;
  cop: { busts: number; target: string | null } | null;
  kit: KitSlot[] | null;
  flash: HeistFlash | null;
  note?: HeistNote | null;
}

export interface HeistResult {
  city: HeistCity;
  /** Share standing at midnight. */
  standing: number;
  cops: { login: string; busts: number }[];
  robbers: { login: string; pts: number }[];
  you: { side: HeistSide; busts?: number; pts?: number; bonus?: number } | null;
}

/** The cops kept the city. */
export const defended = (standing: number) => standing >= HEIST.standGoal;

// ─── The rules in numbers ────────────────────────────────────
// Shared by the site, the drive room (party/drive.ts: relative imports only)
// and the client.

export const RULES = {
  /** A city needs this many buildings to be picked… */
  minBuildings: 30,
  /** …unless fewer than this many cities have them: then the biggest few. */
  minCandidates: 3,
  fallbackCandidates: 5,
  /** The ring reaches this many lots past the city's own radius. */
  ringPad: 1.5,
  /** A cop this close (m) pauses the push bar. */
  copNear: 35,
  /** The room allows a push this much early (ms), for the clock skew between car and room. */
  pushSlackMs: 800,
  /** A bust names the last real cop that hit you within this long (ms)… */
  bustCreditMs: 3000,
  /** …and only if that cop is this close (m) when the bust lands. */
  bustReach: 60,
  /** Points a bust pays the cop (`bust`), and a game-run robber's. */
  gangBust: 5,
  /** Fewest seconds between two game-run busts paid to one cop. */
  gangBustGapMs: 20_000,
  /** Busts pay up to this a day per cop. */
  bustDayCap: 100,
  /** Blocks (one floor of one column) knocked off in the ring per point held: a typical building (~200 blocks) is ~10, double a fall elsewhere. */
  blocksPerPoint: 20,
  /** Stars by points held (1 at the first). */
  starsAt: [1, 10, 25, 50, 80],
  /** Most game cop cars after one robber. */
  maxGameCops: 4,
  /** Turrets: from this many stars, the tallest this many buildings within reach (m) shoot every `turretEveryMs`. */
  turretStars: 2,
  turrets: 3,
  turretReach: 120,
  turretEveryMs: 2500,
  /** A game-run gang for a lone cop: this many cars, each with this many hearts. */
  gangCars: 2,
  gangHearts: 3,
  /** Kit recharge (ms). */
  kitMs: { duck: 25_000, bomb: 15_000, missile: 20_000, magnet: 18_000, bluescreen: 25_000 } as Record<KitItem, number>,
  /** The kit works this far from the city's middle (× the ring's radius): in the city and on the way out. */
  kitReach: 2.2,
  /** Effects (ms). */
  duckMs: 8000,
  magnetMs: 3000,
  bluescreenMs: 1500,
} as const;

export const KIT_ITEMS: readonly KitItem[] = ["missile", "duck", "bomb", "magnet", "bluescreen"];
export function isKitItem(v: unknown): v is KitItem {
  return typeof v === "string" && (KIT_ITEMS as readonly string[]).includes(v);
}
/** Items only the kit has (bomb and missile are the boxes' too). */
export function kitOnly(v: unknown): v is "duck" | "magnet" | "bluescreen" {
  return v === "duck" || v === "magnet" || v === "bluescreen";
}

export function isSide(v: unknown): v is HeistSide {
  return v === "robber" || v === "cop";
}

/** Points held for this many blocks knocked off in the ring. */
export const heldPoints = (blocks: number) => Math.floor(blocks / RULES.blocksPerPoint);

/** Stars for this many points held (0…5). */
export function starsFor(down: number): number {
  let s = 0;
  for (const at of RULES.starsAt) if (down >= at) s++;
  return s;
}

/** Game cop cars after a robber with this many stars, with this many real cops in the room. */
export function gameCops(stars: number, realCops: number): number {
  return Math.max(0, Math.min(RULES.maxGameCops, stars) - realCops);
}

export interface Ring {
  /** Middle and reach, meters (the drive's units). */
  x: number;
  z: number;
  r: number;
}

/** A city's ring, in meters, from its square (lots) and radius (lots). */
export function ringOf(center: readonly [number, number], radius: number, lot: number, unitToM: number): Ring {
  return { x: center[0] * lot * unitToM, z: center[1] * lot * unitToM, r: (radius + RULES.ringPad) * lot * unitToM };
}

export const inRing = (ring: Ring, x: number, z: number) => Math.hypot(x - ring.x, z - ring.z) <= ring.r;

/** 32-bit FNV-1a, for a seed from the date. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface CityPick {
  key: string;
  name: string;
  uf: string | null;
  buildings: number;
}

/**
 * The day's city: one of the cities with RULES.minBuildings buildings (or,
 * while fewer than RULES.minCandidates have that many, one of the biggest
 * RULES.fallbackCandidates), seeded by the date, never yesterday's when
 * there's another. The island never plays.
 */
export function pickDayCity(cities: readonly CityPick[], day: string, yesterday: string | null = null): CityPick | null {
  const real = cities.filter((c) => c.key !== "island" && c.buildings > 0);
  let pool = real.filter((c) => c.buildings >= RULES.minBuildings);
  if (pool.length < RULES.minCandidates) pool = [...real].sort((a, b) => b.buildings - a.buildings || a.key.localeCompare(b.key)).slice(0, RULES.fallbackCandidates);
  if (pool.length === 0) return null;
  pool = [...pool].sort((a, b) => a.key.localeCompare(b.key));
  const fresh = pool.length > 1 && yesterday ? pool.filter((c) => c.key !== yesterday) : pool;
  return fresh[hash(`heist:${day}`) % fresh.length];
}

// ─── Push ────────────────────────────────────────────────────

export interface PushState {
  /** Held out this long so far (ms). */
  held: number;
}

/**
 * One step of the push bar: it fills while you're out of the ring with points
 * to bank and no cop near, stops while one is, and empties when you go back in.
 * Returns true the step it fills.
 */
export function stepPush(p: PushState, dtMs: number, outside: boolean, copNear: boolean, unpushed: number): boolean {
  if (!outside || unpushed <= 0) {
    p.held = 0;
    return false;
  }
  if (copNear) return false;
  const was = p.held;
  p.held = Math.min(HEIST.pushSecs * 1000, p.held + dtMs);
  return was < HEIST.pushSecs * 1000 && p.held >= HEIST.pushSecs * 1000;
}

/** What a push of `pts` points held pays, under what's left of the day's cap. */
export function pushPoints(pts: number, paidToday: number): number {
  return Math.max(0, Math.min(pts, HEIST.dayCap - paidToday));
}

/** Share of the city standing, from its buildings and how many fell today. */
export function standingOf(buildings: number, fell: number): number {
  if (buildings <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - fell / buildings));
}
