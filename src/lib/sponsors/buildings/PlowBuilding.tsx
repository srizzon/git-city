"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";

// ─── Building dimensions: Single modern tower ─────────
const BW = 100, BD = 60, BH = 120;   // Base section
const MW = 90,  MD = 55, MH = 130;   // Mid section
const TW = 75,  TD = 50, TH = 100;   // Top section

// ─── Pixel font ─────────────────────────────────────────
const PF: Record<string, number[][]> = {
  P: [[1,1,0],[1,0,1],[1,1,0],[1,0,0],[1,0,0]],
  L: [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  O: [[0,1,0],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  W: [[1,0,1],[1,0,1],[1,1,1],[1,1,1],[1,0,1]],
};

function makeBitmap(word: string): number[][] {
  const letters = word.split("").map(ch => PF[ch]);
  const h = letters[0].length;
  let w = 0;
  for (let i = 0; i < letters.length; i++) { w += letters[i][0].length; if (i < letters.length - 1) w++; }
  const bm = Array.from({ length: h }, () => Array(w).fill(0));
  let col = 0;
  for (const L of letters) {
    for (let r = 0; r < h; r++) for (let c = 0; c < L[0].length; c++) bm[r][col + c] = L[r][c];
    col += L[0].length + 1;
  }
  return bm;
}

const TEXT_BM = makeBitmap("PLOW");
const TXT_W = TEXT_BM[0].length;
const MIN_COLS = TXT_W + 4;

// ─── Glass texture ──────────────────────────────────────
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
  accentColor?: string, textBM?: number[][], txCol?: number, txRow?: number,
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

      let isText = false;
      let nearText = false;
      if (textBM && txCol != null && txRow != null) {
        const tr = r - txRow, tc = c - txCol;
        if (tr >= 0 && tr < textBM.length && tc >= 0 && tc < textBM[0].length && textBM[tr][tc])
          isText = true;
        if (!isText && tr >= -2 && tr <= textBM.length + 1 && tc >= -1 && tc <= textBM[0].length)
          nearText = true;
      }

      if (isText && accentColor) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (nearText) {
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

// ─── OpenClaw mascot (round body, antennae, eyes, claws, legs) ───

function createOpenClawMascot(accent: string): THREE.Group {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.5, toneMapped: false,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: "#111", roughness: 0.5, metalness: 0.2,
  });

  // ── Body (large sphere, slightly squashed vertically) ──
  const body = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 16), bodyMat);
  body.scale.set(1, 0.9, 0.85);
  g.add(body);

  // ── Eyes (two dark spheres on front face) ──
  const eyeGeo = new THREE.SphereGeometry(2.2, 8, 8);
  const leftEye = new THREE.Mesh(eyeGeo, darkMat);
  leftEye.position.set(-4.5, 1, 11);
  g.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, darkMat);
  rightEye.position.set(4.5, 1, 11);
  g.add(rightEye);

  // ── Antennae (two thin cylinders with balls on top) ──
  const antMat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 2, toneMapped: false,
  });
  for (const xSign of [-1, 1]) {
    // Stalk
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 12, 4), antMat);
    stalk.position.set(xSign * 5, 16, 2);
    stalk.rotation.z = xSign * -0.3;
    g.add(stalk);
    // Tip ball
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), antMat);
    tip.position.set(xSign * 5 + xSign * Math.sin(0.3) * 6, 16 + Math.cos(0.3) * 6, 2);
    g.add(tip);
  }

  // ── Claws / arms (small spheres on sides) ──
  for (const xSign of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), bodyMat);
    claw.position.set(xSign * 15, -1, 2);
    claw.scale.set(0.7, 0.8, 0.7);
    g.add(claw);
  }

  // ── Legs (two short cylinders at bottom) ──
  for (const xSign of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 5, 6), bodyMat);
    leg.position.set(xSign * 5, -14, 1);
    g.add(leg);
    // Foot
    const foot = new THREE.Mesh(new THREE.SphereGeometry(2.5, 6, 6), bodyMat);
    foot.position.set(xSign * 5, -17, 1);
    foot.scale.set(1, 0.5, 1);
    g.add(foot);
  }

  return g;
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

export default function PlowBuilding({
  themeAccent,
  themeWindowLit,
  themeFace,
}: SponsorBuildingProps) {
  const mascotRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const textLightFront = useRef<THREE.PointLight>(null);
  const textLightBack = useRef<THREE.PointLight>(null);

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

  const txCol = Math.floor((MIN_COLS - TXT_W) / 2);

  // Section positions
  const B_Y = BH / 2 + 4;                          // base
  const M_Y = BH + 4 + MH / 2;                     // mid (text)
  const T_Y = BH + MH + 4 + TH / 2;                // top

  // Mid textures — text centered vertically
  const mRows = 10;
  const mTxRow = Math.floor((mRows - TEXT_BM.length) / 2);
  const mFront = useMemo(() =>
    createGlassTex(MIN_COLS, mRows, 51, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, mTxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const mFrontB = useMemo(() =>
    createGlassTex(MIN_COLS, mRows, 107, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, mTxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const mSide = useMemo(() =>
    createGlassTex(5, mRows, 88, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Base textures
  const bFront = useMemo(() =>
    createGlassTex(MIN_COLS, 8, 82, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const bSide = useMemo(() =>
    createGlassTex(5, 8, 93, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Top textures
  const tFront = useMemo(() =>
    createGlassTex(MIN_COLS, 7, 60, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const tSide = useMemo(() =>
    createGlassTex(4, 7, 71, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  const allTex = [mFront, mFrontB, mSide, bFront, bSide, tFront, tSide];
  useEffect(() => () => { for (const t of allTex) t.dispose(); }, allTex);

  const mascot3D = useMemo(() => createOpenClawMascot(themeAccent), [themeAccent]);

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
    if (mascotRef.current) mascotRef.current.rotation.y = t * 0.3;
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 1.5) * 0.8;
    }
    const lightI = 50 + Math.sin(t * 1.2) * 25;
    if (textLightFront.current) textLightFront.current.intensity = lightI;
    if (textLightBack.current) textLightBack.current.intensity = lightI;
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

      {/* Band between base and mid */}
      <mesh position={[0, BH + 4, 0]}>
        <boxGeometry args={[BW + 2, 1.5, BD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Mid section: Text "PLOW" ── */}
      <BoxSection
        w={MW} h={MH} d={MD} y={M_Y}
        shellMat={shellMat} glassFront={mFront} glassSide={mSide}
        emColor={emC} accent={themeAccent}
      />
      {/* Back face with text */}
      <GlassFacade tex={mFrontB} w={MW} h={MH} pos={[0, M_Y, -MD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />

      {/* Text glow lights */}
      <pointLight ref={textLightFront} position={[0, M_Y, MD / 2 + 20]} color={themeAccent} intensity={30} distance={80} decay={2} />
      <pointLight ref={textLightBack} position={[0, M_Y, -MD / 2 - 20]} color={themeAccent} intensity={30} distance={80} decay={2} />

      {/* Band between mid and top */}
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

      {/* Top trim */}
      <mesh position={[0, topY, 0]}>
        <boxGeometry args={[TW + 4, 1.2, TD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Rooftop pad */}
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

      {/* ── OpenClaw mascot (rotating) ── */}
      <group ref={mascotRef} position={[0, antennaY + 38, 0]}>
        <primitive object={mascot3D} />
        <pointLight color={themeAccent} intensity={40} distance={120} decay={2} />
      </group>

      {/* ── Beacon above mascot ── */}
      <mesh ref={beaconRef} position={[0, antennaY + 60, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, antennaY + 60, 0]} color={themeAccent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow ── */}
      <pointLight position={[0, 12, BD / 2 + 10]} color={themeAccent} intensity={15} distance={40} decay={2} />
    </group>
  );
}
