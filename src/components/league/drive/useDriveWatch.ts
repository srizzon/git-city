"use client";

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import { SnapshotBuffer, carColor, decodeState, type DriverInfo, type ServerMsg } from "@/lib/league-city/drive/net";
import { partyHost, type RemoteDriver } from "./useDrivePresence";
import { syncBotClock } from "@/lib/league-city/drive/bots";

// Watches the league city's drive room without driving (?watch=1): who's in
// the car right now and where, batched by the server a few times a second.
// Opens only while `enabled` (view mode); the drive room takes over in the car.

const HIDDEN_GRACE_MS = 60_000;

export function useDriveWatch(
  slug: string,
  enabled: boolean,
  /** Smash: the room's floor changes (damage, damage_all); on the Brasil map, its city races (rally, with the welcome's). */
  onDamage?: (msg: { t: string } & Record<string, unknown>) => void,
) {
  const remotes = useRef(new Map<string, RemoteDriver>());
  const onDamageRef = useRef(onDamage);
  useEffect(() => {
    onDamageRef.current = onDamage;
  });
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);

  // A tab left in the background lets go of the room after a minute (each open
  // socket keeps the room's Durable Object awake, and billed); back in front,
  // it reconnects and the welcome brings everyone back.
  const [away, setAway] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.hidden) timer = setTimeout(() => setAway(true), HIDDEN_GRACE_MS);
      else setAway(false);
    };
    document.addEventListener("visibilitychange", on);
    return () => {
      document.removeEventListener("visibilitychange", on);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const map = remotes.current;
    const publish = () => setDrivers([...map.values()].map(({ id, name }) => ({ id, name })));
    if (!enabled || away) {
      map.clear();
      publish();
      return;
    }
    const add = (id: string, name: string) => {
      if (!map.has(id)) map.set(id, { id, name, color: carColor(name), buffer: new SnapshotBuffer() });
    };

    const ws = new PartySocket({ host: partyHost(), party: "drive", room: slug, query: { watch: "1" } });
    ws.addEventListener("open", () => {
      // A reconnect gets a fresh welcome with everyone still there.
      map.clear();
      publish();
    });
    ws.addEventListener("message", (e: MessageEvent) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (Array.isArray(msg)) return;
      if (msg.t === "cars") {
        const now = performance.now();
        for (const [id, ...nums] of msg.cars) {
          const s = decodeState(nums);
          const r = map.get(id);
          if (r && s) r.buffer.push(now, s);
        }
      } else if (msg.t === "welcome") {
        syncBotClock(msg.now);
        if (msg.rally) onDamageRef.current?.({ t: "rally", rally: msg.rally, now: msg.now });
        const now = performance.now();
        for (const d of msg.drivers) {
          add(d.id, d.name);
          const s = d.s ? decodeState(d.s) : null;
          if (s) map.get(d.id)!.buffer.push(now, s);
        }
        publish();
      } else if (msg.t === "join") {
        add(msg.id, msg.name);
        publish();
      } else if (msg.t === "leave") {
        map.delete(msg.id);
        publish();
      } else if (msg.t === "damage" || msg.t === "damage_all" || msg.t === "rally") {
        onDamageRef.current?.(msg as unknown as { t: string } & Record<string, unknown>);
      }
    });
    return () => {
      ws.close();
      map.clear();
    };
  }, [slug, enabled, away]);

  return { remotes, drivers };
}
