import type { Party, Connection } from "partykit/server";
import {
  BUMP_MIN_MS,
  MAX_DRIVERS,
  MAX_MESSAGE_BYTES,
  SEND_MS,
  decodeState,
  encodeState,
  validBump,
  validName,
  type ServerMsg,
} from "../src/lib/league-city/drive/net";
import { TRACK_ID, theTrack } from "../src/lib/league-city/race/track";
import { newLapState, restartLaps, startRaceLaps, stepLaps, type LapState } from "../src/lib/league-city/race/laps";
import {
  RACE,
  idleRace,
  inRace,
  jumpStart,
  leaveRace,
  lobbyDue,
  raceLap,
  roomChanged,
  setReady,
  startRace,
  tickRace,
} from "../src/lib/league-city/race/race";
import { RECEIPT_TTL_MS, type RaceServerMsg, type RoomBests } from "../src/lib/league-city/race/net";
import { randomNonce, signLapReceipt } from "./lapToken";

// ─── Town race track ────────────────────────────────────────
// One room per town (room id = town slug), apart from the town's drive room.
// Cars relay like the drive room (hello, states, bumps). On top of that the
// server times every lap from the states it receives, with its own clock
// (laps.ts): checkpoints in order, inside the walls, no faster than a car
// can go. A client can't report a lap, only drive one.
//
// Valid laps by a GitHub login get a signed receipt (to that connection
// only); the site saves the time only when the login is the signed-in viewer,
// so a made-up name gets nothing. Guests race and show up in the room's
// bests, never on the town's board.
//
// Races: see race.ts. Drivers ready up; the lobby starts it with the ready
// ones only. Broadcast on every change and twice a second while a lobby or a
// race runs, with each racer's distance for the standings.

interface Driver {
  name: string;
  state: number[] | null;
  lastState: number;
  lastBump: number;
  laps: LapState;
  joined: number;
  /** Past the finish with the car on autopilot: its laps aren't timed. */
  auto: boolean;
}

const track = theTrack();

export default class RaceServer implements Party.Server {
  private drivers = new Map<string, Driver>();
  private race = idleRace();
  private raceTimer: ReturnType<typeof setInterval> | null = null;
  /** Best valid lap per name (lowercase) in this room since it woke up. */
  private bests = new Map<string, number>();
  /** Each racer's grid slot during the countdown, for jump starts; `placed` once their car got there. */
  private slots = new Map<string, { x: number; z: number; placed: boolean }>();

  constructor(readonly room: Party.Room) {}

  private bestList(): RoomBests {
    return [...this.bests.entries()].sort((a, b) => a[1] - b[1]).slice(0, 20);
  }

  private progress(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of this.race.grid) {
      const l = this.drivers.get(id)?.laps;
      if (!l || l.s === null) continue;
      // Before the first crossing the car sits behind the line: short of zero.
      out[id] = l.lapStart === null ? l.s - track.length : l.s;
    }
    return out;
  }

  private sendRace() {
    const msg: RaceServerMsg = { t: "race", race: this.race, now: Date.now(), progress: this.progress() };
    this.room.broadcast(JSON.stringify(msg));
  }

  /** Everyone connected, in the order they came (the grid's tiebreak). */
  private room_ids(): string[] {
    return [...this.drivers.entries()].sort((a, b) => a[1].joined - b[1].joined).map(([id]) => id);
  }

  /** The lobby's time is up: the ready drivers line up. */
  private startNow(now: number) {
    const ready = new Set(this.race.ready);
    const drivers = [...this.drivers.entries()]
      .filter(([id]) => ready.has(id))
      .sort((a, b) => a[1].joined - b[1].joined)
      .map(([id, d]) => ({ id, name: d.name }));
    if (!startRace(this.race, drivers, Object.fromEntries(this.bests), now, Math.random())) return;
    this.slots.clear();
    this.race.grid.forEach((id, i) => {
      const g = track.grid[i];
      this.slots.set(id, { x: g.x, z: g.z, placed: false });
      const d = this.drivers.get(id);
      if (d) {
        restartLaps(d.laps);
        d.auto = false;
      }
    });
  }

  private runRaceClock() {
    if (this.raceTimer) return;
    let last = 0;
    this.raceTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      if (lobbyDue(this.race, now)) {
        this.startNow(now);
        changed = true;
      }
      if (tickRace(this.race, now)) {
        changed = true;
        if (this.race.phase === "live") {
          // Lights out. On the grid, the first crossing of the line starts lap 1;
          // a car that ended up past the line starts it now (laps.ts).
          for (const id of this.race.grid) {
            const d = this.drivers.get(id);
            if (d) startRaceLaps(track, d.laps, this.race.startsAt);
          }
          this.slots.clear();
        }
      }
      if (changed || now - last >= 500) {
        last = now;
        this.sendRace();
      }
      const busy = this.race.phase === "countdown" || this.race.phase === "live" || this.race.lobbyStartsAt > 0;
      if (!busy && this.raceTimer) {
        clearInterval(this.raceTimer);
        this.raceTimer = null;
      }
    }, 100);
  }

  onConnect(conn: Connection) {
    const now = Date.now();
    const welcome = {
      t: "welcome",
      you: conn.id,
      drivers: [...this.drivers.entries()].map(([id, d]) => ({ id, name: d.name, s: d.state })),
      boxes: [],
      crown: null,
      now,
      race: this.race,
      bests: this.bestList(),
    };
    conn.send(JSON.stringify(welcome));
  }

  private async onLaps(id: string, d: Driver, x: number, z: number, now: number) {
    for (const e of stepLaps(track, d.laps, x, z, now)) {
      if (e.t === "invalid") {
        this.room.getConnection(id)?.send(JSON.stringify({ t: "void", reason: e.reason } satisfies RaceServerMsg));
        continue;
      }
      if (e.t !== "lap" || d.auto) continue;
      const key = d.name.toLowerCase();
      const prev = this.bests.get(key);
      const pb = e.valid && (prev === undefined || e.ms < prev);
      if (pb) this.bests.set(key, e.ms);
      this.room.broadcast(JSON.stringify({ t: "lap", id, name: d.name, ms: e.ms, valid: e.valid, pb } satisfies RaceServerMsg));
      if (pb) this.room.broadcast(JSON.stringify({ t: "bests", bests: this.bestList() } satisfies RaceServerMsg));
      if (raceLap(this.race, id, e.at)) this.sendRace();
      if (e.valid && !d.name.startsWith("guest-")) await this.sendReceipt(id, d.name, e.ms, now);
    }
  }

  private async sendReceipt(id: string, name: string, ms: number, now: number) {
    const secret = (this.room.env as Record<string, unknown>).FORCE_PUSH_HMAC_SECRET as string | undefined;
    if (!secret || secret.length < 32) {
      console.warn("[race] FORCE_PUSH_HMAC_SECRET missing: lap not signed");
      return;
    }
    const token = await signLapReceipt(
      { room: this.room.id, track: TRACK_ID, dln: name.toLowerCase(), ms, exp: now + RECEIPT_TTL_MS, nonce: randomNonce() },
      secret,
    );
    this.room.getConnection(id)?.send(JSON.stringify({ t: "receipt", token } satisfies RaceServerMsg));
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Connection) {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) return;
    let msg: unknown;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (Array.isArray(msg)) {
      const d = this.drivers.get(sender.id);
      if (!d || msg[0] !== "s") return;
      const now = Date.now();
      if (now - d.lastState < SEND_MS * 0.6) return;
      const s = decodeState(msg.slice(1));
      if (!s) return;
      d.lastState = now;
      d.state = encodeState(s);
      this.room.broadcast(JSON.stringify(["s", sender.id, ...d.state]), [sender.id]);
      const slot = this.slots.get(sender.id);
      if (slot && this.race.phase === "countdown") {
        const off = Math.hypot(s.x - slot.x, s.z - slot.z);
        if (!slot.placed) slot.placed = off < 1.5;
        else if (off > RACE.jumpStart && jumpStart(this.race, sender.id)) this.sendRace();
      }
      void this.onLaps(sender.id, d, s.x, s.z, now);
      return;
    }

    if (!msg || typeof msg !== "object") return;
    const { t, name, to, x, z } = msg as Record<string, unknown>;

    // In (or out) for the next race. Nobody goes to a grid without saying so.
    if (t === "ready") {
      const on = (msg as Record<string, unknown>).on === true;
      if (!this.drivers.has(sender.id)) return;
      if (setReady(this.race, sender.id, on, this.room_ids(), Date.now())) {
        this.sendRace();
        this.runRaceClock();
      }
      return;
    }

    // R in practice: back behind the line, the lap starts over. Never in a race.
    if (t === "restart") {
      const d = this.drivers.get(sender.id);
      if (d && !inRace(this.race, sender.id)) {
        restartLaps(d.laps);
        d.auto = false;
      }
      return;
    }

    // Past the finish: the car drives itself, so nothing it does is a lap.
    if (t === "auto") {
      const d = this.drivers.get(sender.id);
      if (d) d.auto = true;
      return;
    }

    if (t === "bump") {
      const d = this.drivers.get(sender.id);
      const now = Date.now();
      const v = validBump(x, z);
      if (!d || !v || typeof to !== "string" || to === sender.id || !this.drivers.has(to)) return;
      if (now - d.lastBump < BUMP_MIN_MS) return;
      // Nobody gets shoved while the grid waits for the lights.
      if (this.race.phase === "countdown" && inRace(this.race, to)) return;
      d.lastBump = now;
      this.room.getConnection(to)?.send(JSON.stringify({ t: "bump", from: sender.id, x: v.x, z: v.z } satisfies ServerMsg));
      return;
    }

    if (t !== "hello" || !validName(name) || this.drivers.has(sender.id)) return;
    if (this.drivers.size >= MAX_DRIVERS) {
      sender.send(JSON.stringify({ t: "full" } satisfies ServerMsg));
      return;
    }
    this.drivers.set(sender.id, { name, state: null, lastState: 0, lastBump: 0, laps: newLapState(), joined: Date.now(), auto: false });
    this.room.broadcast(JSON.stringify({ t: "join", id: sender.id, name } satisfies ServerMsg), [sender.id]);
    // A newcomer isn't ready yet; the lobby keeps its time.
    if (roomChanged(this.race, this.room_ids(), Date.now())) this.sendRace();
  }

  onClose(conn: Connection) {
    if (!this.drivers.delete(conn.id)) return;
    this.slots.delete(conn.id);
    const left = leaveRace(this.race, conn.id);
    const lobby = roomChanged(this.race, this.room_ids(), Date.now());
    if (left || lobby) this.sendRace();
    this.room.broadcast(JSON.stringify({ t: "leave", id: conn.id } satisfies ServerMsg));
  }
}

RaceServer satisfies Party.Worker;
