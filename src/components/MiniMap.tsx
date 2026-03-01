"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import type { CityBuilding } from "@/lib/github";

interface MiniMapProps {
  buildings: CityBuilding[];
  playerX: number;
  playerZ: number;
  visible: boolean;
  currentDistrict?: string | null;
}

// 64px internal → 128px display = clean 2x pixel art
const RES = 64;
const DISPLAY = 128;
const PAD = 3;

const DISTRICT_RGB: Record<string, [number, number, number]> = {
  downtown:   [200, 153, 29],
  frontend:   [47, 104, 197],
  backend:    [191, 54, 54],
  fullstack:  [134, 68, 197],
  mobile:     [27, 157, 75],
  data_ai:    [5, 146, 170],
  devops:     [199, 92, 18],
  security:   [176, 30, 30],
  gamedev:    [189, 58, 122],
  vibe_coder: [111, 74, 197],
  creator:    [187, 143, 6],
};

export default function MiniMap({ buildings, playerX, playerZ, visible, currentDistrict }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // World bounds (stable)
  const wb = useMemo(() => {
    if (buildings.length === 0) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of buildings) {
      const bx = b.position[0], bz = b.position[2];
      if (bx < x0) x0 = bx;
      if (bx > x1) x1 = bx;
      if (bz < z0) z0 = bz;
      if (bz > z1) z1 = bz;
    }
    const m = 60;
    return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  }, [buildings]);

  // Pre-compute building pixel data
  const bPixels = useMemo(() => {
    if (!wb || buildings.length === 0) return [];
    const ww = wb.x1 - wb.x0, wh = wb.z1 - wb.z0;
    const ds = RES - PAD * 2;
    const s = Math.min(ds / ww, ds / wh);
    const ox = PAD + (ds - ww * s) / 2;
    const oy = PAD + (ds - wh * s) / 2;
    return buildings.map(b => ({
      px: Math.round(ox + (b.position[0] - wb.x0) * s),
      py: Math.round(oy + (b.position[2] - wb.z0) * s),
      d: b.district ?? "fullstack",
    }));
  }, [buildings, wb]);

  // World → pixel
  const w2p = useCallback((wx: number, wz: number): [number, number] => {
    if (!wb) return [RES / 2, RES / 2];
    const ww = wb.x1 - wb.x0, wh = wb.z1 - wb.z0;
    const ds = RES - PAD * 2;
    const s = Math.min(ds / ww, ds / wh);
    const ox = PAD + (ds - ww * s) / 2;
    const oy = PAD + (ds - wh * s) / 2;
    return [Math.round(ox + (wx - wb.x0) * s), Math.round(oy + (wz - wb.z0) * s)];
  }, [wb]);

  // Draw frame
  const draw = useCallback((blink: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || bPixels.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // Background: very dark
    const buf = new Uint8ClampedArray(RES * RES * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 5; buf[i + 1] = 5; buf[i + 2] = 7; buf[i + 3] = 220;
    }

    // Buildings
    for (const { px, py, d } of bPixels) {
      if (px < 0 || px >= RES || py < 0 || py >= RES) continue;
      const idx = (py * RES + px) * 4;
      if (d === currentDistrict) {
        const rgb = DISTRICT_RGB[d];
        if (rgb) {
          buf[idx] = rgb[0]; buf[idx + 1] = rgb[1]; buf[idx + 2] = rgb[2];
        } else {
          buf[idx] = 120; buf[idx + 1] = 120; buf[idx + 2] = 120;
        }
      } else {
        buf[idx] = 65; buf[idx + 1] = 65; buf[idx + 2] = 70;
      }
      buf[idx + 3] = 255;
    }

    // Player cross (white, 5px)
    const [ppx, ppy] = w2p(playerX, playerZ);
    const set = (x: number, y: number) => {
      if (x >= 0 && x < RES && y >= 0 && y < RES) {
        const i = (y * RES + x) * 4;
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
      }
    };
    // Always show center
    set(ppx, ppy);
    if (blink) {
      // Full cross
      set(ppx - 1, ppy); set(ppx + 1, ppy);
      set(ppx, ppy - 1); set(ppx, ppy + 1);
    }

    ctx.putImageData(new ImageData(buf, RES, RES), 0, 0);
  }, [bPixels, currentDistrict, playerX, playerZ, w2p]);

  // Redraw on changes
  useEffect(() => { if (visible) draw(true); }, [visible, draw]);

  // Blink
  useEffect(() => {
    if (!visible) return;
    let on = true;
    const id = setInterval(() => { on = !on; draw(on); }, 500);
    return () => clearInterval(id);
  }, [visible, draw]);

  if (!visible || buildings.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-30 sm:bottom-4 sm:right-4">
      <canvas
        ref={canvasRef}
        width={RES}
        height={RES}
        style={{
          width: DISPLAY,
          height: DISPLAY,
          imageRendering: "pixelated",
          border: "1px solid rgba(42, 42, 48, 0.4)",
        }}
      />
    </div>
  );
}
