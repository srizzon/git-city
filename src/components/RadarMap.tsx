"use client";

import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import type { CityBuilding, DistrictZone } from "@/lib/github";
import type { RemotePilot } from "@/lib/useFlyPresence";

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
  // Reserved for the upcoming SF-neighborhoods layer (lots, buy/sell).
  // Not rendered on the radar anymore — districts are scattered citywide.
  districtZones?: DistrictZone[];
  remotePilotsRef?: React.MutableRefObject<Map<string, RemotePilot>>;
  // White Rabbit hunt: world position of the currently-active rabbit, or null
  // when no hunt is in progress. Rendered as a pulsing ping so the player knows
  // where to go (the rabbit hides in parks scattered across the city).
  rabbitPos?: [number, number, number] | null;
}

// ─── Dimensions ─────────────────────────────────────────────
// North-up minimap (no rotation). Sized so all 11 district labels are
// readable, with explicit outline boundaries between districts so the
// player can see where one ends and another begins at a glance.
const RES     = 120;
const DISPLAY = 170;
const PAD     = 5;
const SCALE   = DISPLAY / RES;

// Flat neutral palette: buildings in grey so the player marker (white)
// and accents (lime/cream) never compete with them. Districts are no
// longer drawn here — on the real SF map their members are scattered
// citywide, so highlighting one lit up the whole map.
const COL_BG       = "#0d0d0f";
const COL_PANEL    = "#13131a";
const COL_GRID     = "#1d1d24";
const COL_BORDER   = "#2a2a30";
const COL_BUILDING = "#3d3d45"; // neutral grey, uniform for all buildings
const COL_LIME     = "#c8e64a";
const COL_CREAM    = "#e8dcc8";
const COL_WHITE    = "#ffffff"; // player only — maximum contrast

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
  remotePilotsRef,
  rabbitPos = null,
}: RadarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [remotePilotBlips, setRemotePilotBlips] = useState<{ id: string; x: number; z: number; yaw: number; login: string }[]>([]);

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
      cw: Math.max(1.0, b.width * sp.s * 0.7),
      cd: Math.max(1.0, b.depth * sp.s * 0.7),
    }));
  }, [buildings, sp, wb]);

  // ── Canvas draw ──────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = COL_PANEL;
    ctx.fillRect(0, 0, RES, RES);

    // Subtle grid for "scanning surface" feel
    ctx.strokeStyle = COL_GRID;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= RES; i += 10) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, RES); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(RES, i); ctx.stroke();
    }

    // Buildings — flat neutral grey, uniform. No district highlighting:
    // on the real SF map a district's members are scattered citywide, so
    // lighting them up just lit the whole map.
    ctx.fillStyle = COL_BUILDING;
    for (const b of bData) {
      if (b.cx < -3 || b.cx > RES + 3 || b.cy < -3 || b.cy > RES + 3) continue;
      ctx.fillRect(b.cx - b.cw / 2, b.cy - b.cd / 2, b.cw, b.cd);
    }
  }, [bData]);

  useEffect(() => { if (visible) draw(); }, [visible, draw]);

  // ── Sync remote pilots into state (~5fps) ────────────────────
  useEffect(() => {
    if (!visible || !remotePilotsRef) return;
    const id = setInterval(() => {
      const pilots = remotePilotsRef.current;
      if (pilots.size === 0) {
        setRemotePilotBlips(prev => prev.length === 0 ? prev : []);
        return;
      }
      const blips: typeof remotePilotBlips = [];
      for (const [pid, p] of pilots) {
        blips.push({ id: pid, x: p.x, z: p.z, yaw: p.yaw, login: p.login });
      }
      setRemotePilotBlips(blips);
    }, 200);
    return () => clearInterval(id);
  }, [visible, remotePilotsRef]);

  // ── SVG indicator geometry ───────────────────────────────────
  const [camSx, camSy] = w2s(cameraX, cameraZ);
  const [tgtSx, tgtSy] = w2s(cameraTargetX, cameraTargetZ);
  const [plySx, plySy] = w2s(playerX, playerZ);

  const cdx = tgtSx - camSx, cdy = tgtSy - camSy;
  const cLen = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
  const cnx = cdx / cLen, cny = cdy / cLen;
  const halfFov = (50 / 2) * (Math.PI / 180);
  const coneLen = 28;
  const lx = camSx + coneLen * (cnx * Math.cos(halfFov)  - cny * Math.sin(halfFov));
  const ly = camSy + coneLen * (cnx * Math.sin(halfFov)  + cny * Math.cos(halfFov));
  const rx = camSx + coneLen * (cnx * Math.cos(-halfFov) - cny * Math.sin(-halfFov));
  const ry = camSy + coneLen * (cnx * Math.sin(-halfFov) + cny * Math.cos(-halfFov));

  // FOV cone — wedge anchored at the player position, opening 60° in
  // the direction the vehicle is facing. Reads like a strategy-game
  // line-of-sight indicator (Civ, AoE). Forward vector in world is
  // (-sin(yaw), 0, -cos(yaw)) → screen Δ is (-sin(yaw), -cos(yaw))
  // because screen Y grows down. The left/right edges rotate ±half-fov.
  const FOV_LEN = 22;
  const FOV_HALF = (60 / 2) * (Math.PI / 180); // 30° each side = 60° total
  const leftAng  = playerYaw - FOV_HALF;
  const rightAng = playerYaw + FOV_HALF;
  const fovLX = plySx - Math.sin(leftAng)  * FOV_LEN;
  const fovLY = plySy - Math.cos(leftAng)  * FOV_LEN;
  const fovRX = plySx - Math.sin(rightAng) * FOV_LEN;
  const fovRY = plySy - Math.cos(rightAng) * FOV_LEN;

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-30 sm:bottom-4 sm:right-4"
      style={{
        width: DISPLAY,
        height: DISPLAY,
        background: COL_BG,
        border: `3px solid ${COL_BORDER}`,
        overflow: "hidden",
      }}
    >
      {/* Static (north-up) inner area — no rotation. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: DISPLAY,
          height: DISPLAY,
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
            display: "block",
          }}
        />

        <svg
          viewBox={`0 0 ${DISPLAY} ${DISPLAY}`}
          width={DISPLAY}
          height={DISPLAY}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* District zone rect removed — the axis-aligned bounding
              box of a scattered district covers way too much area and
              wildly misrepresents where the buildings actually are.
              Instead, individual active-district buildings are drawn
              lime in the canvas layer above. */}

          {/* Camera viewport cone (explore mode only — fly mode uses the dot) */}
          {!flyMode && sp && (
            <g>
              <polygon
                points={`${camSx},${camSy} ${lx},${ly} ${rx},${ry}`}
                fill="rgba(232,220,200,0.08)"
                stroke="rgba(232,220,200,0.32)"
                strokeWidth="0.6"
              />
              <rect x={camSx - 1.5} y={camSy - 1.5} width={3} height={3} fill={COL_CREAM} />
            </g>
          )}

          {/* Player marker (fly mode) — pure white against the neutral
              grey map. FOV wedge shows the direction; dot marks position. */}
          {flyMode && (
            <g>
              {/* FOV wedge — white semi-transparent fill + white edge */}
              <polygon
                points={`${plySx},${plySy} ${fovLX},${fovLY} ${fovRX},${fovRY}`}
                fill={COL_WHITE}
                fillOpacity={0.18}
                stroke={COL_WHITE}
                strokeWidth="1"
                strokeLinejoin="round"
              />
              {/* Dark halo for contrast on any background */}
              <circle
                cx={plySx} cy={plySy}
                r={4.5}
                fill={COL_BG}
              />
              {/* White dot — "you are here" */}
              <circle
                cx={plySx} cy={plySy}
                r={3}
                fill={COL_WHITE}
              />
            </g>
          )}

          {/* Remote pilots — small red squares (damage tone) so they
              never blend with lime (active district) or white (you).
              No username text: at this scale it's unreadable anyway;
              the marker alone communicates "someone is here". */}
          {remotePilotBlips.map((p) => {
            const [px, py] = w2s(p.x, p.z);
            return (
              <g key={p.id}>
                {/* Dark outline for contrast on any background */}
                <rect
                  x={px - 2.3} y={py - 2.3}
                  width={4.6} height={4.6}
                  fill={COL_BG}
                />
                {/* Red marker */}
                <rect
                  x={px - 1.7} y={py - 1.7}
                  width={3.4} height={3.4}
                  fill="#e85d5d"
                />
              </g>
            );
          })}

          {/* White Rabbit ping — pulsing ring so the active rabbit is
              findable from anywhere. Lime to match the HUD accent; the
              expanding ring + steady dot reads as "objective here". */}
          {rabbitPos && sp && (() => {
            const [rx2, ry2] = w2s(rabbitPos[0], rabbitPos[2]);
            return (
              <g>
                <circle cx={rx2} cy={ry2} r={3} fill="none" stroke={COL_LIME} strokeWidth="1.2">
                  <animate attributeName="r" values="3;11;3" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0;0.9" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={rx2} cy={ry2} r={4} fill={COL_BG} />
                <circle cx={rx2} cy={ry2} r={2.4} fill={COL_LIME} />
              </g>
            );
          })()}

          {/* District labels removed — only the active district is
              named, in a pill below the N indicator (outside the SVG
              layer, see the wrapper div). This keeps the map quiet. */}
        </svg>
      </div>

      {/* Fixed N indicator — always at top because the map is north-up. */}
      <div
        style={{
          position: "absolute",
          top: 3,
          left: "50%",
          transform: "translateX(-50%)",
          color: COL_LIME,
          fontFamily: "Silkscreen, monospace",
          fontSize: 10,
          letterSpacing: "0.15em",
          lineHeight: 1,
          padding: "2px 6px",
          background: COL_BG,
          border: `1px solid ${COL_BORDER}`,
          pointerEvents: "none",
        }}
      >
        N
      </div>
    </div>
  );
}
