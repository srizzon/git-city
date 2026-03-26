"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";

// ─── Rocket Tower: 3 sections tapering upward ──────────
// Base (widest)
const BW = 110, BD = 55, BH = 160;
// Mid section (narrower)
const MW = 80, MD = 48, MH = 140;
const M_Y = BH + 4 + MH / 2;
// Top section (narrowest)
const TW = 55, TD = 40, TH = 80;
const T_Y = BH + 4 + MH + 4 + TH / 2;
// Nose cone
const NOSE_H = 40;

// ─── Pixel font ─────────────────────────────────────────
const PF: Record<string, number[][]> = {
  A: [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  C: [[0,1,1],[1,0,0],[1,0,0],[1,0,0],[0,1,1]],
  E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  L: [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  R: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  D: [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
  V: [[1,0,1],[1,0,1],[1,0,1],[0,1,0],[0,1,0]],
};

function makeLineBitmap(word: string): number[][] {
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

function makeCombinedBitmap(): number[][] {
  const l1 = makeLineBitmap("ACELERA");
  const l2 = makeLineBitmap("DEV");
  const w = Math.max(l1[0].length, l2[0].length);
  const gap = 2;
  const bm = Array.from({ length: 5 + gap + 5 }, () => Array(w).fill(0));
  const o1 = Math.floor((w - l1[0].length) / 2);
  for (let r = 0; r < 5; r++) for (let c = 0; c < l1[0].length; c++) bm[r][o1 + c] = l1[r][c];
  const o2 = Math.floor((w - l2[0].length) / 2);
  for (let r = 0; r < 5; r++) for (let c = 0; c < l2[0].length; c++) bm[5 + gap + r][o2 + c] = l2[r][c];
  return bm;
}

const TEXT_BM = makeCombinedBitmap();
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
  const shellC = new THREE.Color(faceColor); shellC.multiplyScalar(1.8);
  const gridColor = "#" + shellC.getHexString();
  ctx.fillStyle = faceColor; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * cH); ctx.lineTo(w, r * cH); ctx.stroke(); }
  for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cW, 0); ctx.lineTo(c * cW, h); ctx.stroke(); }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hash = ((r * 13 + c * 23 + seed) * 2654435761) >>> 0;
      let isText = false, nearText = false;
      if (textBM && txCol != null && txRow != null) {
        const tr = r - txRow, tc = c - txCol;
        if (tr >= 0 && tr < textBM.length && tc >= 0 && tc < textBM[0].length && textBM[tr][tc]) isText = true;
        if (!isText && tr >= -2 && tr <= textBM.length + 1 && tc >= -1 && tc <= textBM[0].length) nearText = true;
      }
      if (isText && accentColor) {
        ctx.fillStyle = accentColor; ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.25; ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1; continue;
      } else if (nearText) { ctx.fillStyle = offColor; ctx.globalAlpha = 0.25; }
      else {
        const lit = (hash % 100) < 45;
        if (lit) { ctx.fillStyle = litColors[hash % litColors.length]; ctx.globalAlpha = 0.45 + (hash % 20) / 100; }
        else { ctx.fillStyle = offColor; ctx.globalAlpha = 0.55; }
      }
      ctx.fillRect(c * cW + 2, r * cH + 2, cW - 4, cH - 4); ctx.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Lightning bolt logo (green ⚡) ─────────────────────
function createLightningBolt(): THREE.Group {
  const g = new THREE.Group();
  const GREEN = "#22c55e";
  const mat = new THREE.MeshStandardMaterial({
    color: GREEN, emissive: GREEN, emissiveIntensity: 3, toneMapped: false,
  });

  // Lightning bolt shape as extruded geometry
  const shape = new THREE.Shape();
  // Bolt shape (pointing down) — scaled to ~30 units tall
  shape.moveTo(2, 15);
  shape.lineTo(8, 15);
  shape.lineTo(2, 2);
  shape.lineTo(6, 2);
  shape.lineTo(-2, -15);
  shape.lineTo(-8, -15);
  shape.lineTo(-2, -2);
  shape.lineTo(-6, -2);
  shape.closePath();

  const extrudeSettings = { depth: 5, bevelEnabled: true, bevelThickness: 1, bevelSize: 0.5, bevelSegments: 2 };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);

  return g;
}

// ─── Helpers ────────────────────────────────────────────
function GlassFacade({ tex, w, h, pos, rotY, emColor }: { tex: THREE.Texture; w: number; h: number; pos: [number, number, number]; rotY: number; emColor: string }) {
  return (
    <mesh position={pos} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w - 4, h - 4]} />
      <meshStandardMaterial map={tex} emissive={emColor} emissiveMap={tex} emissiveIntensity={0.7} toneMapped={false} transparent />
    </mesh>
  );
}

function CornerStrips({ w, d, h, yC, accent }: { w: number; d: number; h: number; yC: number; accent: string }) {
  const hw = w / 2, hd = d / 2;
  return (<>
    {[[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]].map(([cx, cz], i) => (
      <mesh key={i} position={[cx, yC, cz]}>
        <boxGeometry args={[0.6, h, 0.6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    ))}
  </>);
}

function BoxWithGlass({ w, h, d, y, shellMat, glassFront, glassSide, emColor, accent }: {
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
export default function AceleraDevBuilding({ themeAccent, themeWindowLit, themeFace }: SponsorBuildingProps) {
  const boltRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const shellColor = useMemo(() => { const c = new THREE.Color(themeFace); c.multiplyScalar(1.8); return "#" + c.getHexString(); }, [themeFace]);
  const windowOff = useMemo(() => { const c = new THREE.Color(themeFace); c.multiplyScalar(0.6); return "#" + c.getHexString(); }, [themeFace]);

  const shellMat = useMemo(() => new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.25, metalness: 0.8 }), [shellColor]);
  const shellMatLight = useMemo(() => new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.4, metalness: 0.5 }), [shellColor]);

  const txCol = Math.floor((MIN_COLS - TXT_W) / 2);

  // Mid section glass — has "ACELERA" / "DEV" text
  const midFront = useMemo(() => createGlassTex(MIN_COLS, 18, 44, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, 2), [themeWindowLit, windowOff, themeFace, themeAccent]);
  const midBack = useMemo(() => createGlassTex(MIN_COLS, 18, 111, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, 2), [themeWindowLit, windowOff, themeFace, themeAccent]);
  const midSide = useMemo(() => createGlassTex(8, 18, 88, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);

  // Base glass — no text
  const baseFront = useMemo(() => createGlassTex(12, 14, 55, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);
  const baseSide = useMemo(() => createGlassTex(8, 14, 66, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);

  // Top glass — no text
  const topFront = useMemo(() => createGlassTex(8, 8, 77, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);
  const topSide = useMemo(() => createGlassTex(6, 8, 99, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);

  const allTex = [midFront, midBack, midSide, baseFront, baseSide, topFront, topSide];
  useEffect(() => () => { for (const t of allTex) t.dispose(); }, allTex);

  const bolt3D = useMemo(() => createLightningBolt(), []);
  const emC = themeWindowLit[0] ?? "#fff";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (boltRef.current) boltRef.current.rotation.y = t * 0.4;
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.2);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 2) * 1;
    }
  });

  const noseTop = T_Y + TH / 2 + NOSE_H;
  const boltY = noseTop + 28;

  return (
    <group>
      {/* ── Platform ── */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[BW + 30, 3, BD + 28]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[BW + 32, 1, BD + 30]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* ── Base section (widest) ── */}
      <BoxWithGlass w={BW} h={BH} d={BD} y={BH / 2 + 4} shellMat={shellMat} glassFront={baseFront} glassSide={baseSide} emColor={emC} accent={themeAccent} />

      {/* Base accent bands */}
      {[0.33, 0.66].map((f, i) => (
        <mesh key={`bb-${i}`} position={[0, BH * f + 4, 0]}>
          <boxGeometry args={[BW + 2, 1.5, BD + 2]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>
      ))}

      {/* Base top trim + ledge */}
      <mesh position={[0, BH + 4, 0]}>
        <boxGeometry args={[BW + 6, 1.5, BD + 6]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* ── Mid section (with text) ── */}
      <BoxWithGlass w={MW} h={MH} d={MD} y={M_Y} shellMat={shellMat} glassFront={midFront} glassSide={midSide} emColor={emC} accent={themeAccent} />
      {/* Override back face with text version */}
      <GlassFacade tex={midBack} w={MW} h={MH} pos={[0, M_Y, -MD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />

      {/* Mid accent band */}
      <mesh position={[0, M_Y, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* Mid top trim + ledge */}
      <mesh position={[0, BH + 4 + MH + 4, 0]}>
        <boxGeometry args={[MW + 6, 1.5, MD + 6]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Text glow */}
      <pointLight position={[0, M_Y, MD / 2 + 20]} color={themeAccent} intensity={30} distance={80} decay={2} />
      <pointLight position={[0, M_Y, -MD / 2 - 20]} color={themeAccent} intensity={30} distance={80} decay={2} />

      {/* ── Top section (narrowest) ── */}
      <BoxWithGlass w={TW} h={TH} d={TD} y={T_Y} shellMat={shellMat} glassFront={topFront} glassSide={topSide} emColor={emC} accent={themeAccent} />

      {/* Top accent band */}
      <mesh position={[0, T_Y, 0]}>
        <boxGeometry args={[TW + 2, 1.5, TD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* Top trim */}
      <mesh position={[0, T_Y + TH / 2, 0]}>
        <boxGeometry args={[TW + 4, 1.2, TD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* ── Nose cone (triangular cap) ── */}
      <mesh position={[0, T_Y + TH / 2 + NOSE_H / 2, 0]}>
        <coneGeometry args={[TW / 2 * 0.9, NOSE_H, 4]} />
        <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
      </mesh>
      {/* Nose accent edges */}
      <mesh position={[0, T_Y + TH / 2 + 1, 0]}>
        <boxGeometry args={[TW + 2, 1, TD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Lightning bolt (green ⚡) ── */}
      <group ref={boltRef} position={[0, boltY, 0]}>
        <primitive object={bolt3D} />
        <pointLight color="#22c55e" intensity={50} distance={120} decay={2} />
      </group>

      {/* ── Green beacon (pulsing) ── */}
      <mesh ref={beaconRef} position={[0, boltY + 22, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, boltY + 22, 0]} color="#22c55e" intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow ── */}
      <pointLight position={[0, 12, BD / 2 + 10]} color={themeAccent} intensity={15} distance={40} decay={2} />
    </group>
  );
}
