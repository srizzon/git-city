"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import PartySocket from "partysocket";
import {
  FLAG_BOOST,
  FLAG_BRAKE,
  FLAG_DRIFT,
  FLAG_HORN,
  SEND_MS,
  SnapshotBuffer,
  carColor,
  decodeState,
  encodeState,
  type CarSnapshot,
  type DriverInfo,
  type ServerMsg,
} from "@/lib/league-city/drive/net";
import type { CarApi } from "./Car";
import type { DriveInputRef } from "./useDriveInput";

// Joins the league city's drive room: says hello, streams your car ~15 times
// a second, and keeps a snapshot buffer per remote car for RemoteCars to draw.

export interface RemoteDriver {
  id: string;
  name: string;
  color: string;
  buffer: SnapshotBuffer;
}

function partyHost(): string {
  // Local testing: ?partyhost=localhost:1999 against `npx partykit dev`.
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("partyhost");
    if (q) return q;
  }
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
}

const _snap: CarSnapshot = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, speed: 0, steer: 0, slip: 0, flags: 0 };

export function useDrivePresence({
  slug,
  name,
  car,
  input,
}: {
  slug: string;
  name: string;
  car: React.MutableRefObject<CarApi | null>;
  input: React.MutableRefObject<DriveInputRef>;
}) {
  const remotes = useRef(new Map<string, RemoteDriver>());
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const socket = useRef<PartySocket | null>(null);
  const lastSend = useRef(0);

  useEffect(() => {
    const map = remotes.current;
    const publish = () => setDrivers([...map.values()].map(({ id, name: n }) => ({ id, name: n })));
    const add = (id: string, n: string) => {
      if (!map.has(id)) map.set(id, { id, name: n, color: carColor(n), buffer: new SnapshotBuffer() });
    };

    const ws = new PartySocket({ host: partyHost(), party: "drive", room: slug });
    socket.current = ws;
    ws.addEventListener("open", () => {
      // A reconnect gets a fresh welcome with everyone still here.
      map.clear();
      publish();
      ws.send(JSON.stringify({ t: "hello", name }));
    });
    ws.addEventListener("message", (e: MessageEvent) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (Array.isArray(msg)) {
        const [, id, ...nums] = msg;
        const r = map.get(id);
        const s = decodeState(nums);
        if (r && s) r.buffer.push(performance.now(), s);
        return;
      }
      if (msg.t === "welcome") {
        for (const d of msg.drivers) {
          if (d.id === msg.you) continue;
          add(d.id, d.name);
          const s = d.s ? decodeState(d.s) : null;
          if (s) map.get(d.id)!.buffer.push(performance.now(), s);
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
      socket.current = null;
      ws.close();
      map.clear();
    };
  }, [slug, name]);

  // Stream your car.
  useFrame(() => {
    const ws = socket.current;
    const c = car.current;
    if (!ws || !c || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - lastSend.current < SEND_MS) return;
    lastSend.current = now;
    const p = c.body.translation();
    const q = c.body.rotation();
    const st = c.state;
    _snap.x = p.x;
    _snap.y = p.y;
    _snap.z = p.z;
    _snap.qx = q.x;
    _snap.qy = q.y;
    _snap.qz = q.z;
    _snap.qw = q.w;
    _snap.speed = st.speed;
    _snap.steer = st.steer;
    _snap.slip = st.slip;
    _snap.flags =
      (st.braking ? FLAG_BRAKE : 0) | (st.boosting ? FLAG_BOOST : 0) | (st.drifting ? FLAG_DRIFT : 0) | (input.current.input.horn ? FLAG_HORN : 0);
    ws.send(JSON.stringify(["s", ...encodeState(_snap)]));
  });

  return { remotes, drivers };
}
