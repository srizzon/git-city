// ─── Smash ──────────────────────────────────────────────────
// Driving through a town's buildings (anyone's but your own). Each building is a grid of up
// to 4×4 columns (cut on its window lines), each column a stack of floors.
// A car passing through a column takes its bottom floor and the rest drops a
// row; blasts take several. The building is its own health bar: a small one
// falls in a few passes, a tall one in many. Knocked-out floors grow back on
// their own, one row every `regenMs`. A building that fell is shielded for
// `shieldMs` (Clash of Clans' shield): it grows back before anyone can hit it
// again, so nobody keeps a small town flat. It first lies in rubble for
// `rubbleMs`, the attacker's flag planted in it: nothing grows it back sooner.
//
// Everything is in city units, times are epoch ms. The store is shared by the
// drive world (which hits it) and the building renderer (which draws it), so
// both ask `frame` for the animated heights and the first call per timestamp
// advances them. The drive room (party/drive.ts) keeps its own store as the
// authority: it applies validated hits, grows floors back and sends the rows,
// which clients take with `setRows`. Relative imports only (PartyKit bundles it).

export const SMASH = {
  maxCols: 4,
  /** A car hit needs at least this speed (m/s). */
  minSpeed: 5,
  /** One car takes one floor from a column at most this often (ms). */
  cooldownMs: 220,
  /** The car's footprint for hits (units). */
  carRadius: 3.2,
  /** Floors a pass takes, and with boost. */
  rows: 1,
  boostRows: 2,
  /** A floor grows back after this long (ms). */
  regenMs: 3_600_000,
  /** A fallen building can't be hit for this long (ms). */
  shieldMs: 12 * 3_600_000,
  /** A fallen building stays flat, flying its attacker's flag, this long (ms). */
  rubbleMs: 3 * 3_600_000,
  /** A column falls into the gap its lost floors leave (floors/s²), bounces a little, and grows back (floors/s). */
  gravity: 30,
  bounce: 0.22,
  grow: 3,
} as const;

/** Column slots per building (4 × 4). */
export const SMASH_SLOTS = SMASH.maxCols * SMASH.maxCols;

export interface SmashSource {
  loginLower: string;
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  floors: number;
  windowsPerFloor: number;
  sideWindowsPerFloor: number;
}

export interface SmashTarget {
  login: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  floorH: number;
  /** Column edges as fractions of width (nx + 1) and depth (nz + 1), on window lines. */
  xs: number[];
  zs: number[];
}

/** A saved building's damage (town_building_damage, as the smash API sends it). */
export interface DamageEntry {
  login: string;
  /** Floors left per column. */
  rows: number[];
  /** Epoch ms the next time-based floor counts from. */
  regenFrom: number;
  /** The owner's week contributions at the last save, and now. */
  contribBase: number;
  contribNow: number;
  /** Who took the last floor, while it lies in rubble. */
  demolishedBy: string | null;
  /** Epoch ms its shield ends (0: none). */
  shieldUntil: number;
}

export interface SmashHit {
  /** Where the floor came off (units). */
  x: number;
  y: number;
  z: number;
  target: number;
  /** The building has no floors left. */
  down: boolean;
  /** Column index inside the building. */
  col: number;
}

/** Column edges: n columns across `windows` windows, cut on window lines. */
export function columnEdges(windows: number, max: number = SMASH.maxCols): number[] {
  const w = Math.max(1, Math.round(windows));
  const n = Math.max(1, Math.min(max, w));
  return Array.from({ length: n + 1 }, (_, i) => Math.round((i * w) / n) / w);
}

export function toTarget(b: SmashSource): SmashTarget {
  const floors = Math.max(1, Math.round(b.floors));
  return {
    login: b.loginLower,
    x: b.position[0],
    z: b.position[2],
    w: b.width,
    d: b.depth,
    floors,
    floorH: b.height / floors,
    xs: columnEdges(b.windowsPerFloor),
    zs: columnEdges(b.sideWindowsPerFloor),
  };
}

/** Circle (cx, cz, r) against rectangle [x0, x1] × [z0, z1]. */
function touches(cx: number, cz: number, r: number, x0: number, x1: number, z0: number, z1: number): boolean {
  const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
  const dz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0;
  return dx * dx + dz * dz <= r * r;
}

export class SmashStore {
  readonly targets: SmashTarget[];
  readonly index = new Map<string, number>();
  /** Floors left per column, slot = target * SMASH_SLOTS + column. */
  readonly rows: Uint8Array;
  /** Drawn floors per column (grows toward `rows` when floors come back). */
  readonly shown: Float32Array;
  /** How far (floors) each column still floats above the ground, falling into the gap. */
  readonly drop: Float32Array;
  private vel: Float32Array;
  /** Bumps whenever a building starts or stops being damaged. */
  version = 0;
  private since: Float64Array;
  private damaged: Uint8Array;
  private moving = new Set<number>();
  private lastTake = new Map<number, number>();
  private lastFrame = -1;
  private regenMs: number;
  private changed = new Set<number>();
  /** Who took the last floor of each building lying in rubble. */
  readonly demolishedBy = new Map<number, string>();
  /** Epoch ms each building's shield ends (0: none). */
  readonly shieldUntil: Float64Array;

  constructor(targets: readonly SmashTarget[], regenMs: number = SMASH.regenMs) {
    this.targets = [...targets];
    this.targets.forEach((t, i) => this.index.set(t.login, i));
    this.rows = new Uint8Array(this.targets.length * SMASH_SLOTS);
    this.shown = new Float32Array(this.targets.length * SMASH_SLOTS);
    this.drop = new Float32Array(this.targets.length * SMASH_SLOTS);
    this.vel = new Float32Array(this.targets.length * SMASH_SLOTS);
    this.since = new Float64Array(this.targets.length);
    this.damaged = new Uint8Array(this.targets.length);
    this.shieldUntil = new Float64Array(this.targets.length);
    this.targets.forEach((t, i) => {
      for (let c = 0; c < cols(t); c++) {
        this.rows[i * SMASH_SLOTS + c] = t.floors;
        this.shown[i * SMASH_SLOTS + c] = t.floors;
      }
    });
    this.regenMs = regenMs;
  }

  isDamaged(target: number): boolean {
    return this.damaged[target] === 1;
  }

  /** Fell less than `shieldMs` ago: no floor comes off. */
  isShielded(target: number, now: number): boolean {
    return this.shieldUntil[target] > now;
  }

  /** Fell less than `rubbleMs` ago: it stays flat (time, contributions and the owner can't grow it back). */
  isRubble(target: number, now: number): boolean {
    return now < this.rubbleUntil(target);
  }

  /** Epoch ms the rubble may start growing back (the fall is the shield's start; 0: never fell). */
  private rubbleUntil(target: number): number {
    const shield = this.shieldUntil[target];
    return shield > 0 ? shield - SMASH.shieldMs + SMASH.rubbleMs : 0;
  }

  /** The room's word on a shield (epoch ms it ends, 0 for none). */
  setShield(target: number, until: number) {
    this.shieldUntil[target] = Number.isFinite(until) && until > 0 ? until : 0;
  }

  /** Damaged or still animating: the renderer draws these as columns. */
  isBroken(target: number): boolean {
    return this.damaged[target] === 1 || this.moving.has(target);
  }

  /** Targets whose floors changed since the last call (the room sends and saves these). */
  takeChanged(): number[] {
    const out = [...this.changed];
    this.changed.clear();
    return out;
  }

  /** Floors left per column of one building. */
  rowsOf(target: number): number[] {
    return Array.from({ length: cols(this.targets[target]) }, (_, c) => this.rows[target * SMASH_SLOTS + c]);
  }

  /** Epoch ms the building's next time-based floor counts from. */
  regenFrom(target: number): number {
    return this.since[target];
  }

  /** The damaged (or still shielded) buildings, to send a newcomer or to save. */
  snapshot(now = Date.now()): { login: string; rows: number[]; regenFrom: number; demolishedBy: string | null; shieldUntil: number }[] {
    const out = [];
    for (let i = 0; i < this.targets.length; i++) {
      if (!this.damaged[i] && !this.isShielded(i, now)) continue;
      out.push({ login: this.targets[i].login, rows: this.rowsOf(i), regenFrom: this.since[i], demolishedBy: this.demolishedBy.get(i) ?? null, shieldUntil: this.shieldUntil[i] });
    }
    return out;
  }

  /** Saved damage, with the floors grown back since (time and contributions). */
  load(entries: readonly DamageEntry[], now: number) {
    for (const e of entries) {
      const i = this.index.get(e.login);
      if (i === undefined) continue;
      this.setShield(i, e.shieldUntil);
      // Contributions made while it lies in rubble wait for the rubble to end (the room keeps the old base).
      const back = this.isRubble(i, now) ? 0 : Math.max(0, e.contribNow - e.contribBase);
      this.setRows(i, e.rows.map((r) => r + back), now, e.regenFrom, false);
      this.setBy(i, e.demolishedBy);
      if (this.damaged[i]) this.regen(i, now);
      for (let c = 0; c < cols(this.targets[i]); c++) this.shown[i * SMASH_SLOTS + c] = this.rows[i * SMASH_SLOTS + c];
    }
  }

  /**
   * The room's word on a building's floors. Fewer than drawn: the columns
   * fall into the gap; more: they grow back. `animate` false snaps (a load).
   */
  setRows(target: number, rows: readonly number[], now: number, regenFrom?: number, animate = true) {
    const t = this.targets[target];
    let full = true;
    let any = false;
    for (let c = 0; c < cols(t); c++) {
      const s = target * SMASH_SLOTS + c;
      const r = Math.max(0, Math.min(t.floors, Math.round(rows[c] ?? t.floors)));
      if (r < t.floors) full = false;
      if (r === this.rows[s]) continue;
      any = true;
      if (r < this.rows[s]) {
        const took = this.rows[s] - r;
        this.shown[s] = animate ? Math.max(0, this.shown[s] - took) : r;
        if (animate) this.drop[s] += took;
      } else if (!animate) this.shown[s] = r;
      this.rows[s] = r;
    }
    if (full) this.setBy(target, null);
    if (!any) {
      if (regenFrom !== undefined && this.damaged[target]) this.since[target] = regenFrom;
      return;
    }
    this.mark(target, full, regenFrom ?? (this.damaged[target] ? this.since[target] : now));
    if (!animate) {
      this.moving.delete(target);
      this.version++;
    }
  }

  /** The room's full list: listed buildings take their floors, every other damaged one is whole again. */
  applyAll(list: readonly (readonly [string, readonly number[], string | null, number?])[], now: number) {
    const listed = new Set<number>();
    for (const [login, rows, by, shield] of list) {
      const i = this.index.get(login);
      if (i === undefined) continue;
      listed.add(i);
      this.setRows(i, rows, now, undefined, false);
      this.setBy(i, by);
      this.setShield(i, shield ?? 0);
    }
    for (let i = 0; i < this.targets.length; i++) {
      if (this.damaged[i] && !listed.has(i)) this.setRows(i, [], now, undefined, false);
    }
  }

  /** Names (or clears) who took a fallen building's last floor. */
  setBy(target: number, by: string | null) {
    if (by && this.standing(target) === 0) {
      if (this.demolishedBy.get(target) === by) return;
      this.demolishedBy.set(target, by);
      this.version++;
    } else if (this.demolishedBy.delete(target)) this.version++;
  }

  /** `n` floors back on every short column (a contribution, the owner parked by it). Not while in rubble. */
  regrow(target: number, n: number, now = Date.now()) {
    if (!this.damaged[target] || n <= 0 || this.isRubble(target, now)) return;
    const t = this.targets[target];
    let full = true;
    for (let c = 0; c < cols(t); c++) {
      const s = target * SMASH_SLOTS + c;
      this.rows[s] = Math.min(t.floors, this.rows[s] + n);
      if (this.rows[s] < t.floors) full = false;
    }
    this.moving.add(target);
    this.changed.add(target);
    // Off the ground again: the flag comes down.
    this.setBy(target, null);
    if (full) this.damaged[target] = 0;
  }

  /** Book-keeping after a building's floors changed. */
  private mark(target: number, full: boolean, since: number) {
    this.changed.add(target);
    this.moving.add(target);
    if (full) {
      this.damaged[target] = 0;
      return;
    }
    if (!this.damaged[target]) {
      this.damaged[target] = 1;
      this.version++;
    }
    this.since[target] = since;
  }

  /** Logins of the buildings drawn broken right now. */
  brokenLogins(): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < this.targets.length; i++) if (this.isBroken(i)) out.add(this.targets[i].login);
    return out;
  }

  /** Grow floors back, drop columns into their gaps. Returns the targets that moved. Once per `now`. */
  frame(now: number, dt: number): ReadonlySet<number> {
    if (now === this.lastFrame) return this.moving;
    this.lastFrame = now;
    for (let i = 0; i < this.targets.length; i++) if (this.damaged[i]) this.regen(i, now);
    for (const i of this.moving) {
      const t = this.targets[i];
      let still = true;
      for (let c = 0; c < cols(t); c++) {
        const s = i * SMASH_SLOTS + c;
        const goal = this.rows[s];
        let v = this.shown[s];
        if (v > goal) v = goal;
        else if (v < goal) v = Math.min(goal, v + SMASH.grow * dt);
        if (v !== goal) still = false;
        this.shown[s] = v;
        if (this.drop[s] > 0 || this.vel[s] !== 0) {
          this.vel[s] += SMASH.gravity * dt;
          this.drop[s] -= this.vel[s] * dt;
          if (this.drop[s] <= 0) {
            this.drop[s] = 0;
            this.vel[s] = this.vel[s] > 4 ? -this.vel[s] * SMASH.bounce : 0;
          }
          still = false;
        }
      }
      if (still) {
        this.moving.delete(i);
        if (!this.damaged[i]) this.version++;
      }
    }
    return this.moving;
  }

  /**
   * Takes `n` floors from every standing column the circle touches. With a
   * cooldown, a column hit less than that long ago by the same source is
   * skipped (a car inside a column takes one floor per pass, not per frame).
   * `spare` is a building left alone (yours); `only`, the one building that
   * breaks (a guest's free one).
   */
  hitCircle(cx: number, cz: number, r: number, n: number, now: number, cooldownMs = 0, by?: string, spare?: string, only?: string): SmashHit[] {
    const hits: SmashHit[] = [];
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.login === spare || (only !== undefined && t.login !== only)) continue;
      const bx0 = t.x - t.w / 2;
      const bz0 = t.z - t.d / 2;
      if (!touches(cx, cz, r, bx0, bx0 + t.w, bz0, bz0 + t.d) || this.isShielded(i, now)) continue;
      if (this.damaged[i]) this.regen(i, now);
      const nx = t.xs.length - 1;
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < t.zs.length - 1; b++) {
          const c = a + b * nx;
          const s = i * SMASH_SLOTS + c;
          if (this.rows[s] === 0) continue;
          const x0 = bx0 + t.xs[a] * t.w;
          const x1 = bx0 + t.xs[a + 1] * t.w;
          const z0 = bz0 + t.zs[b] * t.d;
          const z1 = bz0 + t.zs[b + 1] * t.d;
          if (!touches(cx, cz, r, x0, x1, z0, z1)) continue;
          if (cooldownMs > 0) {
            if (now - (this.lastTake.get(s) ?? -Infinity) < cooldownMs) continue;
            this.lastTake.set(s, now);
          }
          const took = Math.min(n, this.rows[s]);
          this.rows[s] -= took;
          this.shown[s] = Math.max(0, this.shown[s] - took);
          // What's left jumps up by what came off, then falls into the gap.
          this.drop[s] += took;
          if (!this.damaged[i]) {
            this.damaged[i] = 1;
            this.since[i] = now;
            this.version++;
          }
          this.moving.add(i);
          this.changed.add(i);
          hits.push({ x: (x0 + x1) / 2, y: t.floorH / 2, z: (z0 + z1) / 2, target: i, down: false, col: c });
        }
      }
      if (hits.length && hits[hits.length - 1].target === i && this.standing(i) === 0) {
        hits[hits.length - 1].down = true;
        this.shieldUntil[i] = now + SMASH.shieldMs;
        if (by) this.setBy(i, by);
      }
    }
    return hits;
  }

  /**
   * The room's side of a hit: takes `n` floors from the listed columns of one
   * building. Returns how many floors came off and whether it fell with them.
   */
  hitColumns(target: number, columns: readonly number[], n: number, now: number, by?: string): { took: number; down: boolean } {
    const t = this.targets[target];
    const before = this.standing(target);
    if (before === 0 || this.isShielded(target, now)) return { took: 0, down: false };
    if (this.damaged[target]) this.regen(target, now);
    let took = 0;
    for (const c of new Set(columns)) {
      if (!Number.isInteger(c) || c < 0 || c >= cols(t)) continue;
      const s = target * SMASH_SLOTS + c;
      const k = Math.min(n, this.rows[s]);
      if (k === 0) continue;
      this.rows[s] -= k;
      this.shown[s] = Math.max(0, this.shown[s] - k);
      this.drop[s] += k;
      took += k;
    }
    if (took === 0) return { took: 0, down: false };
    if (!this.damaged[target]) {
      this.damaged[target] = 1;
      this.since[target] = now;
      this.version++;
    }
    this.moving.add(target);
    this.changed.add(target);
    const down = this.standing(target) === 0;
    if (down) this.shieldUntil[target] = now + SMASH.shieldMs;
    if (down && by) this.setBy(target, by);
    return { took, down };
  }

  /** Center (units) of a building's column. */
  columnCenter(target: number, c: number): [number, number] {
    const t = this.targets[target];
    const nx = t.xs.length - 1;
    const a = c % nx;
    const b = Math.floor(c / nx);
    return [t.x - t.w / 2 + ((t.xs[a] + t.xs[a + 1]) / 2) * t.w, t.z - t.d / 2 + ((t.zs[b] + t.zs[b + 1]) / 2) * t.d];
  }

  /** How tall (units) the building stands now: its tallest column, a floor of rubble at least. */
  standingHeight(target: number): number {
    const t = this.targets[target];
    let top = 0;
    for (let c = 0; c < cols(t); c++) top = Math.max(top, this.rows[target * SMASH_SLOTS + c]);
    return Math.max(1, top) * t.floorH;
  }

  /** Floors left in the whole building. */
  standing(target: number): number {
    let sum = 0;
    for (let c = 0; c < cols(this.targets[target]); c++) sum += this.rows[target * SMASH_SLOTS + c];
    return sum;
  }

  /** One row back on every short column per `regenMs` since the last one. */
  private regen(i: number, now: number) {
    const hold = this.rubbleUntil(i);
    if (now < hold) return;
    // The first floor comes back as the rubble ends, not an hour after the first hit.
    if (this.since[i] < hold - this.regenMs) this.since[i] = hold - this.regenMs;
    const k = Math.floor((now - this.since[i]) / this.regenMs);
    if (k <= 0) return;
    this.since[i] += k * this.regenMs;
    const t = this.targets[i];
    let full = true;
    for (let c = 0; c < cols(t); c++) {
      const s = i * SMASH_SLOTS + c;
      this.rows[s] = Math.min(t.floors, this.rows[s] + k);
      if (this.rows[s] < t.floors) full = false;
    }
    this.moving.add(i);
    this.changed.add(i);
    this.setBy(i, null);
    if (full) this.damaged[i] = 0;
  }
}

/** A store for these buildings (the client's, from the scene's CityBuildings). */
export function smashStoreFor(buildings: readonly SmashSource[], regenMs?: number): SmashStore {
  return new SmashStore(buildings.map(toTarget), regenMs);
}

export function cols(t: SmashTarget): number {
  return (t.xs.length - 1) * (t.zs.length - 1);
}
