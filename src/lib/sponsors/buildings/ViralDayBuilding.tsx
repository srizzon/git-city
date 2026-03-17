"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";

// ─── Broadcast Tower: narrow base + wide screen top ─────
// Base (same width as screen, solid foundation)
const BW = 95, BD = 50, BH = 180;
// Screen section (text display area)
const SW = 95, SD = 50, SH = 170;
const S_Y = BH + 4 + SH / 2;
// Crown on top (narrower)
const CW = 65, CD = 38, CH = 30;

// ─── Pixel font ─────────────────────────────────────────
const PF: Record<string, number[][]> = {
  V: [[1,0,1],[1,0,1],[1,0,1],[0,1,0],[0,1,0]],
  I: [[1],[1],[1],[1],[1]],
  R: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
  A: [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  L: [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  D: [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
  Y: [[1,0,1],[1,0,1],[0,1,0],[0,1,0],[0,1,0]],
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

// Combined bitmap: "VIRAL" on top, 1 row gap, "DAY" centered below
function makeCombinedBitmap(): number[][] {
  const l1 = makeLineBitmap("VIRAL");
  const l2 = makeLineBitmap("DAY");
  const w = Math.max(l1[0].length, l2[0].length);
  const gap = 3;
  const bm = Array.from({ length: 5 + gap + 5 }, () => Array(w).fill(0));

  const o1 = Math.floor((w - l1[0].length) / 2);
  for (let r = 0; r < 5; r++) for (let c = 0; c < l1[0].length; c++) bm[r][o1 + c] = l1[r][c];

  const o2 = Math.floor((w - l2[0].length) / 2);
  for (let r = 0; r < 5; r++) for (let c = 0; c < l2[0].length; c++) bm[5 + gap + r][o2 + c] = l2[r][c];

  return bm;
}

const TEXT_BM = makeCombinedBitmap();
const TXT_W = TEXT_BM[0].length;
const TXT_H = TEXT_BM.length;
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
        if (lit) { ctx.fillStyle = litColors[hash % litColors.length]; ctx.globalAlpha = 0.45 + (hash % 20) / 100; }
        else { ctx.fillStyle = offColor; ctx.globalAlpha = 0.55; }
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

// ─── Play button logo ───────────────────────────────────
function createPlayLogo(accent: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.5, toneMapped: false });
  const r = 14;
  const pts = [
    new THREE.Vector3(-r * 0.7, 0, -r * 0.6),
    new THREE.Vector3(-r * 0.7, 0, r * 0.6),
    new THREE.Vector3(r * 0.8, 0, 0),
    new THREE.Vector3(-r * 0.7, 0, -r * 0.6),
  ];
  const path = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.01);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 40, 2.2, 8, false), mat));
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * (r + 4), 0, Math.sin(a) * (r + 4)));
  }
  const ringPath = new THREE.CatmullRomCurve3(ringPts, true, "catmullrom", 0.01);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(ringPath, 64, 1.5, 8, true), mat));
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
export default function ViralDayBuilding({
  themeAccent, themeWindowLit, themeFace,
}: SponsorBuildingProps) {
  const logoRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const shellColor = useMemo(() => { const c = new THREE.Color(themeFace); c.multiplyScalar(1.8); return "#" + c.getHexString(); }, [themeFace]);
  const windowOff = useMemo(() => { const c = new THREE.Color(themeFace); c.multiplyScalar(0.6); return "#" + c.getHexString(); }, [themeFace]);

  const shellMat = useMemo(() => new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.25, metalness: 0.8 }), [shellColor]);
  const shellMatLight = useMemo(() => new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.4, metalness: 0.5 }), [shellColor]);

  // Screen section glass — has "VIRAL DAY" text
  const screenRows = Math.max(TXT_H + 3, 14);
  const txCol = Math.floor((MIN_COLS - TXT_W) / 2);
  const txRow = 1;

  const screenFront = useMemo(() =>
    createGlassTex(MIN_COLS, screenRows, 42, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, txRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const screenBack = useMemo(() =>
    createGlassTex(MIN_COLS, screenRows, 99, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, txRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const screenSide = useMemo(() =>
    createGlassTex(8, screenRows, 77, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Base glass — no text
  const baseFront = useMemo(() => createGlassTex(9, 14, 55, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);
  const baseSide = useMemo(() => createGlassTex(7, 14, 66, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);

  // Crown glass
  const crownFront = useMemo(() => createGlassTex(10, 3, 88, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);
  const crownSide = useMemo(() => createGlassTex(5, 3, 111, themeWindowLit, windowOff, themeFace), [themeWindowLit, windowOff, themeFace]);

  const allTex = [screenFront, screenBack, screenSide, baseFront, baseSide, crownFront, crownSide];
  useEffect(() => () => { for (const t of allTex) t.dispose(); }, allTex);

  const logo3D = useMemo(() => createPlayLogo(themeAccent), [themeAccent]);
  const emC = themeWindowLit[0] ?? "#fff";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (logoRef.current) logoRef.current.rotation.y = t * 0.3;
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 1.5) * 0.8;
    }
  });

  const topY = BH + 4 + SH + CH + 50;

  return (
    <group>
      {/* ── Platform ── */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[SW + 28, 3, SD + 28]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[SW + 30, 1, SD + 30]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* ── Base (narrow structural tower) ── */}
      <BoxWithGlass w={BW} h={BH} d={BD} y={BH / 2 + 4} shellMat={shellMat} glassFront={baseFront} glassSide={baseSide} emColor={emC} accent={themeAccent} />

      {/* Base accent bands */}
      {[0.33, 0.66].map((f, i) => (
        <mesh key={`bb-${i}`} position={[0, BH * f + 4, 0]}>
          <boxGeometry args={[BW + 2, 1.5, BD + 2]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>
      ))}

      {/* Base top trim */}
      <mesh position={[0, BH + 4, 0]}>
        <boxGeometry args={[BW + 4, 1.2, BD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* ── Screen section (wider, the "display") with VIRAL DAY ── */}
      <BoxWithGlass w={SW} h={SH} d={SD} y={S_Y} shellMat={shellMat} glassFront={screenFront} glassSide={screenSide} emColor={emC} accent={themeAccent} />

      {/* Override back face with text version */}
      <GlassFacade tex={screenBack} w={SW} h={SH} pos={[0, S_Y, -SD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />

      {/* Screen section accent band */}
      <mesh position={[0, S_Y - SH * 0.01, 0]}>
        <boxGeometry args={[SW + 2, 1.5, SD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* Screen top trim */}
      <mesh position={[0, BH + 4 + SH, 0]}>
        <boxGeometry args={[SW + 4, 1.2, SD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Text glow */}
      <pointLight position={[0, S_Y, SD / 2 + 22]} color={themeAccent} intensity={35} distance={90} decay={2} />
      <pointLight position={[0, S_Y, -SD / 2 - 22]} color={themeAccent} intensity={35} distance={90} decay={2} />

      {/* ── Crown ── */}
      <BoxWithGlass w={CW} h={CH} d={CD} y={BH + 4 + SH + CH / 2} shellMat={shellMat} glassFront={crownFront} glassSide={crownSide} emColor={emC} accent={themeAccent} />

      {/* Crown top trim */}
      <mesh position={[0, BH + 4 + SH + CH, 0]}>
        <boxGeometry args={[CW + 4, 1.2, CD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Rooftop pad */}
      <mesh position={[0, BH + 4 + SH + CH + 2, 0]}>
        <boxGeometry args={[CW - 4, 2, CD - 4]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, BH + 4 + SH + CH + 3.5, 0]}>
        <boxGeometry args={[CW - 2, 0.6, CD - 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Antenna ── */}
      <mesh position={[0, BH + 4 + SH + CH + 25, 0]}>
        <cylinderGeometry args={[0.4, 1.2, 40, 4]} />
        <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
      </mesh>
      <mesh position={[0, BH + 4 + SH + CH + 46, 0]}>
        <sphereGeometry args={[1.5, 6, 6]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2} toneMapped={false} />
      </mesh>

      {/* ── Play button logo ── */}
      <group ref={logoRef} position={[0, topY, 0]}>
        <primitive object={logo3D} />
        <pointLight color={themeAccent} intensity={40} distance={100} decay={2} />
      </group>

      {/* ── Beacon ── */}
      <mesh ref={beaconRef} position={[0, topY + 22, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, topY + 22, 0]} color={themeAccent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow ── */}
      <pointLight position={[0, 12, BD / 2 + 10]} color={themeAccent} intensity={15} distance={40} decay={2} />
    </group>
  );
}
