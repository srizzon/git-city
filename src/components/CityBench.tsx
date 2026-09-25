"use client";

// ?bench=N on the home page: pads the city with copies of its buildings, shifted
// east and south the way the Bay Area would extend it, until it holds N, and
// shows a frame-rate readout. Measures the real renderer at a future city size.
import { useEffect, useRef, useState } from "react";
import type { CityBuilding } from "@/lib/github";

// Copy offsets in world units (SF spans ~14k): east (Oakland), south-east,
// south (the peninsula), then further out.
const OFFSETS: [number, number][] = [
  [15000, 0], [15000, 14000], [0, 14000], [-15000, 14000], [30000, 0], [30000, 14000],
];
const MAX_BENCH = 400_000;

export function benchCount(param: string | null): number {
  const n = Number(param);
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_BENCH, Math.floor(n)) : 0;
}

export function padBuildings(buildings: CityBuilding[], target: number): CityBuilding[] {
  if (target <= buildings.length || buildings.length === 0) return buildings;
  const out = buildings.slice();
  for (let copy = 0; out.length < target && copy < OFFSETS.length; copy++) {
    const [ox, oz] = OFFSETS[copy];
    for (const b of buildings) {
      if (out.length >= target) break;
      const login = `${b.login}~${copy + 1}`;
      out.push({ ...b, login, loginLower: login.toLowerCase(), position: [b.position[0] + ox, b.position[1], b.position[2] + oz] });
    }
  }
  return out;
}

/** Frame-rate readout: average fps and the slowest 5% of frames, per second. */
export function BenchOverlay({ count }: { count: number }) {
  const [stats, setStats] = useState({ fps: 0, p95: 0 });
  const frames = useRef<number[]>([]);
  useEffect(() => {
    let raf = 0, last = performance.now(), windowStart = last;
    const tick = (t: number) => {
      frames.current.push(t - last);
      last = t;
      if (t - windowStart >= 1000) {
        const f = frames.current.slice().sort((a, b) => a - b);
        const p95 = f[Math.floor(f.length * 0.95)] ?? 0;
        setStats({ fps: Math.round((f.length * 1000) / (t - windowStart)), p95: Math.round(p95) });
        frames.current = [];
        windowStart = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none fixed left-3 top-16 z-[100] bg-black/80 px-3 py-2 font-pixel text-xs text-lime-300">
      <div>{count.toLocaleString("en-US")} buildings</div>
      <div>{stats.fps} fps · p95 {stats.p95} ms</div>
    </div>
  );
}
