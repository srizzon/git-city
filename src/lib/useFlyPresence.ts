"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
  hp: number;
  pvpEnabled: boolean;
  invulnUntil: number;
  downedUntil: number;
  joinedAt: number;
}

export interface ActiveProjectile {
  id: string;
  shooterId: string;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  bornAt: number;
}

export interface KillFeedEntry {
  id: string;
  killerLogin: string;
  victimLogin: string;
  killerWasSelf: boolean;
  victimWasSelf: boolean;
  happyHour: boolean;
  at: number;
}

/** Latest server-issued respawn the VehicleFlight should teleport to. */
export interface PendingRespawn {
  x: number;
  y: number;
  z: number;
  at: number; // Date.now() when the respawn msg arrived
}

export interface SelfPvpState {
  hp: number;
  pvpEnabled: boolean;
  invulnUntil: number;
  downedUntil: number;
  joinedAt: number;
  lastAttackerId: string | null;
  lastAttackerAt: number;
  /** World position of the last attacker, captured at hit/kill time. */
  lastAttackerX: number;
  lastAttackerZ: number;
  /** Timestamp of the last shot we confirmed as a hit (local detection). */
  lastHitConfirmedAt: number;
  /** Timestamp of the last incoming damage on us, for screen shake / flash. */
  lastDamageAt: number;
  /** Rolling list of recent kill events (capped). Newest first. */
  killFeed: KillFeedEntry[];
}

const KILL_FEED_MAX = 6;

type ServerMsg =
  | { type: "sync"; pilots: ({ id: string } & Omit<RemotePilot, "prevX" | "prevY" | "prevZ" | "prevYaw" | "prevBank" | "lerpTimer">)[] }
  | { type: "join"; pilot: { id: string } & Omit<RemotePilot, "prevX" | "prevY" | "prevZ" | "prevYaw" | "prevBank" | "lerpTimer"> }
  | { type: "move"; id: string; x: number; y: number; z: number; yaw: number; bank: number }
  | { type: "leave"; id: string }
  | { type: "shoot"; shooterId: string; x: number; y: number; z: number; dirX: number; dirY: number; dirZ: number }
  | { type: "hit"; targetId: string; shooterId: string; newHp: number }
  | { type: "kill"; killerId: string; victimId: string; victimLogin: string; killerLogin: string; happyHour: boolean; killToken: string; killTokenExpiresAt: number }
  | { type: "respawn"; id: string; x: number; y: number; z: number; invulnUntil: number }
  | { type: "pvp_state"; id: string; pvpEnabled: boolean; hp: number; invulnUntil: number; downedUntil: number; joinedAt: number };

const SEND_INTERVAL_MS = 100;
const PROJECTILE_LIFE_MS = 1500;
const PVP_TOGGLE_STORAGE_KEY = "git-city-pvp-enabled";

function readPvpPreference(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(PVP_TOGGLE_STORAGE_KEY);
  if (v === null) return true;
  return v === "true";
}

function writePvpPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PVP_TOGGLE_STORAGE_KEY, String(enabled));
}

// ─── Hook ───────────────────────────────────────────────────

export function useFlyPresence(
  flying: boolean,
  login: string,
  avatar: string,
  vehicle: string,
): {
  pilotsRef: React.MutableRefObject<Map<string, RemotePilot>>;
  projectilesRef: React.MutableRefObject<Map<string, ActiveProjectile>>;
  selfStateRef: React.MutableRefObject<SelfPvpState>;
  pendingRespawnRef: React.MutableRefObject<PendingRespawn | null>;
  selfId: string | null;
  pvpEnabled: boolean;
  sendMove: (x: number, y: number, z: number, yaw: number, bank: number) => void;
  sendShoot: (x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number) => void;
  reportHit: (targetId: string) => void;
  togglePvp: (enabled: boolean) => void;
} {
  const pilotsRef = useRef<Map<string, RemotePilot>>(new Map());
  const projectilesRef = useRef<Map<string, ActiveProjectile>>(new Map());
  const pendingRespawnRef = useRef<PendingRespawn | null>(null);
  const selfStateRef = useRef<SelfPvpState>({
    hp: 3,
    pvpEnabled: readPvpPreference(),
    invulnUntil: 0,
    downedUntil: 0,
    joinedAt: 0,
    lastAttackerId: null,
    lastAttackerAt: 0,
    lastAttackerX: 0,
    lastAttackerZ: 0,
    lastHitConfirmedAt: 0,
    lastDamageAt: 0,
    killFeed: [],
  });
  const socketRef = useRef<PartySocket | null>(null);
  const lastSendRef = useRef(0);
  const flyingRef = useRef(flying);
  flyingRef.current = flying;
  const selfIdRef = useRef<string | null>(null);

  const [selfId, setSelfId] = useState<string | null>(null);
  const [pvpEnabled, setPvpEnabled] = useState<boolean>(readPvpPreference());

  // ─── Connection lifecycle ────────────────────────────────
  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

    const ws = new PartySocket({
      host,
      party: "fly",
      room: "city",
    });
    socketRef.current = ws;

    ws.addEventListener("open", () => {
      selfIdRef.current = ws.id;
      setSelfId(ws.id);
      if (flyingRef.current) {
        ws.send(JSON.stringify({ type: "join", login: login || "anonymous", avatar, vehicle }));
        // Sync local pvp preference to server immediately
        ws.send(JSON.stringify({ type: "toggle_pvp", enabled: selfStateRef.current.pvpEnabled }));
      }
    });

    ws.addEventListener("message", (evt) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      const meId = selfIdRef.current;

      if (msg.type === "sync") {
        for (const p of msg.pilots) {
          if (meId && p.id === meId) {
            selfStateRef.current.hp = p.hp;
            selfStateRef.current.invulnUntil = p.invulnUntil;
            selfStateRef.current.downedUntil = p.downedUntil;
            selfStateRef.current.joinedAt = p.joinedAt;
            selfStateRef.current.pvpEnabled = p.pvpEnabled;
            continue;
          }
          pilotsRef.current.set(p.id, {
            login: p.login, avatar: p.avatar, vehicle: p.vehicle,
            x: p.x, y: p.y, z: p.z, yaw: p.yaw, bank: p.bank,
            prevX: p.x, prevY: p.y, prevZ: p.z, prevYaw: p.yaw, prevBank: p.bank,
            lerpTimer: 1,
            hp: p.hp, pvpEnabled: p.pvpEnabled,
            invulnUntil: p.invulnUntil, downedUntil: p.downedUntil, joinedAt: p.joinedAt,
          });
        }
      }

      if (msg.type === "join") {
        const p = msg.pilot;
        if (meId && p.id === meId) {
          selfStateRef.current.hp = p.hp;
          selfStateRef.current.invulnUntil = p.invulnUntil;
          selfStateRef.current.downedUntil = p.downedUntil;
          selfStateRef.current.joinedAt = p.joinedAt;
          selfStateRef.current.pvpEnabled = p.pvpEnabled;
          return;
        }
        pilotsRef.current.set(p.id, {
          login: p.login, avatar: p.avatar, vehicle: p.vehicle,
          x: p.x, y: p.y, z: p.z, yaw: p.yaw, bank: p.bank,
          prevX: p.x, prevY: p.y, prevZ: p.z, prevYaw: p.yaw, prevBank: p.bank,
          lerpTimer: 1,
          hp: p.hp, pvpEnabled: p.pvpEnabled,
          invulnUntil: p.invulnUntil, downedUntil: p.downedUntil, joinedAt: p.joinedAt,
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

      if (msg.type === "shoot") {
        // Skip own shots — we already spawned them optimistically when
        // the player pressed fire. Adding the broadcast copy would
        // duplicate every shot.
        if (meId && msg.shooterId === meId) return;
        const id = `${msg.shooterId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        projectilesRef.current.set(id, {
          id,
          shooterId: msg.shooterId,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          dirX: msg.dirX,
          dirY: msg.dirY,
          dirZ: msg.dirZ,
          bornAt: Date.now(),
        });
      }

      if (msg.type === "hit") {
        console.log(
          `[FORCE PUSH] server hit msg → target=${msg.targetId.slice(0, 8)} shooter=${msg.shooterId.slice(0, 8)} newHp=${msg.newHp} (me=${meId?.slice(0, 8)})`,
        );
        if (meId && msg.targetId === meId) {
          selfStateRef.current.hp = msg.newHp;
          selfStateRef.current.lastAttackerId = msg.shooterId;
          selfStateRef.current.lastAttackerAt = Date.now();
          selfStateRef.current.lastDamageAt = Date.now();
          const attacker = pilotsRef.current.get(msg.shooterId);
          if (attacker) {
            selfStateRef.current.lastAttackerX = attacker.x;
            selfStateRef.current.lastAttackerZ = attacker.z;
          }
        } else {
          const target = pilotsRef.current.get(msg.targetId);
          if (target) target.hp = msg.newHp;
        }
      }

      if (msg.type === "kill") {
        console.log(
          `[FORCE PUSH] server kill msg → killer=${msg.killerLogin} victim=${msg.victimLogin} hh=${msg.happyHour} (me=${meId?.slice(0, 8)})`,
        );
        // Always add to the kill feed — every player sees who killed who.
        const killerWasSelf = meId === msg.killerId;
        const victimWasSelf = meId === msg.victimId;
        const entry: KillFeedEntry = {
          id: `${msg.killToken || msg.killerId + msg.victimId + Date.now()}`,
          killerLogin: msg.killerLogin,
          victimLogin: msg.victimLogin,
          killerWasSelf,
          victimWasSelf,
          happyHour: !!msg.happyHour,
          at: Date.now(),
        };
        selfStateRef.current.killFeed = [
          entry,
          ...selfStateRef.current.killFeed,
        ].slice(0, KILL_FEED_MAX);

        if (victimWasSelf) {
          selfStateRef.current.hp = 0;
          selfStateRef.current.downedUntil = Date.now() + 5000;
          selfStateRef.current.lastAttackerId = msg.killerId;
          selfStateRef.current.lastAttackerAt = Date.now();
          selfStateRef.current.lastDamageAt = Date.now();
          const attacker = pilotsRef.current.get(msg.killerId);
          if (attacker) {
            selfStateRef.current.lastAttackerX = attacker.x;
            selfStateRef.current.lastAttackerZ = attacker.z;
          }
        } else {
          const target = pilotsRef.current.get(msg.victimId);
          if (target) {
            target.hp = 0;
            target.downedUntil = Date.now() + 5000;
          }
        }

        // If we are the killer, credit the kill server-side. The signed
        // kill_token already binds killer/victim/happyHour/expiry, so the
        // client just forwards it; the API verifies the HMAC.
        if (meId && msg.killerId === meId) {
          fetch("/api/pvp/credit-kill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kill_token: msg.killToken }),
          }).catch(() => { /* silent — server-side caps are source of truth */ });
        }
      }

      if (msg.type === "respawn") {
        console.log(
          `[FORCE PUSH] server respawn msg → id=${msg.id.slice(0, 8)} at=(${msg.x.toFixed(0)},${msg.z.toFixed(0)}) (me=${meId?.slice(0, 8)})`,
        );
        if (meId && msg.id === meId) {
          selfStateRef.current.hp = 3;
          selfStateRef.current.downedUntil = 0;
          selfStateRef.current.invulnUntil = msg.invulnUntil;
          // Signal VehicleFlight to teleport the local vehicle to the
          // server-issued respawn position. Without this the player
          // keeps flying wherever they died.
          pendingRespawnRef.current = {
            x: msg.x,
            y: msg.y,
            z: msg.z,
            at: Date.now(),
          };
        } else {
          const target = pilotsRef.current.get(msg.id);
          if (target) {
            target.hp = 3;
            target.downedUntil = 0;
            target.invulnUntil = msg.invulnUntil;
            target.x = msg.x;
            target.y = msg.y;
            target.z = msg.z;
            target.prevX = msg.x;
            target.prevY = msg.y;
            target.prevZ = msg.z;
            target.lerpTimer = 1;
          }
        }
      }

      if (msg.type === "pvp_state") {
        if (meId && msg.id === meId) {
          selfStateRef.current.pvpEnabled = msg.pvpEnabled;
          selfStateRef.current.hp = msg.hp;
          selfStateRef.current.invulnUntil = msg.invulnUntil;
          selfStateRef.current.downedUntil = msg.downedUntil;
          selfStateRef.current.joinedAt = msg.joinedAt;
        } else {
          const target = pilotsRef.current.get(msg.id);
          if (target) {
            target.pvpEnabled = msg.pvpEnabled;
            target.hp = msg.hp;
            target.invulnUntil = msg.invulnUntil;
            target.downedUntil = msg.downedUntil;
          }
        }
      }
    });

    const pilots = pilotsRef.current;
    const projectiles = projectilesRef.current;
    return () => {
      ws.close();
      socketRef.current = null;
      pilots.clear();
      projectiles.clear();
      selfIdRef.current = null;
      setSelfId(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Garbage-collect old projectiles ─────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [id, p] of projectilesRef.current) {
        if (now - p.bornAt > PROJECTILE_LIFE_MS) {
          projectilesRef.current.delete(id);
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // ─── Send join on flying state change ────────────────────
  useEffect(() => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (flying) {
      ws.send(JSON.stringify({ type: "join", login: login || "anonymous", avatar, vehicle }));
      ws.send(JSON.stringify({ type: "toggle_pvp", enabled: selfStateRef.current.pvpEnabled }));
    }
  }, [flying, login, avatar, vehicle]);

  // ─── Public callbacks ────────────────────────────────────
  const sendMove = useCallback((x: number, y: number, z: number, yaw: number, bank: number) => {
    if (!flyingRef.current || !socketRef.current) return;
    const now = Date.now();
    if (now - lastSendRef.current < SEND_INTERVAL_MS) return;
    lastSendRef.current = now;
    socketRef.current?.send(JSON.stringify({ type: "move", x, y, z, yaw, bank }));
  }, []);

  const sendShoot = useCallback((x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!flyingRef.current) return;
    if (!selfStateRef.current.pvpEnabled) return;
    // Optimistic local spawn: shows the projectile instantly without
    // waiting for the WS roundtrip. Otherwise the vehicle advances during
    // the ~5-50ms broadcast delay and the bullet appears to be born
    // behind the nose. The broadcast handler dedupes by ignoring shots
    // whose shooterId matches our own connection id.
    const me = selfIdRef.current;
    if (me) {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      projectilesRef.current.set(localId, {
        id: localId,
        shooterId: me,
        x, y, z, dirX, dirY, dirZ,
        bornAt: Date.now(),
      });
    }
    ws.send(JSON.stringify({ type: "shoot", x, y, z, dirX, dirY, dirZ }));
  }, []);

  const reportHit = useCallback((targetId: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "hit", targetId }));
  }, []);

  const togglePvp = useCallback((enabled: boolean) => {
    selfStateRef.current.pvpEnabled = enabled;
    writePvpPreference(enabled);
    setPvpEnabled(enabled);
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "toggle_pvp", enabled }));
    }
  }, []);

  return {
    pilotsRef,
    projectilesRef,
    selfStateRef,
    pendingRespawnRef,
    selfId,
    pvpEnabled,
    sendMove,
    sendShoot,
    reportHit,
    togglePvp,
  };
}
