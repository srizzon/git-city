"use client";

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import { SnapshotBuffer, carColor, decodeState, type DriverInfo, type ServerMsg } from "@/lib/league-city/drive/net";
import { partyHost, type RemoteDriver } from "./useDrivePresence";
import { syncBotClock } from "@/lib/league-city/drive/bots";

// Watches the league city's drive room without driving (?watch=1): who's in
// the car right now and where, batched by the server a few times a second.
// Opens only while `enabled` (view mode); the drive room takes over in the car.

export function useDriveWatch(slug: string, enabled: boolean) {
  const remotes = useRef(new Map<string, RemoteDriver>());
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);

  useEffect(() => {
    const map = remotes.current;
    const publish = () => setDrivers([...map.values()].map(({ id, name }) => ({ id, name })));
    if (!enabled) {
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
      }
    });
    return () => {
      ws.close();
      map.clear();
    };
  }, [slug, enabled]);

  return { remotes, drivers };
}
