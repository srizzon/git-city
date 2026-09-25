"use client";

import { useEffect, useRef } from "react";
import { theTrack } from "@/lib/league-city/race/track";
import type { RaceTelemetry } from "@/lib/league-city/race/telemetry";

// The whole track from above, north up: you (lime, with a ring), your ghost
// (white) and everyone else (their color). The track is drawn once; the dots
// every animation frame from the telemetry.

const SIZE = 190;
const PAD = 14;

export default function Minimap({ telemetry }: { telemetry: RaceTelemetry }) {
  const base = useRef<HTMLCanvasElement>(null);
  const dots = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const track = theTrack();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of track.samples) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = (SIZE - PAD * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (SIZE - (maxX - minX) * k) / 2;
    const oz = (SIZE - (maxZ - minZ) * k) / 2;
    const toX = (x: number) => ox + (x - minX) * k;
    const toY = (z: number) => oz + (z - minZ) * k;

    for (const c of [base.current, dots.current]) {
      if (!c) continue;
      c.width = SIZE * dpr;
      c.height = SIZE * dpr;
      c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const g = base.current?.getContext("2d");
    if (g) {
      const path = () => {
        g.beginPath();
        track.samples.forEach((p, i) => (i ? g.lineTo(toX(p.x), toY(p.z)) : g.moveTo(toX(p.x), toY(p.z))));
        g.closePath();
      };
      g.lineJoin = "round";
      g.lineCap = "round";
      path();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 9;
      g.stroke();
      path();
      g.strokeStyle = "#454b57";
      g.lineWidth = 6;
      g.stroke();
      // Start line: a short checkered bar across the track.
      const s = track.samples[0];
      const nx = s.tz;
      const nz = -s.tx;
      g.strokeStyle = "#111318";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(toX(s.x + nx * 9), toY(s.z + nz * 9));
      g.lineTo(toX(s.x - nx * 9), toY(s.z - nz * 9));
      g.stroke();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1;
      g.stroke();
      // Which way to go: an arrow just past the line.
      const a = track.samples[6];
      const hx = toX(a.x);
      const hy = toY(a.z);
      const ang = Math.atan2(a.tz, a.tx);
      g.fillStyle = "#c8ff3a";
      g.beginPath();
      g.moveTo(hx + Math.cos(ang) * 6, hy + Math.sin(ang) * 6);
      g.lineTo(hx + Math.cos(ang + 2.5) * 5, hy + Math.sin(ang + 2.5) * 5);
      g.lineTo(hx + Math.cos(ang - 2.5) * 5, hy + Math.sin(ang - 2.5) * 5);
      g.closePath();
      g.fill();
    }

    let raf = 0;
    const d = dots.current?.getContext("2d");
    const dot = (x: number, z: number, r: number, fill: string, ring?: string) => {
      if (!d) return;
      d.beginPath();
      d.arc(toX(x), toY(z), r, 0, Math.PI * 2);
      d.fillStyle = fill;
      d.fill();
      if (ring) {
        d.lineWidth = 2;
        d.strokeStyle = ring;
        d.stroke();
      }
    };
    const loop = () => {
      if (d) {
        d.clearRect(0, 0, SIZE, SIZE);
        const gp = telemetry.ghostPos;
        if (gp) dot(gp.x, gp.z, 3.5, "rgba(255,255,255,0.75)");
        for (const o of telemetry.others) dot(o.x, o.z, 4, o.color, "#111318");
        const me = telemetry.pos;
        if (me) dot(me.x, me.z, 5, "#c8ff3a", "#111318");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <canvas ref={base} className="absolute inset-0" style={{ width: SIZE, height: SIZE }} />
      <canvas ref={dots} className="absolute inset-0" style={{ width: SIZE, height: SIZE }} />
    </div>
  );
}
