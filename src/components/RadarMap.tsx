"use client";

import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import type { CityBuilding, DistrictZone } from "@/lib/github";

interface RadarMapProps {
  buildings: CityBuilding[];
  playerX: number;
  playerZ: number;
  playerYaw?: number;
  cameraX?: number;
  cameraZ?: number;
  cameraTargetX?: number;
  cameraTargetZ?: number;
  visible: boolean;
  flyMode: boolean;
  currentDistrict?: string | null;
  districtZones?: DistrictZone[];
}

const RES     = 100;
const DISPLAY = 200;
const PAD     = 5;
const SCALE   = DISPLAY / RES;

const MARGIN = 12;
const OUTER  = DISPLAY + MARGIN * 2; // 224
const CX     = OUTER / 2;            // 112 — outer SVG center
const CR     = DISPLAY / 2;          // 100 — circle radius

// N/S/E/W labels live INSIDE the rotating map at radius 91 from map center
const MAP_CX = DISPLAY / 2; // 100
const MAP_CR = 91;           // distance from map center to compass label
const INNER_CARDINALS = [
  { label: "N", x: MAP_CX,           y: MAP_CX - MAP_CR, red: true  },
  { label: "S", x: MAP_CX,           y: MAP_CX + MAP_CR, red: false },
  { label: "E", x: MAP_CX + MAP_CR,  y: MAP_CX,          red: false },
  { label: "W", x: MAP_CX - MAP_CR,  y: MAP_CX,          red: false },
] as const;

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

export default function RadarMap({
  buildings,
  playerX,
  playerZ,
  playerYaw = 0,
  cameraX = 800,
  cameraZ = 1000,
  cameraTargetX = 0,
  cameraTargetZ = 0,
  visible,
  flyMode,
  currentDistrict,
  districtZones = [],
}: RadarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pulse, setPulse] = useState(false);

  // ── Heading-up rotation (shortest-arc accumulator) ───────────
  // Avoids the 360° wrap-around flip that CSS transitions can't handle.
  const [mapRotDeg, setMapRotDeg] = useState(0);
  const prevDeg = useRef(0);

  useEffect(() => {
    let raw: number;
    if (flyMode) {
      raw = -(playerYaw * 180) / Math.PI;
    } else {
      const dx = cameraTargetX - cameraX;
      const dz = cameraTargetZ - cameraZ;
      // Heading clockwise from north: atan2(east, north) where north = -dz
      raw = -(Math.atan2(dx, -dz) * 180) / Math.PI;
    }
    // Normalize diff to [-180, 180] so we always take the shortest arc
    const diff = ((raw - prevDeg.current) % 360 + 540) % 360 - 180;
    const next = prevDeg.current + diff;
    prevDeg.current = next;
    setMapRotDeg(next);
  }, [flyMode, playerYaw, cameraX, cameraZ, cameraTargetX, cameraTargetZ]);

  // ── World bounding box ───────────────────────────────────────
  const wb = useMemo(() => {
    if (buildings.length === 0) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of buildings) {
      const bx = b.position[0], bz = b.position[2];
      if (bx < x0) x0 = bx; if (bx > x1) x1 = bx;
      if (bz < z0) z0 = bz; if (bz > z1) z1 = bz;
    }
    const m = 120;
    return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  }, [buildings]);

  // ── Scale params ─────────────────────────────────────────────
  const sp = useMemo(() => {
    if (!wb) return null;
    const ww = wb.x1 - wb.x0, wh = wb.z1 - wb.z0;
    const avail = RES - PAD * 2;
    const s  = Math.min(avail / ww, avail / wh);
    const ox = PAD + (avail - ww * s) / 2;
    const oy = PAD + (avail - wh * s) / 2;
    return { s, ox, oy };
  }, [wb]);

  const w2c = useCallback((wx: number, wz: number): [number, number] => {
    if (!wb || !sp) return [RES / 2, RES / 2];
    return [sp.ox + (wx - wb.x0) * sp.s, sp.oy + (wz - wb.z0) * sp.s];
  }, [wb, sp]);

  const w2s = useCallback((wx: number, wz: number): [number, number] => {
    const [cx, cy] = w2c(wx, wz);
    return [cx * SCALE, cy * SCALE];
  }, [w2c]);

  // ── Building draw data ───────────────────────────────────────
  const bData = useMemo(() => {
    if (!sp || !wb) return [];
    return buildings.map(b => ({
      cx: sp.ox + (b.position[0] - wb.x0) * sp.s,
      cy: sp.oy + (b.position[2] - wb.z0) * sp.s,
      cw: Math.max(1.2, b.width  * sp.s * 0.75),
      cd: Math.max(1.2, b.depth  * sp.s * 0.75),
      d:  b.district ?? "fullstack",
      active: b.district === currentDistrict,
    }));
  }, [buildings, sp, wb, currentDistrict]);

  // ── District zone data ───────────────────────────────────────
  const dzData = useMemo(() => {
    if (!sp || !wb) return [];
    return districtZones.map(z => ({
      id:    z.id,
      name:  z.name,
      color: z.color,
      fx: sp.ox + (z.bounds.minX - wb.x0) * sp.s,
      fy: sp.oy + (z.bounds.minZ - wb.z0) * sp.s,
      fw: (z.bounds.maxX - z.bounds.minX) * sp.s,
      fh: (z.bounds.maxZ - z.bounds.minZ) * sp.s,
      lx: (sp.ox + (z.center[0] - wb.x0) * sp.s) * SCALE,
      ly: (sp.oy + (z.center[2] - wb.z0) * sp.s) * SCALE,
    }));
  }, [districtZones, sp, wb]);

  // ── Canvas draw ──────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || bData.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#05050B";
    ctx.fillRect(0, 0, RES, RES);

    ctx.strokeStyle = "rgba(22,22,44,1)";
    ctx.lineWidth = 0.4;
    for (let i = 0; i <= RES; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, RES); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(RES, i); ctx.stroke();
    }

    for (const z of dzData) {
      const pad = 2;
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = z.color;
      ctx.fillRect(z.fx - pad, z.fy - pad, z.fw + pad * 2, z.fh + pad * 2);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(z.fx - pad, z.fy - pad, z.fw + pad * 2, z.fh + pad * 2);
      ctx.restore();
    }

    for (const b of bData) {
      if (b.cx < -3 || b.cx > RES + 3 || b.cy < -3 || b.cy > RES + 3) continue;
      const rgb = DISTRICT_RGB[b.d];
      if (b.active) {
        ctx.fillStyle = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : "#aaa";
        ctx.globalAlpha = 0.95;
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgb
          ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`
          : "rgba(65,65,80,0.55)";
      }
      ctx.fillRect(b.cx - b.cw / 2, b.cy - b.cd / 2, b.cw, b.cd);
    }
    ctx.globalAlpha = 1;
  }, [bData, dzData]);

  useEffect(() => { if (visible) draw(); }, [visible, draw]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setPulse(p => !p), 700);
    return () => clearInterval(id);
  }, [visible]);

  // ── SVG indicator geometry ───────────────────────────────────
  const [camSx, camSy] = w2s(cameraX, cameraZ);
  const [tgtSx, tgtSy] = w2s(cameraTargetX, cameraTargetZ);
  const [plySx, plySy] = w2s(playerX, playerZ);

  const cdx = tgtSx - camSx, cdy = tgtSy - camSy;
  const cLen = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
  const cnx = cdx / cLen, cny = cdy / cLen;
  const halfFov = (50 / 2) * (Math.PI / 180);
  const coneLen = 38;
  const lx = camSx + coneLen * (cnx * Math.cos(halfFov)  - cny * Math.sin(halfFov));
  const ly = camSy + coneLen * (cnx * Math.sin(halfFov)  + cny * Math.cos(halfFov));
  const rx = camSx + coneLen * (cnx * Math.cos(-halfFov) - cny * Math.sin(-halfFov));
  const ry = camSy + coneLen * (cnx * Math.sin(-halfFov) + cny * Math.cos(-halfFov));

  const headX = plySx - Math.sin(playerYaw) * 14;
  const headY = plySy - Math.cos(playerYaw) * 14;

  if (!visible || buildings.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-20 left-3 z-30 sm:bottom-20 sm:left-4"
      style={{ width: OUTER, height: OUTER }}
    >
      {/* ── Rotating inner area: canvas + SVG indicators + compass labels ── */}
      <div
        style={{
          position: "absolute",
          inset: MARGIN,
          borderRadius: "50%",
          overflow: "hidden",
          width: DISPLAY,
          height: DISPLAY,
          transform: `rotate(${mapRotDeg}deg)`,
          transition: "transform 0.12s linear",
          willChange: "transform",
        }}
      >
        <canvas
          ref={canvasRef}
          width={RES}
          height={RES}
          style={{
            position: "absolute",
            inset: 0,
            width: DISPLAY,
            height: DISPLAY,
            imageRendering: "pixelated",
          }}
        />

        <svg
          viewBox={`0 0 ${DISPLAY} ${DISPLAY}`}
          width={DISPLAY}
          height={DISPLAY}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Camera viewport cone (orbit / explore) */}
          {!flyMode && sp && (
            <g>
              <polygon
                points={`${camSx},${camSy} ${lx},${ly} ${rx},${ry}`}
                fill="rgba(255,255,255,0.06)"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="0.7"
              />
              <circle cx={camSx} cy={camSy} r={2.5} fill="rgba(255,255,255,0.75)" />
            </g>
          )}

          {/* Player / airplane (fly mode) */}
          {flyMode && (
            <g>
              <circle
                cx={plySx} cy={plySy}
                r={pulse ? 9 : 5.5}
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.8"
              />
              <line
                x1={plySx} y1={plySy}
                x2={headX}  y2={headY}
                stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.85"
              />
              <circle cx={plySx} cy={plySy} r={3} fill="white" />
            </g>
          )}

          {/* District labels — counter-rotated so text stays upright */}
          {dzData.map((z) => (
            <text
              key={z.id}
              x={z.lx} y={z.ly}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="5.5" fill={z.color}
              opacity={z.id === currentDistrict ? 1 : 0.3}
              fontFamily="monospace" letterSpacing="0.5"
              transform={`rotate(${-mapRotDeg}, ${z.lx}, ${z.ly})`}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {z.name.split(" ")[0].substring(0, 6).toUpperCase()}
            </text>
          ))}

          {/* N/S/E/W compass labels — rotate with the map, text stays upright */}
          {INNER_CARDINALS.map(({ label, x, y, red }) => (
            <g key={label} transform={`rotate(${-mapRotDeg}, ${x}, ${y})`}>
              <circle
                cx={x} cy={y} r={7}
                fill={red ? "rgba(150,25,25,0.92)" : "rgba(12,12,30,0.88)"}
                stroke={red ? "rgba(210,55,55,0.6)" : "rgba(70,70,110,0.5)"}
                strokeWidth="0.8"
              />
              <text
                x={x} y={y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={red ? "8" : "7"}
                fontWeight="bold"
                fontFamily="monospace"
                fill={red ? "rgba(255,200,200,1)" : "rgba(200,200,220,0.9)"}
                style={{ userSelect: "none" }}
              >
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* ── Static outer SVG: dark bezel ring + cardinal tick marks ── */}
      <svg
        viewBox={`0 0 ${OUTER} ${OUTER}`}
        width={OUTER}
        height={OUTER}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {/* Cardinal tick marks (fixed, always at N/S/E/W of the bezel) */}
        {[
          { x: CX,      y: CX - CR }, // top (N)
          { x: CX,      y: CX + CR }, // bottom (S)
          { x: CX + CR, y: CX      }, // right (E)
          { x: CX - CR, y: CX      }, // left (W)
        ].map(({ x, y }, i) => {
          const nx = (x - CX) / CR, ny = (y - CX) / CR;
          return (
            <line
              key={i}
              x1={CX + nx * (CR - 7)} y1={CX + ny * (CR - 7)}
              x2={CX + nx * (CR + 2)} y2={CX + ny * (CR + 2)}
              stroke="rgba(160,160,200,0.45)"
              strokeWidth="1.2"
            />
          );
        })}

        {/* Dark bezel ring */}
        <circle
          cx={CX} cy={CX} r={CR + 1}
          fill="none"
          stroke="rgba(8,8,22,0.97)"
          strokeWidth={7}
        />
        {/* Inner glint ring */}
        <circle
          cx={CX} cy={CX} r={CR - 2}
          fill="none"
          stroke="rgba(80,80,130,0.25)"
          strokeWidth="1"
        />

        {/* Fixed forward indicator: small notch at top of bezel showing "up = your direction" */}
        <polygon
          points={`${CX - 4},${CX - CR - 5} ${CX + 4},${CX - CR - 5} ${CX},${CX - CR + 3}`}
          fill="rgba(255,255,255,0.5)"
        />
      </svg>
    </div>
  );
}
