"use client";

import { useCallback, useEffect, useState } from "react";
import type { HeistResult, HeistSide, Ring } from "@/lib/towns/heist";

// The city of the day for the Brasil page: today's city and its ring, your
// side, how many picked each side, yesterday's result (/api/towns/[slug]/brasil/heist), checked again
// every minute (how much stands moves through the day). `pick` sends your
// side and keeps the signed token the drive room takes.

export interface HeistDayView {
  day: string;
  key: string;
  name: string;
  uf: string | null;
  buildings: number;
  standing: number;
  ring: Ring | null;
}

export interface HeistMeView {
  side: HeistSide | null;
  resident: boolean;
  busts?: number;
}

const EVERY_MS = 60_000;

export function useHeist(slug: string, signedIn: boolean) {
  const [day, setDay] = useState<HeistDayView | null>(null);
  const [me, setMe] = useState<HeistMeView | null>(null);
  const [result, setResult] = useState<HeistResult | null>(null);
  const [sides, setSides] = useState<Record<HeistSide, number> | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/heist`, { cache: "no-store" });
        if (!res.ok || !live) return;
        const body = (await res.json()) as { day: HeistDayView | null; me: HeistMeView | null; result: HeistResult | null; sides?: Record<HeistSide, number> | null };
        setDay(body.day);
        setSides(body.sides ?? null);
        setMe((m) => (body.me ? { ...body.me, busts: Math.max(body.me.busts ?? 0, m?.busts ?? 0) } : null));
        setResult(body.result);
      } catch {
        // the next minute tries again
      }
    };
    void load();
    const id = setInterval(load, EVERY_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [slug, signedIn]);

  const pick = useCallback(
    async (side: HeistSide): Promise<HeistMeView | null> => {
      const had = me?.side ?? null;
      try {
        const res = await fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/heist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ side }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { me: HeistMeView; token: string | null };
        setMe(body.me);
        // A first pick counts at once on your own block; the next minute's check has everyone's.
        const now = body.me.side;
        if (now && !had) setSides((s) => (s ? { ...s, [now]: s[now] + 1 } : s));
        setToken(body.token);
        return body.me;
      } catch {
        return null;
      }
    },
    [slug, me?.side],
  );

  return { day, me, result, sides, token, pick };
}
