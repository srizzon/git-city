"use client";

import { useEffect, useRef, useCallback } from "react";
import PartySocket from "partysocket";

// ─── Types ──────────────────────────────────────────────────

export interface RemotePilot {
  login: string;
  avatar: string;
  vehicle: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  prevYaw: number;
  prevBank: number;
  lerpTimer: number;
}

type ServerMsg =
  | { type: "sync"; pilots: { id: string; login: string; avatar: string; vehicle: string; x: number; y: number; z: number; yaw: number; bank: number }[] }
  | { type: "join"; pilot: { id: string; login: string; avatar: string; vehicle: string; x: number; y: number; z: number; yaw: number; bank: number } }
  | { type: "move"; id: string; x: number; y: number; z: number; yaw: number; bank: number }
  | { type: "leave"; id: string };

// ─── Throttle interval ──────────────────────────────────────
const SEND_INTERVAL_MS = 100;

// ─── Hook ───────────────────────────────────────────────────

export function useFlyPresence(
  active: boolean,
  login: string,
  avatar: string,
  vehicle: string,
): {
  pilotsRef: React.MutableRefObject<Map<string, RemotePilot>>;
  sendMove: (x: number, y: number, z: number, yaw: number, bank: number) => void;
} {
  const pilotsRef = useRef<Map<string, RemotePilot>>(new Map());
  const socketRef = useRef<PartySocket | null>(null);
  const lastSendRef = useRef(0);

  useEffect(() => {
    if (!active || !login) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      pilotsRef.current.clear();
      return;
    }

    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

    const ws = new PartySocket({
      host,
      party: "fly",
      room: "city",
    });
    socketRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", login, avatar, vehicle }));
    });

    ws.addEventListener("message", (evt) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (msg.type === "sync") {
        for (const p of msg.pilots) {
          pilotsRef.current.set(p.id, {
            login: p.login, avatar: p.avatar, vehicle: p.vehicle,
            x: p.x, y: p.y, z: p.z, yaw: p.yaw, bank: p.bank,
            prevX: p.x, prevY: p.y, prevZ: p.z, prevYaw: p.yaw, prevBank: p.bank,
            lerpTimer: 1,
          });
        }
      }

      if (msg.type === "join") {
        const p = msg.pilot;
        pilotsRef.current.set(p.id, {
          login: p.login, avatar: p.avatar, vehicle: p.vehicle,
          x: p.x, y: p.y, z: p.z, yaw: p.yaw, bank: p.bank,
          prevX: p.x, prevY: p.y, prevZ: p.z, prevYaw: p.yaw, prevBank: p.bank,
          lerpTimer: 1,
        });
      }

      if (msg.type === "move") {
        const pilot = pilotsRef.current.get(msg.id);
        if (pilot) {
          pilot.prevX = pilot.x;
          pilot.prevY = pilot.y;
          pilot.prevZ = pilot.z;
          pilot.prevYaw = pilot.yaw;
          pilot.prevBank = pilot.bank;
          pilot.x = msg.x;
          pilot.y = msg.y;
          pilot.z = msg.z;
          pilot.yaw = msg.yaw;
          pilot.bank = msg.bank;
          pilot.lerpTimer = 0;
        }
      }

      if (msg.type === "leave") {
        pilotsRef.current.delete(msg.id);
      }
    });

    return () => {
      ws.close();
      socketRef.current = null;
      pilotsRef.current.clear();
    };
  }, [active, login, avatar, vehicle]);

  const sendMove = useCallback((x: number, y: number, z: number, yaw: number, bank: number) => {
    const now = Date.now();
    if (now - lastSendRef.current < SEND_INTERVAL_MS) return;
    lastSendRef.current = now;
    socketRef.current?.send(JSON.stringify({ type: "move", x, y, z, yaw, bank }));
  }, []);

  return { pilotsRef, sendMove };
}
