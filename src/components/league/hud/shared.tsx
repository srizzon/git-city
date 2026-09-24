"use client";

import { useEffect, useState } from "react";

export function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function nextMondayUtc(now: number): number {
  const d = new Date(now);
  const day = d.getUTCDay();
  const add = day === 1 ? 7 : (8 - day) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add);
}

/** Time left in the weekly race (closes Monday 00:00 UTC). */
export function useCountdown(): string {
  const [left, setLeft] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const ms = nextMondayUtc(Date.now()) - Date.now();
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLeft(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return left;
}

export function Avatar({ src, size = 28, faded = false }: { src: string | null; size?: number; faded?: boolean }) {
  if (!src) return <div className="shrink-0 bg-bg-raised" style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      style={{ width: size, height: size, imageRendering: "pixelated", opacity: faded ? 0.45 : undefined }}
    />
  );
}

/** HUD surface: translucent, blurred, pixel border, clickable over the canvas. */
export const HUD_BOX = "pointer-events-auto border-[3px] border-border bg-bg/75 backdrop-blur-sm";
