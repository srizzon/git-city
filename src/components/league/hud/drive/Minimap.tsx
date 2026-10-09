"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CityBuilding } from "@/lib/github";
import type { CityObject } from "@/lib/league-city/types";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { LOT } from "@/lib/league-city/grid";

// Drive mode's minimap: a small round radar that turns with the car (heading
// up, like GTA or Mario Kart), so left on the map is left on the road. The
// town's roads and buildings, your building in lime, everyone driving in
// their car color, bots dimmer, the crown during Crown Rush, and the building
// you're driving to (Drive here). The crown, the route and other drivers past
// the edge stick to the rim, so you always know which way to go. Drawn on a canvas from the telemetry feed, never re-renders.

/** City units from the center to the rim. */
const RANGE = 200;
const BG = "#101016";
const ROAD = "#3a3a46";
const PLAZA = "#474755";
const BUILDING = "#6c6c7a";
const HOME = "#c8e64a";
const BOT = "#8a8a96";
const GOLD = "#ffcf33";
const GOLD_DARK = "#c98f10";
const CREAM = "#e8dcc8";

/** A 7×5 pixel crown, centered on (x, y), `p` px per pixel. */
function crownIcon(ctx: CanvasRenderingContext2D, x: number, y: number, p: number) {
  const rows = ["1.1.1.1", "1111111", "1111111", "2222222", "2222222"];
  const w = rows[0].length;
  const h = rows.length;
  rows.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const c = row[i];
      if (c === ".") continue;
      ctx.fillStyle = c === "1" ? GOLD : GOLD_DARK;
      ctx.fillRect(Math.round(x + (i - w / 2) * p), Math.round(y + (j - h / 2) * p), Math.ceil(p), Math.ceil(p));
    }
  });
}

export default function Minimap({
  telemetry,
  buildings,
  objects,
  home,
  size,
}: {
  telemetry: DriveTelemetry;
  buildings: CityBuilding[];
  objects: CityObject[];
  /** Your login, lowercase: your building shows in lime. */
  home: string | null;
  /** Diameter, CSS px. */
  size: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lots = useMemo(
    () =>
      objects
        .filter((o) => o.px === null && (o.item_type === "road" || o.item_type === "plaza"))
        .map((o) => ({ x: o.x * LOT, z: o.z * LOT, plaza: o.item_type === "plaza" })),
    [objects],
  );
  const blocks = useMemo(
    () => buildings.map((b) => ({ x: b.position[0], z: b.position[2], w: b.width, d: b.depth, home: !!home && b.loginLower === home })),
    [buildings, home],
  );

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * dpr;
    const R = size / 2;
    const k = R / RANGE;
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // 30 fps is plenty for a map.
      if (now - last < 32) return;
      last = now;
      const r = telemetry.radar;
      const cos = Math.cos(r.heading);
      const sin = Math.sin(r.heading);
      /** World (city units) → minimap px from the center, heading up. */
      const toMap = (wx: number, wz: number): [number, number] => {
        const dx = (wx - r.x) * k;
        const dz = (wz - r.z) * k;
        return [dx * cos + dz * sin, -dx * sin + dz * cos];
      };
      /** Past the rim: pinned to it, `inset` px in. */
      const pin = (p: [number, number], inset: number): [number, number, boolean] => {
        const d = Math.hypot(p[0], p[1]);
        const max = R - inset;
        return d > max ? [(p[0] / d) * max, (p[1] / d) * max, true] : [p[0], p[1], false];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, size, size);

      // The town, turned so you face up.
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(-r.heading);
      ctx.scale(k, k);
      ctx.translate(-r.x, -r.z);
      const reach = RANGE * 1.5;
      for (const l of lots) {
        if (Math.abs(l.x - r.x) > reach || Math.abs(l.z - r.z) > reach) continue;
        ctx.fillStyle = l.plaza ? PLAZA : ROAD;
        ctx.fillRect(l.x - LOT / 2, l.z - LOT / 2, LOT, LOT);
      }
      for (const b of blocks) {
        if (Math.abs(b.x - r.x) > reach || Math.abs(b.z - r.z) > reach) continue;
        ctx.fillStyle = b.home ? HOME : BUILDING;
        ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
      }
      ctx.restore();

      // Bots under people, people pinned to the rim when far.
      for (const c of r.cars) {
        if (!c.bot) continue;
        const [x, y] = toMap(c.x, c.z);
        if (Math.hypot(x, y) > R) continue;
        ctx.fillStyle = BOT;
        ctx.fillRect(R + x - 1.5, R + y - 1.5, 3, 3);
      }
      for (const c of r.cars) {
        if (c.bot) continue;
        const [x, y, far] = pin(toMap(c.x, c.z), 4);
        const s = far ? 4 : 6;
        ctx.fillStyle = BG;
        ctx.fillRect(R + x - s / 2 - 1, R + y - s / 2 - 1, s + 2, s + 2);
        ctx.fillStyle = c.color;
        ctx.fillRect(R + x - s / 2, R + y - s / 2, s, s);
      }
      const route = telemetry.route;
      if (route) {
        const [x, y, far] = pin(toMap(route.x, route.z), 7);
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        ctx.fillStyle = `rgba(200, 230, 74, ${0.18 + pulse * 0.22})`;
        ctx.beginPath();
        ctx.arc(R + x, R + y, far ? 7 : 10, 0, Math.PI * 2);
        ctx.fill();
        // A diamond, so it doesn't read as your building's lime block.
        const d = far ? 4 : 5;
        ctx.fillStyle = HOME;
        ctx.strokeStyle = BG;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(R + x, R + y - d);
        ctx.lineTo(R + x + d, R + y);
        ctx.lineTo(R + x, R + y + d);
        ctx.lineTo(R + x - d, R + y);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }
      if (r.crown) {
        const [x, y, far] = pin(toMap(r.crown.x, r.crown.z), 8);
        // A pulse so it's the first thing you see.
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        ctx.fillStyle = `rgba(255, 207, 51, ${0.18 + pulse * 0.2})`;
        ctx.beginPath();
        ctx.arc(R + x, R + y, far ? 7 : 9, 0, Math.PI * 2);
        ctx.fill();
        crownIcon(ctx, R + x, R + y, far ? 1.5 : 2);
      }

      // North on the rim, turning as you do.
      const [nx, ny] = pin([sin * -1e4, -cos * 1e4], 8);
      ctx.font = "7px Silkscreen, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = CREAM;
      ctx.fillText("N", R + nx, R + ny + 0.5);

      // You: an arrow at the center, always pointing up.
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = BG;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(R, R - 6);
      ctx.lineTo(R + 4.5, R + 5);
      ctx.lineTo(R, R + 2.5);
      ctx.lineTo(R - 4.5, R + 5);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [telemetry, lots, blocks, size]);

  return (
    <div
      className="pointer-events-none overflow-hidden rounded-full border-[3px] border-border bg-bg/75"
      style={{ width: size + 6, height: size + 6 }}
      aria-hidden
    >
      <canvas ref={canvas} style={{ width: size, height: size, display: "block" }} />
    </div>
  );
}
