"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";

// ─── Building dimensions: L-shaped HQ ───────────────────
// Main slab (wide, shorter)
const MW = 130, MD = 60, MH = 300;
// Side tower (narrow, taller)
const TW = 50, TD = 55, TH = 440;
const T_OFF = MW / 2 + TW / 2 - 10; // overlap slightly
// Skybridge
const BRIDGE_Y = 180, BRIDGE_H = 18;

// ─── Pixel font ─────────────────────────────────────────
const PF: Record<string, number[][]> = {
  A: [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  B: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  C: [[0,1,1],[1,0,0],[1,0,0],[1,0,0],[0,1,1]],
  T: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
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

const TEXT_BM = makeBitmap("ABACATE");
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

// ─── AbacatePay SVG logo path data ──────────────────────
const ABACATE_SVG_PATHS = [
  "M1529.59 1226.27C1538.38 1126.66 1511.47 1030.21 1585.05 959.587L1630.63 915.849C1692.87 855.974 1727.82 774.854 1727.82 690.281C1727.82 605.707 1692.87 524.588 1630.63 464.715L1528.49 366.689L1454.9 437.31C1373.09 439.418 1291.82 470.512 1229.22 530.593L1217.68 541.133C1144.23 611.633 1047.17 654.94 943.674 663.402C806.388 674.469 677.895 731.913 580.151 825.728C502.721 899.921 449.057 993.852 425.506 1096.41C401.956 1198.96 409.506 1305.84 447.262 1404.4L409.922 1440.23L549.949 1574.63C603.189 1625.76 666.407 1666.33 735.991 1694.01C805.57 1721.68 880.154 1735.93 955.477 1735.93C1030.8 1735.93 1105.38 1721.68 1174.96 1694.01C1244.55 1666.33 1307.77 1625.76 1361.01 1574.63C1458.2 1481.34 1518.05 1358.02 1529.59 1226.27Z",
  "M1293.52 344.455C1352.24 344.499 1409.63 361.955 1458.44 394.618C1507.25 427.283 1545.29 473.689 1567.77 527.978C1590.24 582.266 1596.13 642.001 1584.7 699.641C1573.26 757.28 1545.02 810.233 1503.53 851.814L1493.15 862.213C1427.44 927.909 1387.14 1014.78 1379.39 1107.41C1368.94 1230.2 1315.48 1345.34 1228.44 1432.51C1180.89 1480.27 1124.38 1518.15 1062.15 1543.98C999.921 1569.8 933.213 1583.08 865.846 1583.03C734.587 1583.03 603.33 1532.68 503.247 1432.51C455.652 1384.9 417.896 1328.38 392.137 1266.17C366.377 1203.95 353.119 1137.26 353.119 1069.92C353.119 1002.57 366.377 935.893 392.137 873.676C417.896 811.459 455.652 754.931 503.247 707.323C590.299 620.145 705.388 566.627 828.105 556.266C920.534 548.604 1007.49 508.102 1073.12 442.424L1083.51 432.025C1110.96 404.209 1143.66 382.14 1179.72 367.105C1215.77 352.07 1254.46 344.371 1293.52 344.455ZM1293.52 264C1192.89 264 1097.73 303.407 1026.63 374.557L1016.79 384.957C964.835 436.952 895.375 469.243 821.545 475.81C679.897 487.852 546.999 549.698 446.916 649.858C391.686 704.889 347.885 770.307 318.036 842.356C288.187 914.405 272.882 991.654 273.001 1069.65C273.001 1228.37 334.801 1377.23 446.916 1489.43C559.031 1601.64 707.789 1663.48 866.389 1663.48C1024.99 1663.48 1173.75 1601.64 1285.87 1489.43C1385.95 1389.28 1448.29 1255.74 1460.33 1114.52C1466.44 1040.67 1498.62 971.404 1551.12 919.134L1561.51 908.734C1596.62 873.712 1624.46 832.083 1643.41 786.239C1662.37 740.4 1672.08 691.258 1671.98 641.645C1671.98 540.941 1632.6 445.709 1561.51 374.557C1490.34 303.626 1393.96 263.862 1293.52 264Z",
  "M1493.71 862.218L1504.09 851.818C1531.68 824.224 1553.56 791.455 1568.49 755.394C1583.42 719.333 1591.1 680.682 1591.1 641.65C1591.1 602.617 1583.42 563.968 1568.49 527.907C1553.56 491.845 1531.68 459.081 1504.09 431.483C1476.52 403.879 1443.78 381.983 1407.74 367.044C1371.71 352.104 1333.09 344.415 1294.08 344.415C1255.08 344.415 1216.46 352.104 1180.42 367.044C1144.39 381.983 1111.65 403.879 1084.07 431.483L1073.69 441.882C1008.03 507.633 921.223 547.968 828.674 555.723C705.951 566.085 590.862 619.6 503.81 706.784C456.215 754.392 418.459 810.92 392.7 873.131C366.94 935.348 353.682 1002.03 353.682 1069.38C353.682 1136.72 366.94 1203.41 392.7 1265.62C418.459 1327.84 456.215 1384.37 503.81 1431.97C551.383 1479.61 607.868 1517.39 670.036 1543.16C732.205 1568.95 798.838 1582.21 866.132 1582.21C933.426 1582.21 1000.06 1568.95 1062.23 1543.16C1124.4 1517.39 1180.88 1479.61 1228.45 1431.97C1315.57 1344.86 1369.05 1229.68 1379.4 1106.87C1387.6 1014.92 1428.08 927.896 1493.71 862.218Z",
  "M890.445 1286.93C953.689 1286.93 1014.34 1261.79 1059.06 1217.04C1103.77 1172.29 1128.9 1111.59 1128.9 1048.31C1128.9 985.013 1103.77 924.318 1059.06 879.566C1014.34 834.815 953.689 809.673 890.445 809.673C827.206 809.673 766.555 834.815 721.837 879.566C677.118 924.318 651.996 985.013 651.996 1048.31C651.996 1111.59 677.118 1172.29 721.837 1217.04C766.555 1261.79 827.206 1286.93 890.445 1286.93Z",
];
const ABACATE_SVG_FILLS = ["#114123", "#337D63", "#99FF78", "#114123"];

function createLogoTexture(accent: string, pixelSize: number): THREE.CanvasTexture {
  // Render SVG at high-res first, then downscale to pixelSize for pixel-art look
  const hiRes = 512;
  const hiCanvas = document.createElement("canvas");
  hiCanvas.width = hiRes; hiCanvas.height = hiRes;
  const hiCtx = hiCanvas.getContext("2d")!;

  hiCtx.clearRect(0, 0, hiRes, hiRes);

  const scale = hiRes / 2000;
  hiCtx.save();
  hiCtx.scale(scale, scale);

  // Monochrome using accent color — all layers same hue, different brightness
  // Layers: 0=dark bg, 1=mid outline, 2=bright fill, 3=seed (dark circle)
  for (let i = 0; i < ABACATE_SVG_PATHS.length; i++) {
    if (i === 3) {
      // Seed: draw dark so it contrasts against bright fill
      hiCtx.fillStyle = "#000";
      hiCtx.globalAlpha = 0.7;
    } else {
      hiCtx.fillStyle = accent;
      hiCtx.globalAlpha = [0.35, 0.65, 1.0][i];
    }
    const p = new Path2D(ABACATE_SVG_PATHS[i]);
    hiCtx.fill(p);
  }
  hiCtx.restore();

  // Downscale to tiny pixel grid for blocky pixel-art effect
  const canvas = document.createElement("canvas");
  canvas.width = pixelSize; canvas.height = pixelSize;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hiCanvas, 0, 0, pixelSize, pixelSize);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Rotating 3D logo for antenna top ───────────────────
function createAvocadoLogo(accent: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 2.5, toneMapped: false,
  });

  const ovalPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ovalPts.push(new THREE.Vector3(Math.cos(a) * 16, 0, Math.sin(a) * 12));
  }
  const ovalPath = new THREE.CatmullRomCurve3(ovalPts, true, "catmullrom", 0.01);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(ovalPath, 64, 2.2, 8, true), mat));

  g.add(new THREE.Mesh(new THREE.SphereGeometry(5, 12, 12), mat));

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

export default function AbacatePayBuilding({
  themeAccent,
  themeWindowLit,
  themeFace,
}: SponsorBuildingProps) {
  const logoRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const logoLightFront = useRef<THREE.PointLight>(null);
  const logoLightBack = useRef<THREE.PointLight>(null);

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

  // Section heights: S1 (logo/top) + S2 (text/mid) + S3 (base)
  const S1H = 90, S2H = 100, S3H = 110;
  const S3_Y = S3H / 2 + 4;                    // base
  const S2_Y = S3H + 4 + S2H / 2;              // text section
  const S1_Y = S3H + S2H + 4 + S1H / 2;        // logo section

  // S2 textures — text centered vertically (row 3 of 8 rows)
  const s2Rows = 8;
  const s2TxRow = Math.floor((s2Rows - TEXT_BM.length) / 2);
  const s2Front = useMemo(() =>
    createGlassTex(MIN_COLS, s2Rows, 51, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, s2TxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const s2FrontB = useMemo(() =>
    createGlassTex(MIN_COLS, s2Rows, 107, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, s2TxRow),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const s2Side = useMemo(() =>
    createGlassTex(5, s2Rows, 88, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // S1 textures — plain windows (logo is a separate plane)
  const s1Front = useMemo(() =>
    createGlassTex(MIN_COLS, 6, 60, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const s1Side = useMemo(() =>
    createGlassTex(5, 6, 71, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // S3 textures — plain base windows
  const s3Front = useMemo(() =>
    createGlassTex(MIN_COLS, 8, 82, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const s3Side = useMemo(() =>
    createGlassTex(5, 8, 93, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Side tower textures — no text
  const towerFront = useMemo(() =>
    createGlassTex(8, 28, 63, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const towerSide = useMemo(() =>
    createGlassTex(8, 28, 94, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Crown textures for tower top
  const crownF = useMemo(() =>
    createGlassTex(5, 3, 120, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const crownS = useMemo(() =>
    createGlassTex(4, 3, 131, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  const logoTex = useMemo(() => createLogoTexture(themeAccent, 64), [themeAccent]);

  const allTex = [s1Front, s1Side, s2Front, s2FrontB, s2Side, s3Front, s3Side, towerFront, towerSide, crownF, crownS, logoTex];
  useEffect(() => () => { for (const t of allTex) t.dispose(); }, allTex);

  const logo3D = useMemo(() => createAvocadoLogo(themeAccent), [themeAccent]);

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
    if (logoRef.current) logoRef.current.rotation.y = t * 0.3;
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 1.5) * 0.8;
    }
    // Pulse logo lights like E.Arcade
    const logoI = 50 + Math.sin(t * 1.2) * 25;
    if (logoLightFront.current) logoLightFront.current.intensity = logoI;
    if (logoLightBack.current) logoLightBack.current.intensity = logoI;
  });

  const emC = themeWindowLit[0] ?? "#fff";
  const crownW = TW - 10, crownD = TD - 10, crownH = 25;
  const crownY = TH / 2 + 4 + TH / 2 + crownH / 2;
  const towerTopY = crownY + crownH / 2;
  const topY = towerTopY + 55;

  return (
    <group>
      {/* ── Platform ── */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[MW + TW + 20, 3, MD + 20]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[MW + TW + 22, 1, MD + 22]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* ── Section 3: Base ── */}
      <BoxSection
        w={MW} h={S3H} d={MD} y={S3_Y}
        shellMat={shellMat} glassFront={s3Front} glassSide={s3Side}
        emColor={emC} accent={themeAccent}
      />

      {/* Band between S3 and S2 */}
      <mesh position={[0, S3H + 4, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Section 2: Text "ABACATE" ── */}
      <BoxSection
        w={MW} h={S2H} d={MD} y={S2_Y}
        shellMat={shellMat} glassFront={s2Front} glassSide={s2Side}
        emColor={emC} accent={themeAccent}
      />
      {/* Back face with text too */}
      <GlassFacade tex={s2FrontB} w={MW} h={S2H} pos={[0, S2_Y, -MD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />

      {/* Text glow */}
      <pointLight position={[0, S2_Y, MD / 2 + 20]} color={themeAccent} intensity={30} distance={80} decay={2} />
      <pointLight position={[0, S2_Y, -MD / 2 - 20]} color={themeAccent} intensity={30} distance={80} decay={2} />

      {/* Band between S2 and S1 */}
      <mesh position={[0, S3H + S2H + 4, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* ── Section 1: Logo ── */}
      <BoxSection
        w={MW} h={S1H} d={MD} y={S1_Y}
        shellMat={shellMat} glassFront={s1Front} glassSide={s1Side}
        emColor={emC} accent={themeAccent}
      />

      {/* AbacatePay logo on S1 facade */}
      <group>
        <mesh position={[0, S1_Y, MD / 2 + 0.5]} rotation={[0, 0, 0]}>
          <planeGeometry args={[55, 55]} />
          <meshStandardMaterial
            map={logoTex}
            emissive={themeAccent}
            emissiveMap={logoTex}
            emissiveIntensity={2.5}
            toneMapped={false}
            transparent
            depthWrite={false}
          />
        </mesh>
        <pointLight ref={logoLightFront} position={[0, S1_Y, MD / 2 + 15]} color={themeAccent} intensity={50} distance={120} decay={2} />
      </group>
      <group>
        <mesh position={[0, S1_Y, -MD / 2 - 0.5]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[55, 55]} />
          <meshStandardMaterial
            map={logoTex}
            emissive={themeAccent}
            emissiveMap={logoTex}
            emissiveIntensity={2.5}
            toneMapped={false}
            transparent
            depthWrite={false}
          />
        </mesh>
        <pointLight ref={logoLightBack} position={[0, S1_Y, -MD / 2 - 15]} color={themeAccent} intensity={50} distance={120} decay={2} />
      </group>

      {/* Top trim */}
      <mesh position={[0, MH + 4, 0]}>
        <boxGeometry args={[MW + 4, 1.2, MD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Rooftop pad */}
      <mesh position={[0, MH + 5.5, 0]}>
        <boxGeometry args={[MW - 8, 2, MD - 8]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, MH + 7, 0]}>
        <boxGeometry args={[MW - 6, 0.6, MD - 6]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>

      {/* ── Side tower (narrow, taller) ── */}
      <group position={[T_OFF, 0, 0]}>
        <BoxSection
          w={TW} h={TH} d={TD} y={TH / 2 + 4}
          shellMat={shellMat} glassFront={towerFront} glassSide={towerSide}
          emColor={emC} accent={themeAccent}
        />

        {/* Tower accent bands */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <mesh key={`tb-${i}`} position={[0, TH * f + 4, 0]}>
            <boxGeometry args={[TW + 2, 1.5, TD + 2]} />
            <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
          </mesh>
        ))}

        {/* Tower top trim */}
        <mesh position={[0, TH + 4, 0]}>
          <boxGeometry args={[TW + 4, 1.2, TD + 4]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
        </mesh>

        {/* Tower crown */}
        <mesh position={[0, TH + 4 + crownH / 2, 0]}>
          <boxGeometry args={[crownW, crownH, crownD]} />
          <primitive object={shellMat} attach="material" />
        </mesh>
        <GlassFacade tex={crownF} w={crownW} h={crownH} pos={[0, TH + 4 + crownH / 2, crownD / 2 + 0.3]} rotY={0} emColor={emC} />
        <GlassFacade tex={crownF} w={crownW} h={crownH} pos={[0, TH + 4 + crownH / 2, -crownD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />
        <GlassFacade tex={crownS} w={crownD} h={crownH} pos={[crownW / 2 + 0.3, TH + 4 + crownH / 2, 0]} rotY={Math.PI / 2} emColor={emC} />
        <GlassFacade tex={crownS} w={crownD} h={crownH} pos={[-crownW / 2 - 0.3, TH + 4 + crownH / 2, 0]} rotY={-Math.PI / 2} emColor={emC} />
        <CornerStrips w={crownW} d={crownD} h={crownH} yC={TH + 4 + crownH / 2} accent={themeAccent} />

        {/* Crown top trim */}
        <mesh position={[0, TH + 4 + crownH, 0]}>
          <boxGeometry args={[crownW + 4, 1.2, crownD + 4]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
        </mesh>

        {/* Rooftop pad */}
        <mesh position={[0, TH + 4 + crownH + 2, 0]}>
          <boxGeometry args={[crownW + 4, 2, crownD + 4]} />
          <primitive object={shellMatLight} attach="material" />
        </mesh>
        <mesh position={[0, TH + 4 + crownH + 3.5, 0]}>
          <boxGeometry args={[crownW + 6, 0.6, crownD + 6]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>

        {/* Antenna */}
        <mesh position={[0, TH + 4 + crownH + 25, 0]}>
          <cylinderGeometry args={[0.5, 1.5, 42, 4]} />
          <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh position={[0, TH + 4 + crownH + 47, 0]}>
          <sphereGeometry args={[1.5, 6, 6]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>

      {/* ── Skybridge connecting main slab to tower ── */}
      <mesh position={[MW / 2 - 4, BRIDGE_Y, 0]}>
        <boxGeometry args={[TW + 16, BRIDGE_H, MD * 0.55]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      {/* Bridge glass (front/back) */}
      {[1, -1].map((zSign, i) => (
        <mesh key={`bg-${i}`} position={[MW / 2 - 4, BRIDGE_Y, zSign * (MD * 0.55 / 2 + 0.3)]} rotation={[0, zSign < 0 ? Math.PI : 0, 0]}>
          <planeGeometry args={[TW + 12, BRIDGE_H - 4]} />
          <meshStandardMaterial color={themeFace} emissive={themeWindowLit[0] ?? "#fff"} emissiveIntensity={0.4} toneMapped={false} transparent opacity={0.6} />
        </mesh>
      ))}
      {/* Bridge accent trim */}
      <mesh position={[MW / 2 - 4, BRIDGE_Y + BRIDGE_H / 2 + 0.5, 0]}>
        <boxGeometry args={[TW + 18, 1, MD * 0.55 + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* ── Avocado Logo (on tower top) ── */}
      <group ref={logoRef} position={[T_OFF, topY, 0]}>
        <primitive object={logo3D} />
        <pointLight color={themeAccent} intensity={40} distance={100} decay={2} />
      </group>

      {/* ── Beacon ── */}
      <mesh ref={beaconRef} position={[T_OFF, topY + 22, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[T_OFF, topY + 22, 0]} color={themeAccent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow ── */}
      <pointLight position={[0, 12, MD / 2 + 10]} color={themeAccent} intensity={15} distance={40} decay={2} />
    </group>
  );
}
