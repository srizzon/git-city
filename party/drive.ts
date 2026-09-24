import type { Party, Connection, ConnectionContext } from "partykit/server";
import {
  MAX_DRIVERS,
  MAX_MESSAGE_BYTES,
  SEND_MS,
  BUMP_MIN_MS,
  decodeState,
  validBump,
  encodeState,
  validName,
  type ServerMsg,
  type BoxState,
} from "../src/lib/league-city/drive/net";
import {
  BOX_COUNT,
  BOX_RESPAWN_MS,
  TAKE_MIN_MS,
  USE_MIN_MS,
  isItem,
  randomItem,
  validUse,
  type BattleItem,
} from "../src/lib/league-city/drive/battle";

// ─── League city driving ────────────────────────────────────
// One room per league city (room id = league slug). A relay: each driver says
// hello with a name, then streams its car state; the server validates,
// rate-limits and forwards it to everyone else. Names are display only (no
// rewards hang on them), like the fly party.
//
// Battle: the server owns the item box slots (generation, when each is back)
// and who holds which attack, so a box is taken once and an attack is used
// once. Where a box sits and what an attack does are worked out by clients.

interface Driver {
  name: string;
  /** Last valid state, re-encoded, for late joiners. */
  state: number[] | null;
  lastState: number;
  lastBump: number;
  held: BattleItem | null;
  lastTake: number;
  lastUse: number;
}

interface Box {
  gen: number;
  availableAt: number;
}

export default class DriveServer implements Party.Server {
  private drivers = new Map<string, Driver>();
  private boxes: Box[] = Array.from({ length: BOX_COUNT }, () => ({ gen: 0, availableAt: 0 }));
  private fxSeq = 0;

  private boxStates(now: number): BoxState[] {
    return this.boxes.map((b) => ({ gen: b.gen, wait: Math.max(0, b.availableAt - now) }));
  }

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Connection, _ctx: ConnectionContext) {
    void _ctx;
    const msg: ServerMsg = {
      t: "welcome",
      you: conn.id,
      drivers: [...this.drivers.entries()].map(([id, d]) => ({ id, name: d.name, s: d.state })),
      boxes: this.boxStates(Date.now()),
    };
    conn.send(JSON.stringify(msg));
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Connection) {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) return;
    let msg: unknown;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    // Car state: ["s", ...11 numbers]
    if (Array.isArray(msg)) {
      const d = this.drivers.get(sender.id);
      if (!d || msg[0] !== "s") return;
      const now = Date.now();
      if (now - d.lastState < SEND_MS * 0.6) return; // faster than the client ever sends
      const s = decodeState(msg.slice(1));
      if (!s) return;
      d.lastState = now;
      d.state = encodeState(s);
      this.room.broadcast(JSON.stringify(["s", sender.id, ...d.state]), [sender.id]);
      return;
    }

    if (!msg || typeof msg !== "object") return;
    const { t, name, to, x, z, box, gen, item, dx, dz, id } = msg as Record<string, unknown>;

    // Battle: take a box, use what you hold, or report a ball that hit you.
    if (t === "take" || t === "use" || t === "hit") {
      const d = this.drivers.get(sender.id);
      if (!d) return;
      const now = Date.now();
      if (t === "take") {
        if (typeof box !== "number" || !Number.isInteger(box) || box < 0 || box >= BOX_COUNT) return;
        const b = this.boxes[box];
        if (gen !== b.gen || now < b.availableAt || now - d.lastTake < TAKE_MIN_MS || d.held) return;
        d.lastTake = now;
        b.gen += 1;
        b.availableAt = now + BOX_RESPAWN_MS;
        d.held = randomItem();
        sender.send(JSON.stringify({ t: "got", item: d.held } satisfies ServerMsg));
        this.room.broadcast(JSON.stringify({ t: "box", box, gen: b.gen, wait: BOX_RESPAWN_MS } satisfies ServerMsg));
        return;
      }
      if (t === "use") {
        const u = validUse(x, z, dx, dz);
        if (!u || !isItem(item) || d.held !== item || now - d.lastUse < USE_MIN_MS) return;
        d.lastUse = now;
        d.held = null;
        const fx: ServerMsg = { t: "fx", id: ++this.fxSeq, from: sender.id, item, ...u };
        this.room.broadcast(JSON.stringify(fx));
        return;
      }
      if (typeof id === "number" && Number.isInteger(id) && id > 0 && id <= this.fxSeq) {
        this.room.broadcast(JSON.stringify({ t: "gone", id } satisfies ServerMsg));
      }
      return;
    }

    // A bump: sender hit `to`; forward the velocity change to that driver only.
    if (t === "bump") {
      const d = this.drivers.get(sender.id);
      const now = Date.now();
      const v = validBump(x, z);
      if (!d || !v || typeof to !== "string" || to === sender.id || !this.drivers.has(to)) return;
      if (now - d.lastBump < BUMP_MIN_MS) return;
      d.lastBump = now;
      this.room.getConnection(to)?.send(JSON.stringify({ t: "bump", from: sender.id, x: v.x, z: v.z } satisfies ServerMsg));
      return;
    }

    if (t !== "hello" || !validName(name) || this.drivers.has(sender.id)) return;
    if (this.drivers.size >= MAX_DRIVERS) {
      sender.send(JSON.stringify({ t: "full" } satisfies ServerMsg));
      return;
    }
    this.drivers.set(sender.id, { name, state: null, lastState: 0, lastBump: 0, held: null, lastTake: 0, lastUse: 0 });
    this.room.broadcast(JSON.stringify({ t: "join", id: sender.id, name } satisfies ServerMsg), [sender.id]);
  }

  onClose(conn: Connection) {
    if (!this.drivers.delete(conn.id)) return;
    this.room.broadcast(JSON.stringify({ t: "leave", id: conn.id } satisfies ServerMsg));
  }
}

DriveServer satisfies Party.Worker;
