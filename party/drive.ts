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
} from "../src/lib/league-city/drive/net";

// ─── League city driving ────────────────────────────────────
// One room per league city (room id = league slug). A relay: each driver says
// hello with a name, then streams its car state; the server validates,
// rate-limits and forwards it to everyone else. Names are display only (no
// rewards hang on them), like the fly party.

interface Driver {
  name: string;
  /** Last valid state, re-encoded, for late joiners. */
  state: number[] | null;
  lastState: number;
  lastBump: number;
}

export default class DriveServer implements Party.Server {
  private drivers = new Map<string, Driver>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Connection, _ctx: ConnectionContext) {
    void _ctx;
    const msg: ServerMsg = {
      t: "welcome",
      you: conn.id,
      drivers: [...this.drivers.entries()].map(([id, d]) => ({ id, name: d.name, s: d.state })),
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
    const { t, name, to, x, z } = msg as { t?: unknown; name?: unknown; to?: unknown; x?: unknown; z?: unknown };

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
    this.drivers.set(sender.id, { name, state: null, lastState: 0, lastBump: 0 });
    this.room.broadcast(JSON.stringify({ t: "join", id: sender.id, name } satisfies ServerMsg), [sender.id]);
  }

  onClose(conn: Connection) {
    if (!this.drivers.delete(conn.id)) return;
    this.room.broadcast(JSON.stringify({ t: "leave", id: conn.id } satisfies ServerMsg));
  }
}

DriveServer satisfies Party.Worker;
