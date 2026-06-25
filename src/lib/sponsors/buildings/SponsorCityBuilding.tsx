"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";
import {
  HEART_BM,
  HEART_CORE_BM,
  SIDE_HEART_BM,
  SIDE_HEART_CORE_BM,
  VOXEL_HEART_BM,
  VOXEL_HEART_CORE_BM,
} from "../facades/sponsor-heart";

// ─── Building dimensions ────────────────────────────────
const BW = 105, BD = 58, BH = 125;   // Base
const MW = 100, MD = 56, MH = 155;   // Mid  (hosts the big heart)
const TW = 72,  TD = 45, TH = 95;    // Top

// ─── Locked brand palette (ignores global city theme) ──
// Near-black graphite shell + warm gold windows so the gold heart
// reads as a premium civic monument, not a flashy ad.
const SPONSOR_FACE       = "#101015";
const SPONSOR_WINDOW_LIT = ["#ffd877", "#e7b94a", "#fff2c8"];
// Gold is the signature accent: heart, edges, sparkles, lights.
const GOLD     = "#ffce4a";
const GOLD_HOT = "#fff3c4";
// Faithful texture colors (white emissive = no tint, gold stays gold).
const EM_WHITE = "#ffffff";

// ─── Heart facade geometry ──────────────────────────────
const HEART_W = HEART_BM[0].length;   // 11
const HEART_H = HEART_BM.length;      // 10
const MAIN_COLS = HEART_W + 2;        // 13
const MAIN_ROWS = HEART_H + 8;        // 18 — windows above/below the heart

const SIDE_HEART_W = SIDE_HEART_BM[0].length; // 5
const SIDE_HEART_H = SIDE_HEART_BM.length;    // 5
const SIDE_COLS = SIDE_HEART_W + 2;           // 7
const SIDE_ROWS = MAIN_ROWS;                  // align cells with the front

// ─── Glass texture (with optional accent logo + bright core) ──
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
  accentColor?: string, coreColor?: string,
  logoBM?: number[][], fxCol?: number, fxRow?: number,
  coreBM?: number[][],
): THREE.CanvasTexture {
  const cW = 16, cH = 16;
  const w = cols * cW, h = rows * cH;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const shellC = new THREE.Color(faceColor);
  shellC.multiplyScalar(1.8);
  const gridColor = "#" + shellC.getHexString();

  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * cH); ctx.lineTo(w, r * cH); ctx.stroke(); }
  for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cW, 0); ctx.lineTo(c * cW, h); ctx.stroke(); }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hash = ((r * 13 + c * 23 + seed) * 2654435761) >>> 0;

      let isLogo = false;
      let isCore = false;
      let nearLogo = false;
      if (logoBM && fxCol != null && fxRow != null) {
        const lr = r - fxRow, lc = c - fxCol;
        if (lr >= 0 && lr < logoBM.length && lc >= 0 && lc < logoBM[0].length) {
          if (coreBM && coreBM[lr]?.[lc]) isCore = true;
          else if (logoBM[lr][lc]) isLogo = true;
        }
        if (!isLogo && !isCore &&
            lr >= -1 && lr <= logoBM.length && lc >= -1 && lc <= logoBM[0].length) {
          nearLogo = true;
        }
      }

      if (isCore && coreColor) {
        ctx.fillStyle = coreColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (isLogo && accentColor) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (nearLogo) {
        ctx.fillStyle = offColor;
        ctx.globalAlpha = 0.25;
      } else {
        const lit = (hash % 100) < 48;
        if (lit) {
          ctx.fillStyle = litColors[hash % litColors.length];
          ctx.globalAlpha = 0.45 + (hash % 20) / 100;
        } else {
          ctx.fillStyle = offColor;
          ctx.globalAlpha = 0.55;
        }
      }
      ctx.fillRect(c * cW + 2, r * cH + 2, cW - 4, cH - 4);
      ctx.globalAlpha = 1;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Heartbeat envelope: a "lub-dub" double thump per cycle ──
// Returns 0 at rest, peaking ~0.22 then ~0.13 near the start of each beat.
function heartbeat(t: number): number {
  const period = 1.15;
  const p = (t % period) / period;
  const g = (center: number, amp: number) =>
    amp * Math.exp(-((p - center) * (p - center)) / 0.0012);
  return g(0.10, 0.22) + g(0.27, 0.13);
}

// ─── 3D voxel heart (rooftop mascot) ────────────────────
interface VoxelHeart {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
}

function createVoxelHeart(accent: string): VoxelHeart {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 2.4, toneMapped: false,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: GOLD_HOT, emissive: GOLD_HOT, emissiveIntensity: 3.4, toneMapped: false,
  });

  const CUBE = 2.6;
  const CORE_CUBE = 1.7;
  const geo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
  const coreGeo = new THREE.BoxGeometry(CORE_CUBE, CORE_CUBE, CORE_CUBE);
  const cols = VOXEL_HEART_BM[0].length;
  const rows = VOXEL_HEART_BM.length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!VOXEL_HEART_BM[r][c]) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (c - (cols - 1) / 2) * CUBE,
        ((rows - 1 - r) - (rows - 1) / 2) * CUBE,
        0,
      );
      group.add(mesh);
    }
  }

  // Bright inner heart — smaller cubes floated forward.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!VOXEL_HEART_CORE_BM[r][c]) continue;
      const mesh = new THREE.Mesh(coreGeo, coreMat);
      mesh.position.set(
        (c - (cols - 1) / 2) * CUBE,
        ((rows - 1 - r) - (rows - 1) / 2) * CUBE,
        CUBE * 0.55,
      );
      group.add(mesh);
    }
  }

  return { group, mat, coreMat };
}

// ─── Rising gold sparkles ───────────────────────────────
const SPARKLE_COUNT = 16;
const SPARKLE_RADIUS = 22;
const SPARKLE_RISE = 70;

function GoldSparkles({ baseY }: { baseY: number }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  // Deterministic golden-angle spiral spread — stable, no RNG.
  const seeds = useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, i) => {
        const a = i * 2.39996;
        const rad = SPARKLE_RADIUS * (0.25 + 0.75 * ((i * 0.6180339) % 1));
        return {
          x: Math.cos(a) * rad,
          z: Math.sin(a) * rad,
          phase: (i * 0.6180339) % 1,
          speed: 0.18 + 0.12 * ((i * 0.3137) % 1),
        };
      }),
    [],
  );

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GOLD, emissive: GOLD, emissiveIntensity: 3, toneMapped: false,
      }),
    [],
  );
  const geo = useMemo(() => new THREE.BoxGeometry(1.6, 1.6, 1.6), []);
  useEffect(() => () => { mat.dispose(); geo.dispose(); }, [mat, geo]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const s = seeds[i];
      const yy = (t * s.speed + s.phase) % 1; // 0..1 loop
      m.position.set(s.x, baseY + yy * SPARKLE_RISE, s.z);
      // Fade in/out by scaling to ~0 at both ends of the rise.
      const fade = Math.sin(yy * Math.PI);
      m.scale.setScalar(0.15 + fade * 1.15);
      m.rotation.y = t * 1.5 + i;
      m.rotation.x = t * 1.1 + i;
    }
  });

  return (
    <>
      {seeds.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { meshes.current[i] = el; }}
          geometry={geo}
          material={mat}
        />
      ))}
    </>
  );
}

// ─── Shared structural helpers ──────────────────────────
function CornerStrips({ w, d, h, yC, accent }: { w: number; d: number; h: number; yC: number; accent: string }) {
  const hw = w / 2, hd = d / 2;
  return (
    <>
      {[[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx, yC, cz]}>
          <boxGeometry args={[0.6, h, 0.6]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function GlassFacade({ tex, w, h, pos, rotY, emColor }: { tex: THREE.Texture; w: number; h: number; pos: [number, number, number]; rotY: number; emColor: string }) {
  return (
    <mesh position={pos} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w - 4, h - 4]} />
      <meshStandardMaterial map={tex} emissive={emColor} emissiveMap={tex} emissiveIntensity={0.7} toneMapped={false} transparent />
    </mesh>
  );
}

/** Facade whose heart "beats" — emissive pulses on the lub-dub envelope. */
function HeartFacade({
  tex, w, h, pos, rotY, phaseOffset,
}: {
  tex: THREE.Texture;
  w: number;
  h: number;
  pos: [number, number, number];
  rotY: number;
  phaseOffset: number;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    map: tex,
    emissive: EM_WHITE,
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    toneMapped: false,
    transparent: true,
  }), [tex]);

  useEffect(() => {
    matRef.current = material;
    return () => { material.dispose(); };
  }, [material]);

  useFrame(({ clock }) => {
    const m = matRef.current;
    if (!m) return;
    m.emissiveIntensity = 0.85 + heartbeat(clock.getElapsedTime() + phaseOffset) * 2.2;
  });

  return (
    <mesh position={pos} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w - 4, h - 4]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function BoxSection({ w, h, d, y, shellMat, glassFront, glassSide, emColor, accent }: {
  w: number; h: number; d: number; y: number;
  shellMat: THREE.Material; glassFront: THREE.Texture; glassSide: THREE.Texture;
  emColor: string; accent: string;
}) {
  return (
    <group>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[w, h, d]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      <GlassFacade tex={glassFront} w={w} h={h} pos={[0, y, d / 2 + 0.3]} rotY={0} emColor={emColor} />
      <GlassFacade tex={glassFront} w={w} h={h} pos={[0, y, -d / 2 - 0.3]} rotY={Math.PI} emColor={emColor} />
      <GlassFacade tex={glassSide} w={d} h={h} pos={[w / 2 + 0.3, y, 0]} rotY={Math.PI / 2} emColor={emColor} />
      <GlassFacade tex={glassSide} w={d} h={h} pos={[-w / 2 - 0.3, y, 0]} rotY={-Math.PI / 2} emColor={emColor} />
      <CornerStrips w={w} d={d} h={h} yC={y} accent={accent} />
    </group>
  );
}

// ─── Component ──────────────────────────────────────────

// Locked palette — this landmark ignores theme props by design.
export default function SponsorCityBuilding(_props: SponsorBuildingProps) {
  void _props;
  const heartGroupRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const heartLightFront = useRef<THREE.PointLight>(null);
  const heartLightBack = useRef<THREE.PointLight>(null);
  const baseGlowRef = useRef<THREE.PointLight>(null);
  const heart3DRef = useRef<VoxelHeart | null>(null);

  // Locked palette — this landmark always reads magenta + gold.
  const accent = GOLD;
  const face = SPONSOR_FACE;
  const windowLit = SPONSOR_WINDOW_LIT;

  const shellColor = useMemo(() => {
    const c = new THREE.Color(face);
    c.multiplyScalar(1.8);
    return "#" + c.getHexString();
  }, [face]);
  const windowOff = useMemo(() => {
    const c = new THREE.Color(face);
    c.multiplyScalar(0.6);
    return "#" + c.getHexString();
  }, [face]);

  const fxCol = Math.floor((MAIN_COLS - HEART_W) / 2);
  const fxRow = Math.floor((MAIN_ROWS - HEART_H) / 2);
  const sxCol = Math.floor((SIDE_COLS - SIDE_HEART_W) / 2);
  const sxRow = Math.floor((SIDE_ROWS - SIDE_HEART_H) / 2);

  const B_Y = BH / 2 + 4;
  const M_Y = BH + 4 + MH / 2;
  const T_Y = BH + MH + 4 + TH / 2;

  // ── Mid heart facade textures ──
  const heartFront = useMemo(
    () => createGlassTex(MAIN_COLS, MAIN_ROWS, 61, windowLit, windowOff, face, accent, GOLD_HOT, HEART_BM, fxCol, fxRow, HEART_CORE_BM),
    [windowLit, windowOff, face, accent, fxCol, fxRow],
  );
  const heartBack = useMemo(
    () => createGlassTex(MAIN_COLS, MAIN_ROWS, 127, windowLit, windowOff, face, accent, GOLD_HOT, HEART_BM, fxCol, fxRow, HEART_CORE_BM),
    [windowLit, windowOff, face, accent, fxCol, fxRow],
  );
  const heartLeft = useMemo(
    () => createGlassTex(SIDE_COLS, SIDE_ROWS, 211, windowLit, windowOff, face, accent, GOLD_HOT, SIDE_HEART_BM, sxCol, sxRow, SIDE_HEART_CORE_BM),
    [windowLit, windowOff, face, accent, sxCol, sxRow],
  );
  const heartRight = useMemo(
    () => createGlassTex(SIDE_COLS, SIDE_ROWS, 277, windowLit, windowOff, face, accent, GOLD_HOT, SIDE_HEART_BM, sxCol, sxRow, SIDE_HEART_CORE_BM),
    [windowLit, windowOff, face, accent, sxCol, sxRow],
  );

  // ── Base section: plain windows (no text) ──
  const bFront = useMemo(
    () => createGlassTex(MAIN_COLS, 9, 83, windowLit, windowOff, face),
    [windowLit, windowOff, face],
  );
  const bSide = useMemo(
    () => createGlassTex(5, 9, 91, windowLit, windowOff, face),
    [windowLit, windowOff, face],
  );

  // ── Top section: plain windows ──
  const tFront = useMemo(
    () => createGlassTex(MAIN_COLS, 7, 57, windowLit, windowOff, face),
    [windowLit, windowOff, face],
  );
  const tSide = useMemo(
    () => createGlassTex(4, 7, 69, windowLit, windowOff, face),
    [windowLit, windowOff, face],
  );

  useEffect(() => () => {
    heartFront.dispose(); heartBack.dispose(); heartLeft.dispose(); heartRight.dispose();
    bFront.dispose(); bSide.dispose();
    tFront.dispose(); tSide.dispose();
  }, [heartFront, heartBack, heartLeft, heartRight, bFront, bSide, tFront, tSide]);

  const voxelHeart = useMemo(() => createVoxelHeart(accent), [accent]);
  useEffect(() => { heart3DRef.current = voxelHeart; }, [voxelHeart]);

  const shellMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.3, metalness: 0.6 }),
    [shellColor],
  );
  const shellMatLight = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.45, metalness: 0.35 }),
    [shellColor],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const beat = heartbeat(t);

    // ── Rooftop voxel heart: gentle sway + heartbeat scale/glow ──
    const h3d = heart3DRef.current;
    if (h3d && heartGroupRef.current) {
      heartGroupRef.current.rotation.y = Math.sin(t * 0.9) * 0.22;
      heartGroupRef.current.position.y = Math.sin(t * 1.8) * 1.5;
      const s = 1 + beat;
      heartGroupRef.current.scale.set(s, s, s);
      h3d.mat.emissiveIntensity = 2.2 + beat * 2.4;
      h3d.coreMat.emissiveIntensity = 3.2 + beat * 2.8;
    }

    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 1.5) * 0.8;
    }
    const glow = 40 + beat * 90;
    if (heartLightFront.current) heartLightFront.current.intensity = glow;
    if (heartLightBack.current) heartLightBack.current.intensity = glow;
    if (baseGlowRef.current) baseGlowRef.current.intensity = 20 + beat * 30;
  });

  const emC = EM_WHITE;
  const topY = BH + MH + TH + 4;
  const antennaY = topY + 25;

  return (
    <group>
      {/* ── Platform ── */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[BW + 20, 3, BD + 20]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[BW + 22, 1, BD + 22]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* ── Base section ("SPONSOR") ── */}
      <BoxSection
        w={BW} h={BH} d={BD} y={B_Y}
        shellMat={shellMat} glassFront={bFront} glassSide={bSide}
        emColor={emC} accent={accent}
      />

      <mesh position={[0, BH + 4, 0]}>
        <boxGeometry args={[BW + 2, 1.5, BD + 2]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Mid section (beating heart) ── */}
      <mesh position={[0, M_Y, 0]}>
        <boxGeometry args={[MW, MH, MD]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      <HeartFacade tex={heartFront} w={MW} h={MH} pos={[0, M_Y, MD / 2 + 0.3]} rotY={0} phaseOffset={0} />
      <HeartFacade tex={heartBack} w={MW} h={MH} pos={[0, M_Y, -MD / 2 - 0.3]} rotY={Math.PI} phaseOffset={0} />
      <HeartFacade tex={heartRight} w={MD} h={MH} pos={[MW / 2 + 0.3, M_Y, 0]} rotY={Math.PI / 2} phaseOffset={0} />
      <HeartFacade tex={heartLeft} w={MD} h={MH} pos={[-MW / 2 - 0.3, M_Y, 0]} rotY={-Math.PI / 2} phaseOffset={0} />
      <CornerStrips w={MW} d={MD} h={MH} yC={M_Y} accent={accent} />

      <pointLight ref={heartLightFront} position={[0, M_Y, MD / 2 + 22]} color={accent} intensity={45} distance={110} decay={2} />
      <pointLight ref={heartLightBack} position={[0, M_Y, -MD / 2 - 22]} color={accent} intensity={45} distance={110} decay={2} />
      <pointLight position={[MW / 2 + 22, M_Y, 0]} color={accent} intensity={30} distance={90} decay={2} />
      <pointLight position={[-MW / 2 - 22, M_Y, 0]} color={accent} intensity={30} distance={90} decay={2} />

      <mesh position={[0, BH + MH + 4, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Top section ── */}
      <BoxSection
        w={TW} h={TH} d={TD} y={T_Y}
        shellMat={shellMat} glassFront={tFront} glassSide={tSide}
        emColor={emC} accent={accent}
      />

      <mesh position={[0, topY, 0]}>
        <boxGeometry args={[TW + 4, 1.2, TD + 4]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      <mesh position={[0, topY + 1.5, 0]}>
        <boxGeometry args={[TW - 8, 2, TD - 8]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, topY + 3, 0]}>
        <boxGeometry args={[TW - 6, 0.6, TD - 6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>

      {/* ── Antenna ── */}
      <mesh position={[0, antennaY, 0]}>
        <cylinderGeometry args={[0.5, 1.5, 42, 4]} />
        <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
      </mesh>

      {/* ── Beating voxel heart on top ── */}
      <group position={[0, antennaY + 40, 0]} scale={1.7}>
        <group ref={heartGroupRef}>
          <primitive object={voxelHeart.group} />
        </group>
        <pointLight color={accent} intensity={70} distance={160} decay={2} />
      </group>

      {/* ── Rising gold sparkles ── */}
      <GoldSparkles baseY={antennaY + 18} />

      {/* ── Beacon ── */}
      <mesh ref={beaconRef} position={[0, antennaY + 86, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={GOLD_HOT} emissive={GOLD_HOT} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, antennaY + 86, 0]} color={accent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow (warm gold at street level) ── */}
      <pointLight ref={baseGlowRef} position={[0, 10, BD / 2 + 10]} color={accent} intensity={20} distance={55} decay={2} />
    </group>
  );
}
