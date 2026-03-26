import PartySocket from "partysocket";
import type { ClientMsg, ServerMsg, PlayerState, ChatLogEntry } from "../types";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error";

export interface ArcadeCallbacks {
  onSync: (players: PlayerState[]) => void;
  onJoin: (player: PlayerState) => void;
  onLeave: (id: string) => void;
  onMove: (id: string, x: number, y: number, dir: PlayerState["dir"]) => void;
  onChat: (id: string, text: string) => void;
  onChatHistory: (entries: ChatLogEntry[]) => void;
  onSit: (id: string, x: number, y: number, dir: PlayerState["dir"]) => void;
  onStand: (id: string, x: number, y: number) => void;
  onAvatar: (id: string, spriteId: number) => void;
  onMapReload: (map: Record<string, unknown>) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

let socket: PartySocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connect(token: string, callbacks: ArcadeCallbacks, spriteId?: number, slug: string = "lobby"): void {
  if (socket) {
    socket.close();
  }

  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

  const query: Record<string, string> = { token };
  if (spriteId !== undefined) {
    query.sprite_id = String(spriteId);
  }

  socket = new PartySocket({
    host,
    room: slug,
    query,
  });

  callbacks.onStatusChange("connecting");

  socket.addEventListener("open", () => {
    // Clear any pending reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    callbacks.onStatusChange("connected");
  });

  socket.addEventListener("message", (event) => {
    // Any message means we're connected - clear reconnecting state
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    callbacks.onStatusChange("connected");

    let msg: ServerMsg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case "sync":
        callbacks.onSync(msg.players);
        break;
      case "join":
        callbacks.onJoin(msg.player);
        break;
      case "leave":
        callbacks.onLeave(msg.id);
        break;
      case "move":
        callbacks.onMove(msg.id, msg.x, msg.y, msg.dir);
        break;
      case "chat":
        callbacks.onChat(msg.id, msg.text);
        break;
      case "chat_history":
        callbacks.onChatHistory(msg.entries);
        break;
      case "sit":
        callbacks.onSit(msg.id, msg.x, msg.y, msg.dir);
        break;
      case "stand":
        callbacks.onStand(msg.id, msg.x, msg.y);
        break;
      case "avatar":
        callbacks.onAvatar(msg.id, msg.sprite_id);
        break;
      case "map_reload":
        callbacks.onMapReload(msg.map);
        break;
    }
  });

  socket.addEventListener("close", (event) => {
    // Code 4000 = duplicate tab, don't reconnect
    if (event.code === 4000) {
      callbacks.onStatusChange("error");
      return;
    }

    // Only show "reconnecting" after 2s delay to avoid flashing during normal reconnects
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        callbacks.onStatusChange("reconnecting");
        reconnectTimer = null;
      }, 2000);
    }
  });

  socket.addEventListener("error", () => {
    // Don't immediately show error - PartySocket will auto-retry
  });
}

export function sendMove(dir: ClientMsg & { type: "move" }) {
  socket?.send(JSON.stringify(dir));
}

const CHAT_MAX_LENGTH = 100;

export function sendChat(text: string) {
  const trimmed = text.slice(0, CHAT_MAX_LENGTH);
  if (!trimmed) return;
  const msg: ClientMsg = { type: "chat", text: trimmed };
  socket?.send(JSON.stringify(msg));
}

export function sendSit(x: number, y: number, dir: "up" | "down" | "left" | "right") {
  const msg: ClientMsg = { type: "sit", x, y, dir };
  socket?.send(JSON.stringify(msg));
}

export function sendStand() {
  const msg: ClientMsg = { type: "stand" };
  socket?.send(JSON.stringify(msg));
}

export function sendAvatar(spriteId: number) {
  const msg: ClientMsg = { type: "avatar", sprite_id: spriteId };
  socket?.send(JSON.stringify(msg));
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    // Prevent PartySocket auto-reconnect on intentional close
    (socket as unknown as { maxRetries: number }).maxRetries = 0;
    socket.close();
    socket = null;
  }
}
