"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeStaticChildren } from "@/lib/three-merge";
import type { SponsorBuildingProps } from "../registry";

// ─── Building dimensions ────────────────────────────────
const BW = 105, BD = 58, BH = 125;   // Base
const MW = 100, MD = 56, MH = 155;   // Mid (hosts the big flame)
const TW = 72,  TD = 45, TH = 95;    // Top

// ─── Flame pixel bitmap (11 × 16) ───────────────────────
// Rasterized directly from the Firecrawl SVG logo. Single flame with a
// V-notch at the bottom that splits the base into two feet.
const FLAME_BM: number[][] = [
  [0,0,0,0,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,0,0],
  [0,0,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,1,1,1],
  [1,1,1,1,0,0,1,1,1,1,1],
  [1,1,1,0,0,0,0,0,1,1,1],
  [0,1,1,0,0,0,0,0,1,1,0],
  [0,0,1,0,0,0,0,0,1,0,0],
];
// Yellow hot core — centered in the belly, respects the V-notch.
const FLAME_CORE_BM: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0],
  [0,0,0,1,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,1,0,0,0,0],
  [0,0,0,0,1,0,1,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0],
];
// FLAME_FRAMES kept as array for the AnimatedFlameFacade signature —
// all 4 "frames" are identical (logo shape is static, no flicker animation).
const FLAME_FRAMES: number[][][] = [FLAME_BM, FLAME_BM, FLAME_BM, FLAME_BM];
const FLAME_W = FLAME_BM[0].length;
const FLAME_H = FLAME_BM.length;
const MIN_COLS = FLAME_W + 2;
const M_ROWS = FLAME_H + 2;

// ─── Narrow flame for sides (5 × 13) ────────────────────
// Rasterized from the SVG at 5×13. V-notch at base splits into two feet.
const SIDE_FLAME_BM: number[][] = [
  [0,0,1,0,0],
  [0,0,1,0,0],
  [0,0,1,1,0],
  [0,1,1,1,0],
  [0,1,1,1,0],
  [0,1,1,1,0],
  [1,1,1,1,1],
  [1,1,1,1,1],
  [1,1,1,1,1],
  [1,1,0,1,1],
  [1,1,0,1,1],
  [1,0,0,0,1],
  [0,0,0,0,0],
];
const SIDE_FLAME_CORE_BM: number[][] = [
  [0,0,0,0,0],
  [0,0,0,0,0],
  [0,0,0,0,0],
  [0,0,1,0,0],
  [0,1,1,1,0],
  [0,1,1,1,0],
  [0,1,1,1,0],
  [0,1,1,1,0],
  [0,1,1,1,0],
  [0,0,0,0,0],
  [0,0,0,0,0],
  [0,0,0,0,0],
  [0,0,0,0,0],
];
const SIDE_FLAME_FRAMES: number[][][] = [SIDE_FLAME_BM, SIDE_FLAME_BM, SIDE_FLAME_BM, SIDE_FLAME_BM];
const SIDE_FLAME_W = SIDE_FLAME_BM[0].length;
const SIDE_FLAME_H = SIDE_FLAME_BM.length;
const MSIDE_COLS = SIDE_FLAME_W + 2;
const MSIDE_ROWS = SIDE_FLAME_H + 2;

// ─── Brand palette (locked, ignores global city theme) ──
const FIRE_FACE = "#3a1a0d";
// Lit windows — red-orange tones (not yellow) so the building reads as orange.
const FIRE_WINDOW_LIT = ["#ff6a2e", "#ff4a00", "#ffaa4c"];

// ─── Glass texture ──────────────────────────────────────
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
  accentColor?: string, innerHotColor?: string,
  flameBM?: number[][], fxCol?: number, fxRow?: number,
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

      let isFlame = false;
      let isCore = false;
      let nearFlame = false;
      if (flameBM && fxCol != null && fxRow != null) {
        const fr = r - fxRow, fc = c - fxCol;
        if (fr >= 0 && fr < flameBM.length && fc >= 0 && fc < flameBM[0].length) {
          if (coreBM && coreBM[fr]?.[fc]) isCore = true;
          else if (flameBM[fr][fc]) isFlame = true;
        }
        if (!isFlame && !isCore &&
            fr >= -1 && fr <= flameBM.length && fc >= -1 && fc <= flameBM[0].length) {
          nearFlame = true;
        }
      }

      if (isCore && innerHotColor) {
        ctx.fillStyle = innerHotColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (isFlame && accentColor) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (nearFlame) {
        ctx.fillStyle = offColor;
        ctx.globalAlpha = 0.25;
      } else {
        const lit = (hash % 100) < 45;
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

// ─── 3D voxel flame (rooftop mascot) ────────────────────
// Built from tiny cubes so it reads as "pixel fire" from any distance.
// Each flame frame is a bitmap; frames are swapped at ~10fps for flicker.

// Rasterized Firecrawl SVG at 7×11.
const VOXEL_FLAME_BM: number[][] = [
  [0,0,0,1,0,0,0],
  [0,0,0,1,1,0,0],
  [0,0,1,1,1,0,0],
  [0,0,1,1,1,0,0],
  [0,1,1,1,1,1,0],
  [0,1,1,1,1,1,1],
  [0,1,1,1,1,1,1],
  [1,1,1,0,1,1,1],
  [1,1,1,0,1,1,1],
  [1,1,0,0,0,1,1],
  [0,1,0,0,0,1,0],
];
const VOXEL_CORE_BM: number[][] = [
  [0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0],
  [0,0,0,1,0,0,0],
  [0,0,1,1,1,0,0],
  [0,1,1,1,1,1,0],
  [0,1,1,1,1,1,0],
  [0,1,1,1,1,1,0],
  [0,0,1,0,1,0,0],
  [0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0],
];

interface VoxelFlame {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
}

function createVoxelFlame(accent: string): VoxelFlame {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 2.6, toneMapped: false,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: "#ffe27a", emissive: "#ffe27a", emissiveIntensity: 3.6, toneMapped: false,
  });

  const CUBE = 2.4;
  const CORE_CUBE = 1.6;
  const geo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
  const coreGeo = new THREE.BoxGeometry(CORE_CUBE, CORE_CUBE, CORE_CUBE);
  const cols = VOXEL_FLAME_BM[0].length;
  const rows = VOXEL_FLAME_BM.length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!VOXEL_FLAME_BM[r][c]) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (c - (cols - 1) / 2) * CUBE,
        ((rows - 1 - r) - (rows - 1) / 2) * CUBE,
        0,
      );
      group.add(mesh);
    }
  }

  // Yellow hot core — smaller cubes, floated slightly forward so they pop.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!VOXEL_CORE_BM[r][c]) continue;
      const mesh = new THREE.Mesh(coreGeo, coreMat);
      mesh.position.set(
        (c - (cols - 1) / 2) * CUBE,
        ((rows - 1 - r) - (rows - 1) / 2) * CUBE,
        CUBE * 0.55,
      );
      group.add(mesh);
    }
  }

  mergeStaticChildren(group);
  return { group, mat, coreMat };
}

// ─── Helpers ────────────────────────────────────────────
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

/** Facade that cycles through flame keyframes every ~110ms. */
function AnimatedFlameFacade({
  frames, w, h, pos, rotY, emColor, phaseOffset,
}: {
  frames: THREE.Texture[];
  w: number;
  h: number;
  pos: [number, number, number];
  rotY: number;
  emColor: string;
  /** Seconds of phase offset so front and back tick out of sync. */
  phaseOffset: number;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lastTick = useRef(0);
  const idx = useRef(0);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: frames[0],
      emissive: emColor,
      emissiveMap: frames[0],
      emissiveIntensity: 0.85,
      toneMapped: false,
      transparent: true,
    });
    matRef.current = m;
    return m;
  }, [frames, emColor]);

  useEffect(() => () => { material.dispose(); }, [material]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phaseOffset;
    const m = matRef.current;
    if (!m) return;

    // Continuous "breathing" glow — visible every frame, not just on keyframe ticks.
    m.emissiveIntensity =
      1.1 + Math.sin(t * 6.3) * 0.45 + Math.sin(t * 12.7) * 0.2;

    // Keyframe swap every ~80ms for clear flicker.
    if (t - lastTick.current >= 0.08) {
      lastTick.current = t;
      idx.current = (idx.current + 1) % frames.length;
      m.map = frames[idx.current];
      m.emissiveMap = frames[idx.current];
    }
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

export default function FirecrawlBuilding({
  themeAccent,
}: SponsorBuildingProps) {
  const flameGroupRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const flameLightFront = useRef<THREE.PointLight>(null);
  const flameLightBack = useRef<THREE.PointLight>(null);
  const baseEmberRef = useRef<THREE.PointLight>(null);
  const flame3DRef = useRef<VoxelFlame | null>(null);

  const themeFace = FIRE_FACE;
  const themeWindowLit = FIRE_WINDOW_LIT;

  const shellColor = useMemo(() => {
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(1.8);
    return "#" + c.getHexString();
  }, [themeFace]);
  const windowOff = useMemo(() => {
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(0.6);
    return "#" + c.getHexString();
  }, [themeFace]);

  const innerHot = useMemo(() => {
    const c = new THREE.Color(themeAccent);
    c.lerp(new THREE.Color("#ffe27a"), 0.55);
    return "#" + c.getHexString();
  }, [themeAccent]);

  const fxCol = Math.floor((MIN_COLS - FLAME_W) / 2);
  const fxRow = Math.floor((M_ROWS - FLAME_H) / 2);
  const sxCol = Math.floor((MSIDE_COLS - SIDE_FLAME_W) / 2);
  const sxRow = Math.floor((MSIDE_ROWS - SIDE_FLAME_H) / 2);

  const B_Y = BH / 2 + 4;
  const M_Y = BH + 4 + MH / 2;
  const T_Y = BH + MH + 4 + TH / 2;

  // ── Flame facade textures (static — shape matches Firecrawl logo) ──
  const flameFramesFront = useMemo(
    () => FLAME_FRAMES.map((bm, i) =>
      createGlassTex(MIN_COLS, M_ROWS, 51 + i * 17, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, fxCol, fxRow, FLAME_CORE_BM),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, fxCol, fxRow],
  );
  const flameFramesBack = useMemo(
    () => FLAME_FRAMES.map((bm, i) =>
      createGlassTex(MIN_COLS, M_ROWS, 117 + i * 19, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, fxCol, fxRow, FLAME_CORE_BM),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, fxCol, fxRow],
  );
  const flameFramesLeft = useMemo(
    () => SIDE_FLAME_FRAMES.map((bm, i) =>
      createGlassTex(MSIDE_COLS, MSIDE_ROWS, 201 + i * 13, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, sxCol, sxRow, SIDE_FLAME_CORE_BM),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, sxCol, sxRow],
  );
  const flameFramesRight = useMemo(
    () => SIDE_FLAME_FRAMES.map((bm, i) =>
      createGlassTex(MSIDE_COLS, MSIDE_ROWS, 257 + i * 23, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, sxCol, sxRow, SIDE_FLAME_CORE_BM),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, sxCol, sxRow],
  );

  const bFront = useMemo(() =>
    createGlassTex(MIN_COLS, 9, 76, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const bSide = useMemo(() =>
    createGlassTex(5, 9, 89, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  const tFront = useMemo(() =>
    createGlassTex(MIN_COLS, 7, 58, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const tSide = useMemo(() =>
    createGlassTex(4, 7, 69, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  useEffect(() => () => {
    for (const t of flameFramesFront) t.dispose();
    for (const t of flameFramesBack) t.dispose();
    for (const t of flameFramesLeft) t.dispose();
    for (const t of flameFramesRight) t.dispose();
    bFront.dispose(); bSide.dispose();
    tFront.dispose(); tSide.dispose();
  }, [flameFramesFront, flameFramesBack, flameFramesLeft, flameFramesRight, bFront, bSide, tFront, tSide]);

  const voxelFlame = useMemo(() => createVoxelFlame(themeAccent), [themeAccent]);
  useEffect(() => {
    flame3DRef.current = voxelFlame;
  }, [voxelFlame]);

  const shellMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.25, metalness: 0.8 }),
    [shellColor],
  );
  const shellMatLight = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.4, metalness: 0.5 }),
    [shellColor],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // ── Voxel flame: gentle sway + subtle pulse of emissive ──
    const f3d = flame3DRef.current;
    if (f3d && flameGroupRef.current) {
      flameGroupRef.current.rotation.y = Math.sin(t * 1.2) * 0.18;
      flameGroupRef.current.position.y = Math.sin(t * 2.3) * 1.5;
      const sy = 1 + Math.sin(t * 4.7) * 0.07 + Math.sin(t * 2.1) * 0.04;
      flameGroupRef.current.scale.set(1, sy, 1);
      f3d.mat.emissiveIntensity = 2.6 + Math.sin(t * 5.3) * 0.6 + Math.sin(t * 11.1) * 0.25;
    }

    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 1.5) * 0.8;
    }
    const flameFlicker = 55 + Math.sin(t * 4.1) * 18 + Math.sin(t * 7.3) * 10;
    if (flameLightFront.current) flameLightFront.current.intensity = flameFlicker;
    if (flameLightBack.current) flameLightBack.current.intensity = flameFlicker;
    if (baseEmberRef.current) {
      baseEmberRef.current.intensity = 22 + Math.sin(t * 3.2) * 8 + Math.sin(t * 8.7) * 4;
    }
  });

  const emC = themeWindowLit[0] ?? "#fff";
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
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* ── Base section ── */}
      <BoxSection
        w={BW} h={BH} d={BD} y={B_Y}
        shellMat={shellMat} glassFront={bFront} glassSide={bSide}
        emColor={emC} accent={themeAccent}
      />

      <mesh position={[0, BH + 4, 0]}>
        <boxGeometry args={[BW + 2, 1.5, BD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Mid section shell + animated flame facades ── */}
      <mesh position={[0, M_Y, 0]}>
        <boxGeometry args={[MW, MH, MD]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      <AnimatedFlameFacade
        frames={flameFramesFront}
        w={MW} h={MH} pos={[0, M_Y, MD / 2 + 0.3]} rotY={0} emColor={emC} phaseOffset={0}
      />
      <AnimatedFlameFacade
        frames={flameFramesBack}
        w={MW} h={MH} pos={[0, M_Y, -MD / 2 - 0.3]} rotY={Math.PI} emColor={emC} phaseOffset={0.055}
      />
      <AnimatedFlameFacade
        frames={flameFramesRight}
        w={MD} h={MH} pos={[MW / 2 + 0.3, M_Y, 0]} rotY={Math.PI / 2} emColor={emC} phaseOffset={0.13}
      />
      <AnimatedFlameFacade
        frames={flameFramesLeft}
        w={MD} h={MH} pos={[-MW / 2 - 0.3, M_Y, 0]} rotY={-Math.PI / 2} emColor={emC} phaseOffset={0.19}
      />
      <CornerStrips w={MW} d={MD} h={MH} yC={M_Y} accent={themeAccent} />

      <pointLight ref={flameLightFront} position={[0, M_Y, MD / 2 + 22]} color={themeAccent} intensity={55} distance={110} decay={2} />
      <pointLight ref={flameLightBack} position={[0, M_Y, -MD / 2 - 22]} color={themeAccent} intensity={55} distance={110} decay={2} />
      <pointLight position={[MW / 2 + 22, M_Y, 0]} color={themeAccent} intensity={38} distance={90} decay={2} />
      <pointLight position={[-MW / 2 - 22, M_Y, 0]} color={themeAccent} intensity={38} distance={90} decay={2} />

      <mesh position={[0, BH + MH + 4, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Top section ── */}
      <BoxSection
        w={TW} h={TH} d={TD} y={T_Y}
        shellMat={shellMat} glassFront={tFront} glassSide={tSide}
        emColor={emC} accent={themeAccent}
      />

      <mesh position={[0, topY, 0]}>
        <boxGeometry args={[TW + 4, 1.2, TD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      <mesh position={[0, topY + 1.5, 0]}>
        <boxGeometry args={[TW - 8, 2, TD - 8]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, topY + 3, 0]}>
        <boxGeometry args={[TW - 6, 0.6, TD - 6]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>

      {/* ── Antenna ── */}
      <mesh position={[0, antennaY, 0]}>
        <cylinderGeometry args={[0.5, 1.5, 42, 4]} />
        <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
      </mesh>

      {/* ── Voxel pixel-flame on top (animated frame cycle) ── */}
      <group position={[0, antennaY + 38, 0]} scale={1.6}>
        <group ref={flameGroupRef}>
          <primitive object={voxelFlame.group} />
        </group>
        <pointLight color={themeAccent} intensity={70} distance={160} decay={2} />
      </group>

      {/* ── Beacon ── */}
      <mesh ref={beaconRef} position={[0, antennaY + 70, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, antennaY + 70, 0]} color={themeAccent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance ember glow (warm flicker at street level) ── */}
      <pointLight ref={baseEmberRef} position={[0, 10, BD / 2 + 10]} color={themeAccent} intensity={22} distance={55} decay={2} />
    </group>
  );
}
