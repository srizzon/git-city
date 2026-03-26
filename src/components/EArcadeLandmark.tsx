"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ─── Constants ───────────────────────────────────────────────
const ACCENT_FALLBACK = "#c8e64a";
// E.Arcade reserved at grid(1, -1)
const DEFAULT_POS: [number, number, number] = [173, 0, -149];

// Building sections (tapered skyscraper like E Corp HQ)
const SECTIONS = [
  { w: 100, d: 80, h: 200, y: 100 },
  { w: 85, d: 68, h: 180, y: 290 },
  { w: 65, d: 52, h: 160, y: 460 },
];
const TOTAL_H = 540;

// ─── Big "E" logo texture ────────────────────────────────────
function createLogoTexture(color: string): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, s, s);

  // "E" logo inspired by E Corp (tilted ~20deg, thick bars)
  ctx.fillStyle = color;
  const bw = 130, bh = 150, bar = 36;
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(-0.35); // ~20 degrees counter-clockwise
  const ox = -bw / 2, oy = -bh / 2;
  ctx.fillRect(ox, oy, bar, bh);                        // vertical bar (left)
  ctx.fillRect(ox, oy, bw, bar);                        // top bar
  ctx.fillRect(ox, oy + bh / 2 - bar / 2, bw * 0.7, bar); // middle bar
  ctx.fillRect(ox, oy + bh - bar, bw, bar);             // bottom bar
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Sign text ───────────────────────────────────────────────
function createSignTexture(accent: string): THREE.CanvasTexture {
  const cw = 256, ch = 40;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cw, ch);

  ctx.font = "bold 24px monospace";
  ctx.textBaseline = "middle";

  // "E." in accent, "ARCADE" in white
  ctx.fillStyle = accent;
  ctx.textAlign = "left";
  ctx.fillText("E.", 44, ch / 2);

  ctx.fillStyle = "#e8dcc8";
  ctx.fillText("ARCADE", 88, ch / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Glass facade texture (theme-aware) ──────────────────────
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
): THREE.CanvasTexture {
  const cellW = 10, cellH = 12;
  const cw = cols * cellW, ch = rows * cellH;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Steel frame between windows
  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, cw, ch);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hash = ((r * 11 + c * 17 + seed) * 2654435761) >>> 0;
      const x = c * cellW + 1;
      const y = r * cellH + 1;
      const ww = cellW - 2;
      const hh = cellH - 2;

      const lit = (hash % 100) < 40;
      if (lit) {
        ctx.fillStyle = litColors[hash % litColors.length];
        ctx.globalAlpha = 0.4 + (hash % 30) / 100;
      } else {
        ctx.fillStyle = offColor;
        ctx.globalAlpha = 0.8;
      }
      ctx.fillRect(x, y, ww, hh);
      ctx.globalAlpha = 1;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Component ───────────────────────────────────────────────

interface EArcadeLandmarkProps {
  onClick: () => void;
  position?: [number, number, number];
  themeAccent?: string;
  themeWindowLit?: string[];
  themeFace?: string;
}

type ArcadeWindowFlags = Window & {
  __arcadeClicked?: boolean;
  __arcadeCursor?: boolean;
};

export default function EArcadeLandmark({
  onClick,
  position = DEFAULT_POS,
  themeAccent = ACCENT_FALLBACK,
  themeWindowLit = ["#a0c0f0", "#80a0e0", "#6080c8"],
  themeFace = "#101828",
}: EArcadeLandmarkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const signGlowRef = useRef<THREE.PointLight>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const { gl, camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // Textures (recreated on theme change)
  const logoTex = useMemo(() => createLogoTexture(themeAccent), [themeAccent]);
  const signTex = useMemo(() => createSignTexture(themeAccent), [themeAccent]);
  const windowOff = useMemo(() => {
    // Darken face color for unlit windows
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(0.6);
    return "#" + c.getHexString();
  }, [themeFace]);
  const glassFront = useMemo(
    () => createGlassTex(10, 45, 42, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const glassSide = useMemo(
    () => createGlassTex(8, 45, 77, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      logoTex.dispose();
      signTex.dispose();
      glassFront.dispose();
      glassSide.dispose();
    };
  }, [logoTex, signTex, glassFront, glassSide]);

  // Slightly lighter face for the building shell
  const shellColor = useMemo(() => {
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(1.8);
    return "#" + c.getHexString();
  }, [themeFace]);

  // ── Click + cursor (capture phase, same as FounderSpire) ──
  useEffect(() => {
    const canvas = gl.domElement;
    const w = window as ArcadeWindowFlags;

    const hitsArcade = (e: PointerEvent): boolean => {
      const group = groupRef.current;
      if (!group) return false;
      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);

      const arcadeHits = raycaster.current.intersectObject(group, true);
      if (arcadeHits.length === 0) return false;

      // Check if a building or another landmark is closer
      const arcadeDistance = arcadeHits[0].distance;
      const sceneHits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of sceneHits) {
        if (hit.distance >= arcadeDistance) break;
        if ((hit.object as any).isInstancedMesh) return false;
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj === group) break;
          if (obj.userData?.isLandmark) return false;
          obj = obj.parent;
        }
      }
      return true;
    };

    let tap: { time: number; x: number; y: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (hitsArcade(e)) {
        w.__arcadeClicked = true;
        tap = { time: performance.now(), x: e.clientX, y: e.clientY };
      }
    };

    const onUp = (e: PointerEvent) => {
      w.__arcadeClicked = false;
      if (!tap) return;
      const elapsed = performance.now() - tap.time;
      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      tap = null;
      if (elapsed > 400 || dx * dx + dy * dy > 625) return;
      onClickRef.current();
    };

    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMove = 0;
    const onMove = isTouch
      ? null
      : (e: PointerEvent) => {
          const now = performance.now();
          if (now - lastMove < 66) return;
          lastMove = now;
          if (hitsArcade(e)) {
            document.body.style.cursor = "pointer";
            w.__arcadeCursor = true;
          } else if (w.__arcadeCursor) {
            w.__arcadeCursor = false;
          }
        };

    canvas.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    if (onMove) canvas.addEventListener("pointermove", onMove, true);

    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      if (onMove) canvas.removeEventListener("pointermove", onMove, true);
      w.__arcadeClicked = false;
      w.__arcadeCursor = false;
    };
  }, [gl, camera]);

  // ── Animation ──
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (signGlowRef.current) {
      signGlowRef.current.intensity = 50 + Math.sin(t * 1.2) * 25;
    }

    if (beaconRef.current) {
      const s = 1 + Math.sin(t * 2) * 0.2;
      beaconRef.current.scale.setScalar(s);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 2) * 1;
    }
  });

  const base = SECTIONS[0];

  return (
    <group ref={groupRef} position={position} userData={{ isLandmark: true }}>
      {/* Invisible hitbox */}
      <mesh position={[0, TOTAL_H / 2, 0]} visible={false}>
        <boxGeometry args={[base.w + 30, TOTAL_H + 100, base.d + 30]} />
        <meshBasicMaterial />
      </mesh>

      {/* ── Ground plaza ── */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[base.w + 40, 2, base.d + 40]} />
        <meshStandardMaterial color={shellColor} roughness={0.5} metalness={0.4} />
      </mesh>

      {/* ── Stepped tower sections ── */}
      {SECTIONS.map((sec, i) => {
        const hw = sec.w / 2;
        const hd = sec.d / 2;

        return (
          <group key={i}>
            {/* Section body */}
            <mesh position={[0, sec.y, 0]}>
              <boxGeometry args={[sec.w, sec.h, sec.d]} />
              <meshStandardMaterial
                color={shellColor}
                roughness={0.25}
                metalness={0.8}
              />
            </mesh>

            {/* Glass facade - front */}
            <mesh position={[0, sec.y, hd + 0.3]}>
              <planeGeometry args={[sec.w - 4, sec.h - 4]} />
              <meshStandardMaterial
                map={glassFront}
                emissive={themeWindowLit[0] ?? "#fff"}
                emissiveMap={glassFront}
                emissiveIntensity={0.7}
                toneMapped={false}
                transparent
              />
            </mesh>
            {/* Glass facade - back */}
            <mesh position={[0, sec.y, -hd - 0.3]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[sec.w - 4, sec.h - 4]} />
              <meshStandardMaterial
                map={glassFront}
                emissive={themeWindowLit[0] ?? "#fff"}
                emissiveMap={glassFront}
                emissiveIntensity={0.7}
                toneMapped={false}
                transparent
              />
            </mesh>
            {/* Glass facade - right */}
            <mesh position={[hw + 0.3, sec.y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[sec.d - 4, sec.h - 4]} />
              <meshStandardMaterial
                map={glassSide}
                emissive={themeWindowLit[0] ?? "#fff"}
                emissiveMap={glassSide}
                emissiveIntensity={0.7}
                toneMapped={false}
                transparent
              />
            </mesh>
            {/* Glass facade - left */}
            <mesh position={[-hw - 0.3, sec.y, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[sec.d - 4, sec.h - 4]} />
              <meshStandardMaterial
                map={glassSide}
                emissive={themeWindowLit[0] ?? "#fff"}
                emissiveMap={glassSide}
                emissiveIntensity={0.7}
                toneMapped={false}
                transparent
              />
            </mesh>

            {/* Ledge/setback at top of each section */}
            <mesh position={[0, sec.y + sec.h / 2 + 1, 0]}>
              <boxGeometry args={[sec.w + 3, 2, sec.d + 3]} />
              <meshStandardMaterial color={shellColor} roughness={0.3} metalness={0.7} />
            </mesh>

            {/* Accent trim at setback */}
            <mesh position={[0, sec.y + sec.h / 2 + 2.5, 0]}>
              <boxGeometry args={[sec.w + 4, 0.5, sec.d + 4]} />
              <meshStandardMaterial
                color={themeAccent}
                emissive={themeAccent}
                emissiveIntensity={1}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}

      {/* ── Giant "E" logo on upper front face ── */}
      <mesh position={[0, SECTIONS[2].y + 20, SECTIONS[2].d / 2 + 0.5]}>
        <planeGeometry args={[45, 45]} />
        <meshStandardMaterial
          map={logoTex}
          emissive="#ffffff"
          emissiveMap={logoTex}
          emissiveIntensity={2.5}
          toneMapped={false}
          transparent
          alphaTest={0.1}
        />
      </mesh>
      {/* Logo on back */}
      <mesh
        position={[0, SECTIONS[2].y + 20, -SECTIONS[2].d / 2 - 0.5]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry args={[45, 45]} />
        <meshStandardMaterial
          map={logoTex}
          emissive="#ffffff"
          emissiveMap={logoTex}
          emissiveIntensity={2.5}
          toneMapped={false}
          transparent
          alphaTest={0.1}
        />
      </mesh>

      {/* Logo glow */}
      <pointLight
        ref={signGlowRef}
        position={[0, SECTIONS[2].y + 20, SECTIONS[2].d / 2 + 20]}
        color={themeAccent}
        intensity={50}
        distance={120}
        decay={2}
      />

      {/* ── "E.ARCADE" text sign (front) ── */}
      <mesh position={[0, SECTIONS[2].y - 30, SECTIONS[2].d / 2 + 0.5]}>
        <planeGeometry args={[50, 8]} />
        <meshStandardMaterial
          map={signTex}
          emissive="#ffffff"
          emissiveMap={signTex}
          emissiveIntensity={1.5}
          toneMapped={false}
          transparent
          alphaTest={0.1}
        />
      </mesh>

      {/* ── Vertical accent strips (left & right faces only) ── */}
      {SECTIONS.map((sec, i) => (
        <group key={`strips-${i}`}>
          {/* Right face */}
          <mesh position={[sec.w / 2 + 0.4, sec.y, 0]}>
            <boxGeometry args={[0.3, sec.h, 2]} />
            <meshStandardMaterial
              color={themeAccent}
              emissive={themeAccent}
              emissiveIntensity={1.2}
              toneMapped={false}
            />
          </mesh>
          {/* Left face */}
          <mesh position={[-sec.w / 2 - 0.4, sec.y, 0]}>
            <boxGeometry args={[0.3, sec.h, 2]} />
            <meshStandardMaterial
              color={themeAccent}
              emissive={themeAccent}
              emissiveIntensity={1.2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* ── Rooftop structure ── */}
      <mesh position={[0, TOTAL_H + 4, 0]}>
        <boxGeometry args={[30, 8, 24]} />
        <meshStandardMaterial color={shellColor} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* ── Antenna ── */}
      <mesh position={[0, TOTAL_H + 35, 0]}>
        <cylinderGeometry args={[0.5, 2, 60, 6]} />
        <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
      </mesh>

      {/* ── Top beacon ── */}
      <mesh ref={beaconRef} position={[0, TOTAL_H + 68, 0]}>
        <sphereGeometry args={[4, 8, 8]} />
        <meshStandardMaterial
          color={themeAccent}
          emissive={themeAccent}
          emissiveIntensity={3}
          toneMapped={false}
          transparent
          opacity={0.9}
        />
      </mesh>
      <pointLight
        position={[0, TOTAL_H + 68, 0]}
        color={themeAccent}
        intensity={50}
        distance={180}
        decay={2}
      />

      {/* ── Entrance glow (ground level) ── */}
      <mesh position={[0, 12, base.d / 2 + 0.5]}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial
          color={themeFace}
          emissive={themeAccent}
          emissiveIntensity={0.3}
        />
      </mesh>
      <pointLight
        position={[0, 14, base.d / 2 + 12]}
        color={themeAccent}
        intensity={20}
        distance={50}
        decay={2}
      />
    </group>
  );
}
