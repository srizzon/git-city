"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LOT } from "@/lib/league-city/grid";
import { mapNav, type MapCameraStore } from "@/lib/map-nav";
import { geoAt } from "@/lib/towns/brasil-geo";
import type { CityLayout } from "@/lib/towns/brasil-map";
import { swatchOf } from "./stats";
import { boardPicture } from "./paintDraw";
import type { PaintBoard } from "@/lib/towns/brasil-paint";
import type { UF } from "@/lib/towns/brasil-map";

// Brazil in a corner: the coast, the State War's paint, a dot per city sized
// by its devs, the drift track's flag, where the camera is looking. A click
// flies there.

const W = 150;

export default function BrasilMinimap({
  scale = 1,
  cities,
  island,
  camera,
  cars = [],
  track,
  paint,
}: {
  /** How big Brazil is drawn (the layout's scale). */
  scale?: number;
  cities: CityLayout[];
  island: CityLayout;
  camera: MapCameraStore;
  cars?: { x: number; z: number }[];
  /** The drift track's gate (world units): a checkered flag. */
  track?: { x: number; z: number };
  /** The State War's board, and your state (lime). */
  paint?: { board: PaintBoard; mine: UF | null };
}) {
  const cam = useSyncExternalStore(camera.subscribe, camera.get, camera.get);
  const { bounds, outline } = geoAt(scale);
  const pad = 600 * scale;
  const x0 = bounds.minX - pad;
  const z0 = bounds.minZ - pad;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) + pad * 2;
  const k = W / span;
  const path = useMemo(() => outline.map((r) => `M${r.map(([x, z]) => `${((x - x0) * k).toFixed(1)},${((z - z0) * k).toFixed(1)}`).join("L")}Z`).join(""), [outline, x0, z0, k]);
  const dot = (c: CityLayout) => {
    const [x, z] = c.hub;
    return { cx: (x * LOT - x0) * k, cy: (z * LOT - z0) * k, r: Math.min(5, 0.8 + Math.sqrt(c.devs.length) * 0.35) };
  };
  // The paint as a picture, redrawn every few seconds while the board changes.
  const [picture, setPicture] = useState<ReturnType<typeof boardPicture>>(null);
  useEffect(() => {
    if (!paint) return;
    let seen = -1;
    const draw = () => {
      if (paint.board.version === seen) return;
      seen = paint.board.version;
      // About a pixel of the corner map per pixel of the picture.
      const g = paint.board.geom;
      if (g) setPicture(boardPicture(paint.board, paint.mine, Math.max(1, Math.round(g.w / W))));
    };
    draw();
    const t = setInterval(draw, 3000);
    return () => clearInterval(t);
  }, [paint]);
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * W;
    mapNav.send({ type: "flyTo", x: x / k + x0, z: y / k + z0, distance: 2600 });
  };
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-30 border-[3px] border-border bg-bg/80 p-1 backdrop-blur-sm max-sm:hidden">
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} onClick={click} className="cursor-pointer" role="img" aria-label="Map of Brazil">
        <path d={path} fill="#1d2634" stroke="#4b5466" strokeWidth={1} />
        {picture && (
          <image href={picture.url} x={(picture.x - x0) * k} y={(picture.z - z0) * k} width={picture.w * k} height={picture.d * k} preserveAspectRatio="none" opacity={0.85} style={{ imageRendering: "pixelated" }} />
        )}
        {[...cities, island].map((c) => {
          const d = dot(c);
          return <circle key={c.key} cx={d.cx} cy={d.cy} r={d.r} fill={c.uf ? swatchOf(c.uf) : "#c8e64a"} stroke="#0b0d12" strokeWidth={0.8} opacity={c.devs.length ? 1 : 0.35} />;
        })}
        {cars.map((c, i) => (
          <rect key={i} x={(c.x - x0) * k - 2.5} y={(c.z - z0) * k - 2.5} width={5} height={5} fill="#e8dcc8" stroke="#0b0d12" strokeWidth={1} />
        ))}
        {track && (
          <g transform={`translate(${((track.x - x0) * k).toFixed(1)} ${((track.z - z0) * k).toFixed(1)})`}>
            <rect x={-3} y={-3} width={6} height={6} fill="#0b0d12" stroke="#c8e64a" strokeWidth={1} />
            <rect x={-3} y={-3} width={3} height={3} fill="#e8dcc8" />
            <rect x={0} y={0} width={3} height={3} fill="#e8dcc8" />
          </g>
        )}
        <circle cx={(cam.tx - x0) * k} cy={(cam.tz - z0) * k} r={4} fill="none" stroke="#c8e64a" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
