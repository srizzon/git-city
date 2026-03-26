import type { Party } from "partykit/server";

interface RoomEntry {
  slug: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  roomType: string;
}

// ─── Lobby Party: aggregates player counts across all arcade rooms ──
export default class LobbyServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  readonly rooms = new Map<string, RoomEntry>();

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const stored = await this.room.storage.list<RoomEntry>({ prefix: "room:" });
    for (const [key, entry] of stored) {
      this.rooms.set(key.slice("room:".length), entry);
    }
  }

  async onRequest(request: Party.Request) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /rooms — list rooms (official always shown, others only if players > 0)
    if (request.method === "GET" && url.pathname.endsWith("/rooms")) {
      const list = [...this.rooms.values()]
        .filter((r) => r.playerCount > 0 || r.roomType === "official_floor")
        .sort((a, b) => b.playerCount - a.playerCount);
      return new Response(JSON.stringify({ rooms: list }), { headers: corsHeaders });
    }

    // POST /update — room party pings here with count update
    if (request.method === "POST" && url.pathname.endsWith("/update")) {
      try {
        const body = (await request.json()) as RoomEntry;
        if (!body.slug || typeof body.playerCount !== "number") {
          return new Response("Bad request", { status: 400 });
        }
        this.rooms.set(body.slug, body);
        await this.room.storage.put(`room:${body.slug}`, body);
        return new Response("OK", { headers: corsHeaders });
      } catch {
        return new Response("Bad request", { status: 400 });
      }
    }

    // GET / — total player count across all rooms
    if (request.method === "GET") {
      let total = 0;
      for (const r of this.rooms.values()) total += r.playerCount;
      return new Response(JSON.stringify({ count: total }), { headers: corsHeaders });
    }

    return new Response("Not found", { status: 404 });
  }
}

LobbyServer satisfies Party.Worker;
