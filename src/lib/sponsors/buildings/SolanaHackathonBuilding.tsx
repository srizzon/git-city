"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";

// ─── Building dimensions ────────────────────────────────
const BW = 110, BD = 60, BH = 130;   // Base
const MW = 90,  MD = 50, MH = 120;   // Mid (text)
const TW = 60,  TD = 40, TH = 100;   // Top (narrower, taller feel)

// ─── Pixel font ─────────────────────────────────────────
const PF: Record<string, number[][]> = {
  H: [[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  A: [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  C: [[0,1,1],[1,0,0],[1,0,0],[1,0,0],[0,1,1]],
  K: [[1,0,1],[1,1,0],[1,0,0],[1,1,0],[1,0,1]],
  2: [[1,1,0],[0,0,1],[0,1,0],[1,0,0],[1,1,1]],
  0: [[0,1,0],[1,0,1],[1,0,1],[1,0,1],[0,1,0]],
  6: [[0,1,1],[1,0,0],[1,1,0],[1,0,1],[0,1,0]],
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

const TEXT_BM_TOP = makeBitmap("HACK");
const TEXT_BM_BOT = makeBitmap("2026");
const TXT_W_TOP = TEXT_BM_TOP[0].length;
const TXT_W_BOT = TEXT_BM_BOT[0].length;
const MIN_COLS = Math.max(TXT_W_TOP, TXT_W_BOT) + 4;

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
          // Mix Solana gradient colors into lit windows
          const solanaColors = ["#9945FF", "#14F195", ...litColors];
          ctx.fillStyle = solanaColors[hash % solanaColors.length];
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

// ─── Trophy (hackathon prize symbol) ────────────────────
function createTrophy(accent: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 2.5, toneMapped: false,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.2, toneMapped: false,
    roughness: 0.3, metalness: 0.8,
  });

  // Cup body (tapered cylinder)
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 12, 6), mat);
  cup.position.y = 6;
  g.add(cup);

  // Cup rim
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 1.5, 6), mat);
  rim.position.y = 12;
  g.add(rim);

  // Handles (left + right)
  for (const xSign of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(3.5, 1, 6, 6, Math.PI), darkMat);
    handle.position.set(xSign * 9, 7, 0);
    handle.rotation.z = xSign * Math.PI / 2;
    g.add(handle);
  }

  // Stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 5, 4), darkMat);
  stem.position.y = -2;
  g.add(stem);

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 2, 6), mat);
  base.position.y = -5;
  g.add(base);

  // Star on front
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(2.5, 0), mat);
  star.position.set(0, 8, 7);
  star.scale.set(1, 1, 0.4);
  g.add(star);

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

function BoxSection({ w, h, d, y, shellMat, glassFront, glassBack, glassSide, emColor, accent }: {
  w: number; h: number; d: number; y: number;
  shellMat: THREE.Material; glassFront: THREE.Texture; glassBack?: THREE.Texture; glassSide: THREE.Texture;
  emColor: string; accent: string;
}) {
  return (
    <group>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[w, h, d]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      <GlassFacade tex={glassFront} w={w} h={h} pos={[0, y, d / 2 + 0.3]} rotY={0} emColor={emColor} />
      <GlassFacade tex={glassBack ?? glassFront} w={w} h={h} pos={[0, y, -d / 2 - 0.3]} rotY={Math.PI} emColor={emColor} />
      <GlassFacade tex={glassSide} w={d} h={h} pos={[w / 2 + 0.3, y, 0]} rotY={Math.PI / 2} emColor={emColor} />
      <GlassFacade tex={glassSide} w={d} h={h} pos={[-w / 2 - 0.3, y, 0]} rotY={-Math.PI / 2} emColor={emColor} />
      <CornerStrips w={w} d={d} h={h} yC={y} accent={accent} />
    </group>
  );
}

// ─── Component ──────────────────────────────────────────

export default function SolanaHackathonBuilding({
  themeAccent,
  themeWindowLit,
  themeFace,
}: SponsorBuildingProps) {
  const logoRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const textLightFront = useRef<THREE.PointLight>(null);
  const textLightBack = useRef<THREE.PointLight>(null);
  const greenPulse = useRef<THREE.Mesh>(null);

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

  const txColTop = Math.floor((MIN_COLS - TXT_W_TOP) / 2);
  const txColBot = Math.floor((MIN_COLS - TXT_W_BOT) / 2);

  const B_Y = BH / 2 + 4;
  const M_Y = BH + 4 + MH / 2;
  const T_Y = BH + MH + 4 + TH / 2;

  // Mid section: "2026" text
  const mRows = 10;
  const mTxRow = Math.floor((mRows - TEXT_BM_BOT.length) / 2);
  const mFront = useMemo(() =>
    createGlassTex(MIN_COLS, mRows, 77, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM_BOT, txColBot, mTxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const mFrontB = useMemo(() =>
    createGlassTex(MIN_COLS, mRows, 133, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM_BOT, txColBot, mTxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const mSide = useMemo(() =>
    createGlassTex(5, mRows, 91, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Base section: plain windows
  const bFront = useMemo(() =>
    createGlassTex(MIN_COLS, 9, 55, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const bSide = useMemo(() =>
    createGlassTex(5, 9, 66, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Top section: "HACK" text
  const tRows = 9;
  const tTxRow = Math.floor((tRows - TEXT_BM_TOP.length) / 2);
  const tFront = useMemo(() =>
    createGlassTex(MIN_COLS, tRows, 88, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM_TOP, txColTop, tTxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const tFrontB = useMemo(() =>
    createGlassTex(MIN_COLS, tRows, 111, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM_TOP, txColTop, tTxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const tSide = useMemo(() =>
    createGlassTex(4, tRows, 99, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  const allTex = [mFront, mFrontB, mSide, bFront, bSide, tFront, tFrontB, tSide];
  useEffect(() => () => { for (const t of allTex) t.dispose(); }, allTex);

  const trophy3D = useMemo(() => createTrophy(themeAccent), [themeAccent]);

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
    if (logoRef.current) {
      logoRef.current.rotation.y = t * 0.4;
      logoRef.current.position.y = Math.sin(t * 0.6) * 3;
    }
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 1.5) * 0.8;
    }
    if (greenPulse.current) {
      const pulse = 0.6 + Math.sin(t * 2) * 0.4;
      (greenPulse.current.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
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
      {/* Gradient platform stripe: purple → green */}
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

      {/* Purple accent band */}
      <mesh position={[0, BH + 4, 0]}>
        <boxGeometry args={[BW + 2, 1.5, BD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Mid section: Text "SOLANA" ── */}
      <BoxSection
        w={MW} h={MH} d={MD} y={M_Y}
        shellMat={shellMat} glassFront={mFront} glassBack={mFrontB} glassSide={mSide}
        emColor={emC} accent={themeAccent}
      />

      <pointLight ref={textLightFront} position={[0, M_Y, MD / 2 + 20]} color={themeAccent} intensity={30} distance={80} decay={2} />
      <pointLight ref={textLightBack} position={[0, M_Y, -MD / 2 - 20]} color={themeAccent} intensity={30} distance={80} decay={2} />

      {/* Green accent band */}
      <mesh ref={greenPulse} position={[0, BH + MH + 4, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Top section: "HACK" ── */}
      <BoxSection
        w={TW} h={TH} d={TD} y={T_Y}
        shellMat={shellMat} glassFront={tFront} glassBack={tFrontB} glassSide={tSide}
        emColor={emC} accent={themeAccent}
      />

      {/* Top cap */}
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

      {/* ── Trophy (rotating + floating) ── */}
      <group position={[0, antennaY + 30, 0]}>
        <group ref={logoRef}>
          <primitive object={trophy3D} />
        </group>
        <pointLight color={themeAccent} intensity={40} distance={120} decay={2} />
        <pointLight color={themeAccent} intensity={25} distance={100} decay={2} position={[0, 10, 0]} />
      </group>

      {/* ── Beacon ── */}
      <mesh ref={beaconRef} position={[0, antennaY + 48, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, antennaY + 48, 0]} color={themeAccent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow ── */}
      <pointLight position={[0, 12, BD / 2 + 10]} color={themeAccent} intensity={15} distance={40} decay={2} />
    </group>
  );
}
