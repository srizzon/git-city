// ─── Drive multiplayer protocol ─────────────────────────────
// Shared by the PartyKit party (party/drive.ts) and the client, so relative
// imports only. One room per league city. Each car sends its state as a
// compact array ~15 times a second; the others draw it INTERP_MS behind real
// time, interpolating between the two snapshots around that moment.

export const SEND_MS = 66;
export const INTERP_MS = 110;
/**
 * Spectators (the city in view mode, ?watch=1) get every car in one message
 * this often instead of each car's stream, and draw them further behind.
 */
export const WATCH_MS = 200;
export const WATCH_INTERP_MS = 320;
export const MAX_DRIVERS = 30;
export const MAX_MESSAGE_BYTES = 512;
/** Physics works in meters; a 40-lot city spans ±400 m. Anything past this is junk. */
export const COORD_MAX = 1000;

/** A bump is a velocity change (m/s) for the car that was hit; capped. */
export const BUMP_MAX = 25;
export const BUMP_MIN_MS = 100;

export const FLAG_BRAKE = 1;
export const FLAG_BOOST = 2;
export const FLAG_DRIFT = 4;
export const FLAG_HORN = 8;

export interface CarSnapshot {
  /** Meters. */
  x: number;
  y: number;
  z: number;
  /** Rotation quaternion. */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Forward speed, m/s. */
  speed: number;
  /** Front wheel steering angle, rad. */
  steer: number;
  /** Sideways slip 0…1 (skid marks, smoke). */
  slip: number;
  flags: number;
}

export interface DriverInfo {
  id: string;
  name: string;
}

/** A box slot's generation and how long until it's back (ms, 0 = there now). */
import type { CrownState } from "./crown";

export interface BoxState {
  gen: number;
  wait: number;
}

// Client → server
export type ClientMsg =
  | { t: "hello"; name: string }
  | { t: "bump"; to: string; x: number; z: number }
  | { t: "take"; box: number; gen: number }
  | { t: "use"; item: string; x: number; z: number; dx: number; dz: number; target?: string }
  | { t: "hit"; id: number }
  | { t: "crown_start"; x: number; z: number }
  | { t: "crown_grab" }
  | { t: "crown_hit"; victim: string; steal: boolean }
  | { t: "crown_drop" }
  /** Race track only (party/race.ts). */
  | { t: "race_start" }
  | ["s", ...number[]];
// Server → client
export type ServerMsg =
  | { t: "welcome"; you: string; drivers: (DriverInfo & { s: number[] | null })[]; boxes: BoxState[]; crown: CrownState; now: number }
  | { t: "crown"; crown: CrownState; now: number }
  | { t: "box"; box: number; gen: number; wait: number }
  | { t: "got"; item: string }
  | { t: "fx"; id: number; from: string; item: string; x: number; z: number; dx: number; dz: number; target?: string }
  | { t: "gone"; id: number }
  | { t: "join"; id: string; name: string }
  | { t: "leave"; id: string }
  | { t: "full" }
  /** Spectators only: every driver's latest state, [id, ...11 numbers] each. */
  | { t: "cars"; cars: [string, ...number[]][] }
  | { t: "bump"; from: string; x: number; z: number }
  | ["s", string, ...number[]];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Snapshot → the numbers of an "s" message. */
export function encodeState(s: CarSnapshot): number[] {
  return [r3(s.x), r3(s.y), r3(s.z), r3(s.qx), r3(s.qy), r3(s.qz), r3(s.qw), r3(s.speed), r3(s.steer), r3(s.slip), s.flags | 0];
}

/** The numbers of an "s" message → snapshot, or null when anything is off. */
export function decodeState(a: readonly unknown[]): CarSnapshot | null {
  if (a.length !== 11) return null;
  for (const v of a) if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const [x, y, z, qx, qy, qz, qw, speed, steer, slip, flags] = a as number[];
  if (Math.abs(x) > COORD_MAX || Math.abs(z) > COORD_MAX || y < -100 || y > 300) return null;
  const qn = Math.hypot(qx, qy, qz, qw);
  if (qn < 0.5 || qn > 1.5) return null;
  if (Math.abs(speed) > 100 || Math.abs(steer) > 1.5 || slip < 0 || slip > 1) return null;
  if (!Number.isInteger(flags) || flags < 0 || flags > 15) return null;
  return { x, y, z, qx: qx / qn, qy: qy / qn, qz: qz / qn, qw: qw / qn, speed, steer, slip, flags };
}

/** A bump's velocity change, or null when it isn't a sane one. */
export function validBump(x: unknown, z: unknown): { x: number; z: number } | null {
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const m = Math.hypot(x, z);
  if (m === 0) return null;
  const k = m > BUMP_MAX ? BUMP_MAX / m : 1;
  return { x: x * k, z: z * k };
}

const LOGIN_RE = /^[a-zA-Z0-9-]{1,39}$/;
const GUEST_RE = /^guest-[a-z0-9]{4}$/;

/** A GitHub login or a guest name; anything else is refused. */
export function validName(name: unknown): name is string {
  return typeof name === "string" && (LOGIN_RE.test(name) || GUEST_RE.test(name));
}

export function guestName(random: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "guest-";
  for (let i = 0; i < 4; i++) s += abc[Math.floor(random() * abc.length)];
  return s;
}

// Bright colors that read at night against the dark city.
const PALETTE = ["#ff5a5f", "#ffb400", "#3ddc97", "#4cc9f0", "#b388ff", "#ff7eb6", "#f4f1bb", "#7bdff2", "#ff9f1c", "#9bf6ff"];

/** A stable car color per name. */
export function carColor(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.toLowerCase().charCodeAt(i), 16777619);
  return PALETTE[(h >>> 0) % PALETTE.length];
}

// ─── Interpolation ───────────────────────────────────────────

/** Recent snapshots of one remote car, with the local time each arrived. */
export class SnapshotBuffer {
  private items: { t: number; s: CarSnapshot }[] = [];

  push(t: number, s: CarSnapshot): void {
    const last = this.items[this.items.length - 1];
    if (last && t <= last.t) t = last.t + 1;
    this.items.push({ t, s });
    if (this.items.length > 20) this.items.shift();
  }

  get latest(): CarSnapshot | null {
    return this.items[this.items.length - 1]?.s ?? null;
  }

  /** The car at local time `t` (already delayed by the caller). Holds the ends. */
  sample(t: number, out: CarSnapshot): CarSnapshot | null {
    const n = this.items.length;
    if (n === 0) return null;
    if (t <= this.items[0].t) return Object.assign(out, this.items[0].s);
    if (t >= this.items[n - 1].t) return Object.assign(out, this.items[n - 1].s);
    let i = n - 1;
    while (i > 0 && this.items[i - 1].t > t) i--;
    const a = this.items[i - 1];
    const b = this.items[i];
    const k = (t - a.t) / (b.t - a.t);
    return lerpSnapshot(a.s, b.s, k, out);
  }
}

export function lerpSnapshot(a: CarSnapshot, b: CarSnapshot, k: number, out: CarSnapshot): CarSnapshot {
  const l = (p: number, q: number) => p + (q - p) * k;
  out.x = l(a.x, b.x);
  out.y = l(a.y, b.y);
  out.z = l(a.z, b.z);
  // Normalized lerp along the short way round (fine at 15 Hz).
  const dot = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw;
  const sgn = dot < 0 ? -1 : 1;
  const qx = l(a.qx, b.qx * sgn);
  const qy = l(a.qy, b.qy * sgn);
  const qz = l(a.qz, b.qz * sgn);
  const qw = l(a.qw, b.qw * sgn);
  const qn = Math.hypot(qx, qy, qz, qw) || 1;
  out.qx = qx / qn;
  out.qy = qy / qn;
  out.qz = qz / qn;
  out.qw = qw / qn;
  out.speed = l(a.speed, b.speed);
  out.steer = l(a.steer, b.steer);
  out.slip = l(a.slip, b.slip);
  out.flags = k < 0.5 ? a.flags : b.flags;
  return out;
}

export function emptySnapshot(): CarSnapshot {
  return { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, speed: 0, steer: 0, slip: 0, flags: 0 };
}
