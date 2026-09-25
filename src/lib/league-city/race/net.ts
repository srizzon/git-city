// ─── Race room protocol ─────────────────────────────────────
// The race party (party/race.ts) speaks the drive room's protocol for cars
// (hello, "s" states, bumps, and race_start; see drive/net.ts) plus these
// messages.
// Relative imports only (the PartyKit party bundles this file).

import type { InvalidReason } from "./laps";
import type { RaceState } from "./race";

/** Best lap per driver name (lowercase) in this room, fastest first. */
export type RoomBests = [name: string, ms: number][];

export type RaceServerMsg =
  | { t: "race"; race: RaceState; now: number; progress: Record<string, number> }
  /** A lap timed by the server. `pb`: the driver's best in this room. */
  | { t: "lap"; id: string; name: string; ms: number; valid: boolean; pb: boolean }
  /** Your lap under way stopped counting. */
  | { t: "void"; reason: InvalidReason }
  /** Signed proof of a valid lap, for /api/towns/[slug]/race/lap. Only to its driver. */
  | { t: "receipt"; token: string }
  | { t: "bests"; bests: RoomBests };

/** Welcome extras on the race party (next to the drive room's welcome). */
export interface RaceWelcome {
  race: RaceState;
  bests: RoomBests;
  now: number;
}

/** What a lap receipt says. */
export interface LapReceipt {
  /** Town slug (the room). */
  room: string;
  track: string;
  /** Driver GitHub login, lowercase. */
  dln: string;
  ms: number;
  /** Expiry (epoch ms). */
  exp: number;
  nonce: string;
}

export const RECEIPT_VERSION = "lap1";
export const RECEIPT_TTL_MS = 10 * 60_000;
