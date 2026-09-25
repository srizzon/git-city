"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeStaticChildren } from "@/lib/three-merge";
import MergedStatic from "@/components/MergedStatic";
import type { SponsorBuildingProps } from "../registry";

// ─── Building dimensions ────────────────────────────────
const BW = 105, BD = 58, BH = 125;   // Base
const MW = 100, MD = 56, MH = 155;   // Mid (hosts the [ O ] logo)
const TW = 72,  TD = 45, TH = 95;    // Top

// ─── Front/back logo bitmap (11 × 7) ────────────────────
// "[ • ]" — left bracket (cols 0-1), single solid dot at col 5, right bracket (cols 9-10).
const LOGO_BM: number[][] = [
  [1,1,0,0,0,0,0,0,0,1,1],
  [1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,1],
  [1,1,0,0,0,0,0,0,0,1,1],
];
const LOGO_FRAMES: number[][][] = [LOGO_BM, LOGO_BM, LOGO_BM, LOGO_BM];
const LOGO_W = LOGO_BM[0].length;
const LOGO_H = LOGO_BM.length;
const MAIN_COLS = LOGO_W + 2;   // 13
const MAIN_ROWS = LOGO_H + 11;  // 18 — leaves room for windows above/below

// ─── Side logo bitmap (single solid dot, 5 × 5 frame) ───
const SIDE_LOGO_BM: number[][] = [
  [0,0,0,0,0],
  [0,0,0,0,0],
  [0,0,1,0,0],
  [0,0,0,0,0],
  [0,0,0,0,0],
];
const SIDE_FRAMES: number[][][] = [SIDE_LOGO_BM, SIDE_LOGO_BM, SIDE_LOGO_BM, SIDE_LOGO_BM];
const SIDE_LOGO_W = SIDE_LOGO_BM[0].length;
const SIDE_LOGO_H = SIDE_LOGO_BM.length;
const SIDE_COLS = SIDE_LOGO_W + 2;   // 7
const SIDE_ROWS = MAIN_ROWS;          // align with front so cells match

// ─── Brand palette (locked, ignores global city theme) ──
// Off-white shell, dark navy facade interior so lit windows pop.
const ULTRA_SHELL_COLOR  = "#eef0f4";
const ULTRA_FACE         = "#0e1320";
const ULTRA_WINDOW_LIT   = ["#ffffff", "#e8efff", "#dde6f0", "#c6d4ec"];

// ─── Glass texture ──────────────────────────────────────
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
  accentColor?: string, innerHotColor?: string,
  logoBM?: number[][], fxCol?: number, fxRow?: number,
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
      let nearLogo = false;
      if (logoBM && fxCol != null && fxRow != null) {
        const lr = r - fxRow, lc = c - fxCol;
        if (lr >= 0 && lr < logoBM.length && lc >= 0 && lc < logoBM[0].length) {
          if (logoBM[lr][lc]) isLogo = true;
        }
        if (!isLogo &&
            lr >= -1 && lr <= logoBM.length && lc >= -1 && lc <= logoBM[0].length) {
          nearLogo = true;
        }
      }

      if (isLogo && accentColor) {
        // Logo pixel — accent color, bright with halo bleed
        ctx.fillStyle = innerHotColor ?? accentColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (nearLogo) {
        ctx.fillStyle = offColor;
        ctx.globalAlpha = 0.25;
      } else {
        // Window pattern — dense lit (white skyscraper at night)
        const lit = (hash % 100) < 55;
        if (lit) {
          ctx.fillStyle = litColors[hash % litColors.length];
          ctx.globalAlpha = 0.55 + (hash % 20) / 100;
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

// ─── Voxel brackets for antenna ─────────────────────────
// Built from tiny cubes so they read as "pixel brackets" from any angle.
// Each bracket is a 3-col × 7-row sculpture orbiting around a central sphere.

const BRACKET_LEFT_BM: number[][] = [
  [1,1,1,1],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,0,0],
  [1,1,1,1],
];
const BRACKET_RIGHT_BM: number[][] = [
  [1,1,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [0,0,1,1],
  [1,1,1,1],
];

interface VoxelBracket {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
}

function createVoxelBracket(bm: number[][], color: string, accent: string): VoxelBracket {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: accent, emissiveIntensity: 1.4, toneMapped: false,
    roughness: 0.3, metalness: 0.4,
  });

  const CUBE = 3.4;
  const geo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
  const cols = bm[0].length;
  const rows = bm.length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!bm[r][c]) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (c - (cols - 1) / 2) * CUBE,
        ((rows - 1 - r) - (rows - 1) / 2) * CUBE,
        0,
      );
      group.add(mesh);
    }
  }

  mergeStaticChildren(group);
  return { group, mat };
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

/** Facade that gently "breathes" the emissive intensity (logo pulse). */
function AnimatedLogoFacade({
  frames, w, h, pos, rotY, emColor, phaseOffset,
}: {
  frames: THREE.Texture[];
  w: number;
  h: number;
  pos: [number, number, number];
  rotY: number;
  emColor: string;
  phaseOffset: number;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: frames[0],
      emissive: emColor,
      emissiveMap: frames[0],
      emissiveIntensity: 0.9,
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
    // Subtle breathing — clean tech building, no flicker.
    m.emissiveIntensity = 1.0 + Math.sin(t * 1.2) * 0.25;
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

export default function UltraContextBuilding({
  themeAccent,
}: SponsorBuildingProps) {
  const orbitRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const logoLightFront = useRef<THREE.PointLight>(null);
  const logoLightBack = useRef<THREE.PointLight>(null);
  const bracketLeftRef = useRef<VoxelBracket | null>(null);
  const bracketRightRef = useRef<VoxelBracket | null>(null);

  const themeFace = ULTRA_FACE;
  const themeWindowLit = ULTRA_WINDOW_LIT;

  const shellColor = ULTRA_SHELL_COLOR;
  const windowOff = useMemo(() => {
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(1.4);
    return "#" + c.getHexString();
  }, [themeFace]);

  // Brighter "core" of the logo — accent lerped toward white for sparkle.
  const innerHot = useMemo(() => {
    const c = new THREE.Color(themeAccent);
    c.lerp(new THREE.Color("#ffffff"), 0.4);
    return "#" + c.getHexString();
  }, [themeAccent]);

  const fxCol = Math.floor((MAIN_COLS - LOGO_W) / 2);
  const fxRow = Math.floor((MAIN_ROWS - LOGO_H) / 2);
  const sxCol = Math.floor((SIDE_COLS - SIDE_LOGO_W) / 2);
  const sxRow = Math.floor((SIDE_ROWS - SIDE_LOGO_H) / 2);

  const B_Y = BH / 2 + 4;
  const M_Y = BH + 4 + MH / 2;
  const T_Y = BH + MH + 4 + TH / 2;

  // ── Logo facade textures (4 sides, slightly different seeds for window pattern) ──
  const logoFront = useMemo(
    () => LOGO_FRAMES.map((bm, i) =>
      createGlassTex(MAIN_COLS, MAIN_ROWS, 41 + i * 17, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, fxCol, fxRow),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, fxCol, fxRow],
  );
  const logoBack = useMemo(
    () => LOGO_FRAMES.map((bm, i) =>
      createGlassTex(MAIN_COLS, MAIN_ROWS, 113 + i * 19, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, fxCol, fxRow),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, fxCol, fxRow],
  );
  const logoLeft = useMemo(
    () => SIDE_FRAMES.map((bm, i) =>
      createGlassTex(SIDE_COLS, SIDE_ROWS, 197 + i * 13, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, sxCol, sxRow),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, sxCol, sxRow],
  );
  const logoRight = useMemo(
    () => SIDE_FRAMES.map((bm, i) =>
      createGlassTex(SIDE_COLS, SIDE_ROWS, 263 + i * 23, themeWindowLit, windowOff, themeFace, themeAccent, innerHot, bm, sxCol, sxRow),
    ),
    [themeWindowLit, windowOff, themeFace, themeAccent, innerHot, sxCol, sxRow],
  );

  const bFront = useMemo(() =>
    createGlassTex(MAIN_COLS, 9, 71, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const bSide = useMemo(() =>
    createGlassTex(5, 9, 87, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  const tFront = useMemo(() =>
    createGlassTex(MAIN_COLS, 7, 53, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const tSide = useMemo(() =>
    createGlassTex(4, 7, 67, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  useEffect(() => () => {
    for (const t of logoFront) t.dispose();
    for (const t of logoBack) t.dispose();
    for (const t of logoLeft) t.dispose();
    for (const t of logoRight) t.dispose();
    bFront.dispose(); bSide.dispose();
    tFront.dispose(); tSide.dispose();
  }, [logoFront, logoBack, logoLeft, logoRight, bFront, bSide, tFront, tSide]);

  // ── Voxel brackets (orbit around central beacon) ──
  const bracketLeft = useMemo(() => createVoxelBracket(BRACKET_LEFT_BM, "#ffffff", themeAccent), [themeAccent]);
  const bracketRight = useMemo(() => createVoxelBracket(BRACKET_RIGHT_BM, "#ffffff", themeAccent), [themeAccent]);
  useEffect(() => {
    bracketLeftRef.current = bracketLeft;
    bracketRightRef.current = bracketRight;
  }, [bracketLeft, bracketRight]);

  const shellMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.3, metalness: 0.4 }),
    [shellColor],
  );
  const shellMatLight = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.45, metalness: 0.25 }),
    [shellColor],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // ── Brackets orbiting around central beacon ──
    if (orbitRef.current) {
      orbitRef.current.rotation.y = t * 0.9;
    }
    const bl = bracketLeftRef.current;
    const br = bracketRightRef.current;
    const pulse = 1.4 + Math.sin(t * 2.2) * 0.4;
    if (bl) bl.mat.emissiveIntensity = pulse;
    if (br) br.mat.emissiveIntensity = pulse;

    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.8) * 0.1);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2.2 + Math.sin(t * 1.8) * 0.6;
    }
    const logoGlow = 38 + Math.sin(t * 1.3) * 8;
    if (logoLightFront.current) logoLightFront.current.intensity = logoGlow;
    if (logoLightBack.current) logoLightBack.current.intensity = logoGlow;
  });

  const emC = themeWindowLit[0] ?? "#ffffff";
  const topY = BH + MH + TH + 4;
  const antennaY = topY + 25;

  return (
    <group>
      {/* Static tower: one draw call per look instead of one per box */}
      <MergedStatic>
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

        {/* ── Mid section (logo) ── */}
        <mesh position={[0, M_Y, 0]}>
          <boxGeometry args={[MW, MH, MD]} />
          <primitive object={shellMat} attach="material" />
        </mesh>
        <AnimatedLogoFacade
          frames={logoFront}
          w={MW} h={MH} pos={[0, M_Y, MD / 2 + 0.3]} rotY={0} emColor={emC} phaseOffset={0}
        />
        <AnimatedLogoFacade
          frames={logoBack}
          w={MW} h={MH} pos={[0, M_Y, -MD / 2 - 0.3]} rotY={Math.PI} emColor={emC} phaseOffset={0.7}
        />
        <AnimatedLogoFacade
          frames={logoRight}
          w={MD} h={MH} pos={[MW / 2 + 0.3, M_Y, 0]} rotY={Math.PI / 2} emColor={emC} phaseOffset={1.4}
        />
        <AnimatedLogoFacade
          frames={logoLeft}
          w={MD} h={MH} pos={[-MW / 2 - 0.3, M_Y, 0]} rotY={-Math.PI / 2} emColor={emC} phaseOffset={2.1}
        />
        <CornerStrips w={MW} d={MD} h={MH} yC={M_Y} accent={themeAccent} />

        <pointLight ref={logoLightFront} position={[0, M_Y, MD / 2 + 22]} color={themeAccent} intensity={38} distance={100} decay={2} />
        <pointLight ref={logoLightBack} position={[0, M_Y, -MD / 2 - 22]} color={themeAccent} intensity={38} distance={100} decay={2} />
        <pointLight position={[MW / 2 + 22, M_Y, 0]} color={themeAccent} intensity={26} distance={80} decay={2} />
        <pointLight position={[-MW / 2 - 22, M_Y, 0]} color={themeAccent} intensity={26} distance={80} decay={2} />

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

        {/* ── Antenna pole ── */}
        <mesh position={[0, antennaY, 0]}>
          <cylinderGeometry args={[0.5, 1.5, 42, 4]} />
          <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
        </mesh>
      </MergedStatic>

      {/* ── Antenna crown: orbiting brackets around central beacon ── */}
      <group position={[0, antennaY + 38, 0]}>
        {/* Central beacon sphere ("•") — small, single dot */}
        <mesh ref={beaconRef}>
          <sphereGeometry args={[3, 12, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={2.8}
            toneMapped={false}
          />
        </mesh>
        <pointLight color="#ffffff" intensity={60} distance={150} decay={2} />

        {/* Orbiting brackets — voxel groups offset to either side, parent rotates around Y */}
        <group ref={orbitRef}>
          <group position={[26, 0, 0]}>
            <primitive object={bracketRight.group} />
          </group>
          <group position={[-26, 0, 0]}>
            <primitive object={bracketLeft.group} />
          </group>
        </group>
      </group>

      {/* ── Top accent beacon (smaller, above brackets) ── */}
      <mesh position={[0, antennaY + 70, 0]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, antennaY + 70, 0]} color={themeAccent} intensity={14} distance={70} decay={2} />
    </group>
  );
}
