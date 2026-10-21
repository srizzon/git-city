"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CHAT_MAX, CHAT_MS, EMOTES, EMOTE_MIN_MS, EMOTE_MS } from "@/lib/league-city/drive/emotes";
import { INTERP_MS, emptySnapshot, type ClientMsg } from "@/lib/league-city/drive/net";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import type { CarApi } from "./Car";
import type { RemoteDriver } from "./useDrivePresence";

// Quick reactions (lib drive/emotes) and typed messages as bubbles over the
// cars: yours the moment you send it, everyone else's when the room forwards
// it. One bubble per car; a new one replaces the old.

export interface EmoteApi {
  /** Pop reaction slot `e` over your car and tell the room. */
  send: (e: number) => void;
  /** Show a typed message over your car and tell the room (it checks it: lib/chat-filter). */
  say: (text: string) => void;
}

import type { EmoteLogEntry } from "@/lib/league-city/drive/emote-log";

interface Bubble {
  key: number;
  /** "me" or a driver id. */
  who: string;
  e: number;
  text?: string;
}

/** Over the name tag (RemoteCars draws it at 7.5); yours, with no tag, just over the roof. */
const LIFT = 11;
const SELF_LIFT = 6.5;

function EmoteBubble({ bubble, carRef, remotes }: { bubble: Bubble; carRef: React.MutableRefObject<CarApi | null>; remotes: React.MutableRefObject<Map<string, RemoteDriver>> }) {
  const group = useRef<THREE.Group>(null);
  const snap = useRef(emptySnapshot());
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (bubble.who === "me") {
      const c = carRef.current;
      if (c) g.position.set(c.group.position.x, c.group.position.y + SELF_LIFT, c.group.position.z);
      return;
    }
    const s = remotes.current.get(bubble.who)?.buffer.sample(performance.now() - INTERP_MS, snap.current);
    if (s) g.position.set(s.x * M_TO_UNIT, s.y * M_TO_UNIT + LIFT, s.z * M_TO_UNIT);
  });
  return (
    <group ref={group}>
      <Html center zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
        {bubble.text ? (
          <div
            className="w-max max-w-[14rem] break-words border-[3px] border-border bg-bg/90 px-2 py-1 text-center text-[11px] normal-case leading-snug text-cream"
            style={{ animation: `emote-pop ${CHAT_MS}ms ease-out both` }}
          >
            {bubble.text}
          </div>
        ) : (
          <div
            className="border-[3px] border-border bg-bg/85 px-1.5 py-0.5 text-[26px] leading-none"
            style={{ animation: `emote-pop ${EMOTE_MS}ms ease-out both` }}
            aria-hidden
          >
            {EMOTES[bubble.e]}
          </div>
        )}
      </Html>
    </group>
  );
}

export default function EmoteBubbles({
  carRef,
  remotes,
  send,
  apiRef,
  sinkRef,
  chatSinkRef,
  name,
  onLog,
}: {
  carRef: React.MutableRefObject<CarApi | null>;
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  send: (msg: ClientMsg) => void;
  apiRef: React.MutableRefObject<EmoteApi | null>;
  /** The drive room's emote messages land here. */
  sinkRef: React.MutableRefObject<(from: string, e: number) => void>;
  /** And its typed messages, under the login the room checked. */
  chatSinkRef: React.MutableRefObject<(from: string, login: string, text: string) => void>;
  /** Your name in the room, for the log. */
  name: string;
  /** Every reaction, yours too, for the HUD's log. */
  onLog?: (entry: EmoteLogEntry) => void;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const seq = useRef(0);
  const last = useRef(0);
  const lastSay = useRef(0);
  // DriveWorld hands a new `send` every render; the timers must outlive those.
  const sendRef = useRef(send);
  const logRef = useRef({ name, onLog });
  useEffect(() => {
    sendRef.current = send;
    logRef.current = { name, onLog };
  });

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // `said`: a typed message and the login it goes under (yours: your name).
    const pop = (who: string, e: number, said?: { text: string; login: string }) => {
      const key = ++seq.current;
      setBubbles((list) => [...list.filter((b) => b.who !== who), { key, who, e, text: said?.text }]);
      const { name: me, onLog: log } = logRef.current;
      const n = said?.login ?? (who === "me" ? me : remotes.current.get(who)?.name);
      if (n) log?.({ key, name: n, e, text: said?.text, mine: who === "me" });
      const t = setTimeout(() => {
        timers.delete(t);
        setBubbles((list) => list.filter((b) => b.key !== key));
      }, said ? CHAT_MS : EMOTE_MS);
      timers.add(t);
    };
    apiRef.current = {
      send: (e) => {
        const now = performance.now();
        if (now - last.current < EMOTE_MIN_MS || !EMOTES[e]) return;
        last.current = now;
        sendRef.current({ t: "emote", e });
        pop("me", e);
      },
      say: (raw) => {
        const text = raw.trim().slice(0, CHAT_MAX);
        const now = performance.now();
        // The room drops anything faster than one a second.
        if (!text || now - lastSay.current < 1000) return;
        lastSay.current = now;
        sendRef.current({ t: "chat", text });
        pop("me", 0, { text, login: logRef.current.name });
      },
    };
    sinkRef.current = pop;
    chatSinkRef.current = (from, login, text) => pop(from, 0, { text, login });
    return () => {
      apiRef.current = null;
      sinkRef.current = () => {};
      chatSinkRef.current = () => {};
      for (const t of timers) clearTimeout(t);
    };
  }, [apiRef, sinkRef, chatSinkRef, remotes]);

  return (
    <>
      {bubbles.map((b) => (
        <EmoteBubble key={b.key} bubble={b} carRef={carRef} remotes={remotes} />
      ))}
    </>
  );
}
