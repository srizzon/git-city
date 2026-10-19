"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";
import { PaintBoard, type LostWhy, type PaintGeom } from "@/lib/towns/brasil-paint";
import type { UF } from "@/lib/towns/brasil-map";

// The State War on this screen: the board the drive room sends (in view mode
// through the watch socket, in the car through the drive's), who you paint
// for, and what just happened to your trail, for the HUD.

export interface PaintMe {
  /** Your state; null: no building in a state, you don't paint. */
  uf: UF | null;
  /** Painting points today, and the day's cap. */
  pts: number;
  cap: number;
}

/** The last thing that happened to your trail, for the HUD's toast (`at`: performance.now). */
export type PaintNews = { k: "got"; n: number; v: number; add: number; at: number } | { k: "lost"; why: LostWhy; at: number };

const isNums = (a: unknown): a is number[] => Array.isArray(a) && a.every((n) => typeof n === "number");

export function usePaint() {
  const board = useMemo(() => new PaintBoard(), []);
  const [me, setMe] = useState<PaintMe | null>(null);
  const [news, setNews] = useState<PaintNews | null>(null);
  /** Your car's id in the drive room (from its welcome), to find your trail. */
  const self = useRef<string | null>(null);

  const onMessage = useCallback(
    (msg: { t: string } & Record<string, unknown>) => {
      switch (msg.t) {
        case "welcome":
          if (typeof msg.you === "string") self.current = msg.you;
          break;
        case "paint_all":
          if (msg.g && isNums(msg.r) && Array.isArray(msg.tr)) board.all(msg.g as PaintGeom, msg.r, Number(msg.land) || 0, String(msg.wk), msg.tr as [string, number, number[]][], isNums(msg.hm) ? msg.hm : []);
          break;
        case "paint_trail":
          if (typeof msg.id === "string" && isNums(msg.a)) board.trail(msg.id, Number(msg.s), msg.a);
          break;
        case "paint_fill":
          if (isNums(msg.c)) board.fill(Number(msg.s), msg.c, typeof msg.by === "string" ? msg.by : null);
          break;
        case "paint_lost":
          if (typeof msg.id !== "string") break;
          board.lost(msg.id);
          if (msg.id === self.current) {
            setNews({ k: "lost", why: msg.why as LostWhy, at: performance.now() });
            posthog.capture("brasil_paint_lost", { why: msg.why });
          }
          break;
        case "paint_me":
          setMe({ uf: (msg.uf as UF | null) ?? null, pts: Number(msg.pts) || 0, cap: Number(msg.cap) || 0 });
          break;
        case "paint_got": {
          const n = Number(msg.n) || 0;
          const v = Number(msg.v) || 0;
          const add = Number(msg.add) || 0;
          setMe((m) => (m ? { ...m, pts: Number(msg.pts) || m.pts } : m));
          setNews({ k: "got", n, v, add, at: performance.now() });
          posthog.capture("brasil_paint_loop", { lots: n, invaded: v, points: add });
          break;
        }
      }
    },
    [board],
  );

  return { board, me, news, self, onMessage };
}
