import type { Party, Connection, ConnectionContext } from "partykit/server";

// ─── Types ──────────────────────────────────────────────────
interface PilotState {
  login: string;
  avatar: string;
  vehicle: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
}

type ClientMsg =
  | { type: "join"; login: string; avatar: string; vehicle: string }
  | { type: "move"; x: number; y: number; z: number; yaw: number; bank: number };

type ServerMsg =
  | { type: "sync"; pilots: (PilotState & { id: string })[] }
  | { type: "join"; pilot: PilotState & { id: string } }
  | { type: "move"; id: string; x: number; y: number; z: number; yaw: number; bank: number }
  | { type: "leave"; id: string };

// ─── Rate limiting ──────────────────────────────────────────
const MOVE_INTERVAL_MS = 80;

// ─── Server ─────────────────────────────────────────────────
export default class FlyServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  readonly pilots = new Map<string, PilotState>();
  readonly lastMove = new Map<string, number>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Connection, _ctx: ConnectionContext) {
    // Send current pilots to the new connection
    const pilots = [...this.pilots.entries()].map(([id, p]) => ({ id, ...p }));
    const syncMsg: ServerMsg = { type: "sync", pilots };
    conn.send(JSON.stringify(syncMsg));
  }

  onMessage(message: string, sender: Connection) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    const id = sender.id;
    const now = Date.now();

    if (msg.type === "join") {
      if (typeof msg.login !== "string" || typeof msg.avatar !== "string" || typeof msg.vehicle !== "string") return;
      const pilot: PilotState = {
        login: msg.login.slice(0, 39),
        avatar: msg.avatar.slice(0, 256),
        vehicle: msg.vehicle.slice(0, 32),
        x: 0,
        y: 120,
        z: 400,
        yaw: 0,
        bank: 0,
      };
      this.pilots.set(id, pilot);
      const joinMsg: ServerMsg = { type: "join", pilot: { id, ...pilot } };
      this.room.broadcast(JSON.stringify(joinMsg), [sender.id]);
    }

    if (msg.type === "move") {
      const last = this.lastMove.get(id) ?? 0;
      if (now - last < MOVE_INTERVAL_MS) return;
      this.lastMove.set(id, now);

      const pilot = this.pilots.get(id);
      if (!pilot) return;

      if (typeof msg.x !== "number" || typeof msg.y !== "number" || typeof msg.z !== "number") return;
      if (typeof msg.yaw !== "number" || typeof msg.bank !== "number") return;

      pilot.x = msg.x;
      pilot.y = msg.y;
      pilot.z = msg.z;
      pilot.yaw = msg.yaw;
      pilot.bank = msg.bank;

      const moveMsg: ServerMsg = { type: "move", id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, bank: msg.bank };
      this.room.broadcast(JSON.stringify(moveMsg), [sender.id]);
    }
  }

  onClose(conn: Connection) {
    const id = conn.id;
    this.pilots.delete(id);
    this.lastMove.delete(id);
    const leaveMsg: ServerMsg = { type: "leave", id };
    this.room.broadcast(JSON.stringify(leaveMsg));
  }
}

FlyServer satisfies Party.Worker;
