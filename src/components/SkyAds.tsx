"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { getActiveAds, type SkyAd } from "@/lib/skyAds";

// ─── Pointer guard — prevents building click when ad is tapped ─
//
// Native capture-phase listener raycasts against all registered ad meshes.
// Capture phase fires BEFORE any bubble-phase handlers (guaranteed by DOM spec),
// so the flag is always set before InstancedBuildings' pointerdown handler.

let _adPointerTs = 0;
export function markAdPointerConsumed() { _adPointerTs = performance.now(); }
export function wasAdPointerConsumed() { return performance.now() - _adPointerTs < 300; }

// Module-level registry of all clickable ad meshes (both sides of banners/screens)
const _adMeshRegistry = new Set<THREE.Mesh>();
export function registerAdMesh(mesh: THREE.Mesh) { _adMeshRegistry.add(mesh); }
export function unregisterAdMesh(mesh: THREE.Mesh) { _adMeshRegistry.delete(mesh); }

// Capture-phase pointerdown guard — raycasts against ad meshes before building handlers
function SkyAdPointerGuard() {
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());

  useEffect(() => {
    const canvas = gl.domElement;

    const handler = (e: PointerEvent) => {
      if (_adMeshRegistry.size === 0) return;

      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);

      const meshes = Array.from(_adMeshRegistry);
      for (const m of meshes) m.updateWorldMatrix(true, false);

      const hits = raycaster.current.intersectObjects(meshes, false);
      if (hits.length > 0) {
        markAdPointerConsumed();
      }
    };

    // capture: true = fires before ALL bubble-phase listeners
    canvas.addEventListener("pointerdown", handler, true);
    return () => canvas.removeEventListener("pointerdown", handler, true);
  }, [gl, camera]);

  return null;
}

// ─── LED Dot-Matrix Texture ──────────────────────────────────
//
// Low-res canvas + NearestFilter = each pixel becomes a visible "LED dot".
// Text scrolls horizontally like a marquee ticker if it exceeds visible area.

const LED_H = 48;
const LED_DOT = 4;
const LED_FONT = 32;
const LED_VISIBLE = 256;
export const SCROLL_SPEED = 0.25;

export function createLedTexture(text: string, color: string, bgColor: string) {
  const tmp = document.createElement("canvas");
  const tmpCtx = tmp.getContext("2d")!;
  tmpCtx.font = `bold ${LED_FONT}px monospace`;
  const rawTw = Math.ceil(tmpCtx.measureText(text).width);

  const needsScroll = rawTw > LED_VISIBLE - 30;

  // For continuous scrolling: tile = "TEXT ★ " so RepeatWrapping loops seamlessly
  const loopText = needsScroll ? text + "  ///  " : text;
  const tw = Math.ceil(tmpCtx.measureText(loopText).width);
  const W = needsScroll ? tw : LED_VISIBLE;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = LED_H;
  const ctx = canvas.getContext("2d")!;

  // Dark background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, LED_H);

  // Top/bottom LED border accent
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, LED_H - 2, W, 2);
  ctx.globalAlpha = 1;

  // Text — bright colored on dark bg
  ctx.fillStyle = color;
  ctx.font = `bold ${LED_FONT}px monospace`;
  ctx.textBaseline = "middle";
  if (needsScroll) {
    ctx.textAlign = "left";
    ctx.fillText(loopText, 0, LED_H / 2);
  } else {
    ctx.textAlign = "center";
    ctx.fillText(loopText, W / 2, LED_H / 2);
  }

  // LED grid overlay — dark gaps between each dot cell
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 0.45;
  for (let x = LED_DOT - 1; x < W; x += LED_DOT) ctx.fillRect(x, 0, 1, LED_H);
  for (let y = LED_DOT - 1; y < LED_H; y += LED_DOT) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  if (needsScroll) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = LED_VISIBLE / W;
  }

  return { tex, needsScroll };
}

// ─── BannerPlane — Airplane towing LED marquee banner ────────

function BannerPlane({
  ad,
  index,
  total,
  cityRadius,
  flyMode,
  onAdClick,
  meshRef,
}: {
  ad: SkyAd;
  index: number;
  total: number;
  cityRadius: number;
  flyMode: boolean;
  onAdClick?: (ad: SkyAd) => void;
  meshRef?: React.Ref<THREE.Mesh>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/paper-plane.glb");
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(ad.text, ad.color, ad.bgColor),
    [ad.text, ad.color, ad.bgColor]
  );

  // Single material — same texture for both sides (UV mapping is correct on both)
  const ledMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#000000",
        emissiveMap: tex,
        emissive: "#ffffff",
        emissiveIntensity: 1.2,
        toneMapped: false,
      }),
    [tex]
  );

  // Banner dimensions
  const BANNER_LENGTH = 45;
  const BANNER_HEIGHT = 10;
  const ROPE_GAP = 18;
  const BANNER_DROP = 5;

  // Rope (static geometry, set once)
  const ropeLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const ropeVerts = new Float32Array([0, -2, 5, 0, -BANNER_DROP, ROPE_GAP]);
    geo.setAttribute("position", new THREE.BufferAttribute(ropeVerts, 3));
    const mat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 });
    return new THREE.Line(geo, mat);
  }, []);

  useEffect(() => {
    return () => {
      tex.dispose();
      ledMat.dispose();
      ropeLine.geometry.dispose();
      (ropeLine.material as THREE.Material).dispose();
    };
  }, [tex, ledMat, ropeLine]);

  // Flight
  const rx = cityRadius * 0.55;
  const rz = cityRadius * 0.4;
  const altitude = 200 + index * 25;
  const speed = 35;
  const phaseOffset = (index * Math.PI * 2) / total;
  const angle = useRef(phaseOffset);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;

    const avgR = (rx + rz) / 2;
    angle.current += (speed / avgR) * dt;
    const a = angle.current;

    const x = rx * Math.cos(a);
    const z = rz * Math.sin(a);
    const vx = -rx * Math.sin(a);
    const vz = rz * Math.cos(a);
    const yaw = Math.atan2(-vx, -vz);
    const bank = -Math.sin(a) * 0.2;

    if (groupRef.current) {
      groupRef.current.position.set(x, altitude + Math.sin(t * 0.8 + index) * 2, z);
      groupRef.current.rotation.set(0, yaw, bank, "YXZ");
    }

    // Scroll LED text
    if (needsScroll) {
      tex.offset.x = (t * SCROLL_SPEED) % 1;
    }
  });

  // Register banner sides + hitbox for the capture-phase pointer guard
  const side1Ref = useRef<THREE.Mesh>(null);
  const side2Ref = useRef<THREE.Mesh>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const s1 = side1Ref.current;
    const s2 = side2Ref.current;
    const hb = hitboxRef.current;
    if (s1) registerAdMesh(s1);
    if (s2) registerAdMesh(s2);
    if (hb) registerAdMesh(hb);
    return () => {
      if (s1) unregisterAdMesh(s1);
      if (s2) unregisterAdMesh(s2);
      if (hb) unregisterAdMesh(hb);
    };
  }, []);

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (flyMode) return;
    onAdClick?.(ad);
  };

  const bannerY = -BANNER_DROP - BANNER_HEIGHT / 2;
  const bannerZ = ROPE_GAP + BANNER_LENGTH / 2;

  return (
    <group ref={groupRef}>
      {/* Invisible hitbox for pointer guard (click-only, no hover events) */}
      <mesh
        ref={hitboxRef}
        position={[0, bannerY / 2, (ROPE_GAP + BANNER_LENGTH) / 2]}
        onClick={handleClick}
      >
        <boxGeometry args={[12, Math.abs(bannerY) + BANNER_HEIGHT + 12, ROPE_GAP + BANNER_LENGTH + 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Paper plane — scale 3.5x (bigger than player's 3x, proportional to banner) */}
      <group scale={[3.5, 3.5, 3.5]} rotation={[0, Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
      </group>

      {/* Tow rope */}
      <primitive object={ropeLine} />

      {/* LED banner — side 1 (faces +X) */}
      <mesh
        ref={(el: THREE.Mesh | null) => {
          side1Ref.current = el;
          if (typeof meshRef === "function") meshRef(el);
          else if (meshRef && "current" in meshRef) (meshRef as React.MutableRefObject<THREE.Mesh | null>).current = el;
        }}
        material={ledMat}
        position={[0.15, bannerY, bannerZ]}
        rotation={[0, Math.PI / 2, 0]}
        onClick={handleClick}
      >
        <planeGeometry args={[BANNER_LENGTH, BANNER_HEIGHT]} />
      </mesh>

      {/* LED banner — side 2 (faces -X, same texture — UV is correct on both sides) */}
      <mesh
        ref={side2Ref}
        material={ledMat}
        position={[-0.15, bannerY, bannerZ]}
        rotation={[0, -Math.PI / 2, 0]}
        onClick={handleClick}
      >
        <planeGeometry args={[BANNER_LENGTH, BANNER_HEIGHT]} />
      </mesh>

    </group>
  );
}

// ─── Blimp — Dirigible with LED screens ──────────────────────

function Blimp({
  ad,
  index,
  total,
  cityRadius,
  flyMode,
  onAdClick,
  screenRef,
}: {
  ad: SkyAd;
  index: number;
  total: number;
  cityRadius: number;
  flyMode: boolean;
  onAdClick?: (ad: SkyAd) => void;
  screenRef?: React.Ref<THREE.Mesh>;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const { tex, needsScroll } = useMemo(
    () => createLedTexture(ad.text, ad.color, ad.bgColor),
    [ad.text, ad.color, ad.bgColor]
  );

  const ledMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#000000",
        emissiveMap: tex,
        emissive: "#ffffff",
        emissiveIntensity: 1.2,
        toneMapped: false,
      }),
    [tex]
  );

  useEffect(() => {
    return () => {
      tex.dispose();
      ledMat.dispose();
    };
  }, [tex, ledMat]);

  const r = cityRadius * 0.2;
  const altitude = 280 + index * 30;
  const speed = 6;
  const phaseOffset = (index * Math.PI) / Math.max(total, 1);
  const angle = useRef(phaseOffset);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    angle.current += (speed / r) * dt;
    const a = angle.current;

    const x = r * Math.cos(a);
    const z = r * Math.sin(a);
    const vx = -r * Math.sin(a);
    const vz = r * Math.cos(a);
    const yaw = Math.atan2(-vx, -vz);

    if (groupRef.current) {
      groupRef.current.position.set(x, altitude + Math.sin(t * 0.3) * 2, z);
      groupRef.current.rotation.set(0, yaw, 0);
    }

    // Scroll LED text
    if (needsScroll) {
      tex.offset.x = (t * SCROLL_SPEED) % 1;
    }
  });

  // Register screen sides + hitbox for the capture-phase pointer guard
  const screen1Ref = useRef<THREE.Mesh>(null);
  const screen2Ref = useRef<THREE.Mesh>(null);
  const blimpHitboxRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const s1 = screen1Ref.current;
    const s2 = screen2Ref.current;
    const hb = blimpHitboxRef.current;
    if (s1) registerAdMesh(s1);
    if (s2) registerAdMesh(s2);
    if (hb) registerAdMesh(hb);
    return () => {
      if (s1) unregisterAdMesh(s1);
      if (s2) unregisterAdMesh(s2);
      if (hb) unregisterAdMesh(hb);
    };
  }, []);

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (flyMode) return;
    onAdClick?.(ad);
  };

  return (
    <group ref={groupRef}>
      {/* Invisible hitbox for pointer guard (click-only, no hover events) */}
      <mesh
        ref={blimpHitboxRef}
        position={[0, -2, 0]}
        onClick={handleClick}
      >
        <boxGeometry args={[24, 24, 54]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Body — elongated along local Z (forward), light hull */}
      <mesh scale={[0.7, 0.5, 1.6]}>
        <sphereGeometry args={[15, 10, 8]} />
        <meshStandardMaterial
          color="#c0c8d0"
          emissive="#606870"
          emissiveIntensity={0.3}
          metalness={0.2}
          roughness={0.5}
        />
      </mesh>

      {/* Accent stripe — colored band around belly */}
      <mesh scale={[0.72, 0.14, 1.62]} position={[0, -1, 0]}>
        <sphereGeometry args={[15, 10, 6]} />
        <meshStandardMaterial
          color={ad.color}
          emissive={ad.color}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>

      {/* Accent stripe — thin upper trim */}
      <mesh scale={[0.71, 0.07, 1.61]} position={[0, 3.5, 0]}>
        <sphereGeometry args={[15, 10, 4]} />
        <meshStandardMaterial
          color={ad.color}
          emissive={ad.color}
          emissiveIntensity={0.6}
          toneMapped={false}
        />
      </mesh>

      {/* Gondola */}
      <mesh position={[0, -9, 0]}>
        <boxGeometry args={[6, 3, 10]} />
        <meshStandardMaterial color="#8890a0" emissive="#404860" emissiveIntensity={0.3} />
      </mesh>
      {/* Gondola windows */}
      <mesh position={[3.05, -8.5, 0]}>
        <boxGeometry args={[0.1, 1.2, 6]} />
        <meshStandardMaterial
          color={ad.color}
          emissive={ad.color}
          emissiveIntensity={0.6}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-3.05, -8.5, 0]}>
        <boxGeometry args={[0.1, 1.2, 6]} />
        <meshStandardMaterial
          color={ad.color}
          emissive={ad.color}
          emissiveIntensity={0.6}
          toneMapped={false}
        />
      </mesh>

      {/* Struts — gondola to body */}
      <mesh position={[2, -6.5, 3]} rotation={[0.15, 0, 0.2]}>
        <boxGeometry args={[0.3, 4, 0.3]} />
        <meshStandardMaterial color="#9098a8" emissive="#404860" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-2, -6.5, 3]} rotation={[0.15, 0, -0.2]}>
        <boxGeometry args={[0.3, 4, 0.3]} />
        <meshStandardMaterial color="#9098a8" emissive="#404860" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[2, -6.5, -3]} rotation={[-0.15, 0, 0.2]}>
        <boxGeometry args={[0.3, 4, 0.3]} />
        <meshStandardMaterial color="#9098a8" emissive="#404860" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-2, -6.5, -3]} rotation={[-0.15, 0, -0.2]}>
        <boxGeometry args={[0.3, 4, 0.3]} />
        <meshStandardMaterial color="#9098a8" emissive="#404860" emissiveIntensity={0.2} />
      </mesh>

      {/* Tail fin — vertical */}
      <mesh position={[0, 2, -22]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.4, 7, 5]} />
        <meshStandardMaterial color="#9098a8" emissive={ad.color} emissiveIntensity={0.2} />
      </mesh>
      {/* Tail fin — vertical tip accent */}
      <mesh position={[0, 5.5, -21]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.5, 1, 3]} />
        <meshStandardMaterial
          color={ad.color}
          emissive={ad.color}
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </mesh>

      {/* Tail fin — horizontal */}
      <mesh position={[0, -1, -22]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[6, 0.4, 5]} />
        <meshStandardMaterial color="#9098a8" emissive={ad.color} emissiveIntensity={0.2} />
      </mesh>

      {/* LED Screen — left side (+X) */}
      <mesh
        ref={(el: THREE.Mesh | null) => {
          screen1Ref.current = el;
          if (typeof screenRef === "function") screenRef(el);
          else if (screenRef && "current" in screenRef) (screenRef as React.MutableRefObject<THREE.Mesh | null>).current = el;
        }}
        material={ledMat}
        position={[10.8, -2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        onClick={handleClick}
      >
        <planeGeometry args={[26, 9]} />
      </mesh>

      {/* LED Screen — right side (-X) */}
      <mesh
        ref={screen2Ref}
        material={ledMat}
        position={[-10.8, -2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        onClick={handleClick}
      >
        <planeGeometry args={[26, 9]} />
      </mesh>

    </group>
  );
}

// ─── ViewabilityTracker — IAB/MRC frustum-based viewability ──
//
// Checks each ad mesh against the camera frustum every frame.
// If visible for 1 continuous second, fires onAdViewed(adId) once per session.

export function ViewabilityTracker({
  meshRefs,
  onAdViewed,
}: {
  meshRefs: React.RefObject<Map<string, THREE.Mesh>>;
  onAdViewed?: (adId: string) => void;
}) {
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const timers = useRef<Map<string, number>>(new Map());
  const fired = useRef<Set<string>>(new Set());
  const frameCount = useRef(0);

  useFrame(({ camera }, delta) => {
    if (!onAdViewed || !meshRefs.current) return;

    // Check every 10 frames (~6x/sec at 60fps) instead of every frame
    frameCount.current++;
    if (frameCount.current % 10 !== 0) return;

    const dt = Math.min(delta * 10, 0.2); // accumulate time for skipped frames

    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    for (const [adId, mesh] of meshRefs.current) {
      if (fired.current.has(adId)) continue;

      mesh.updateWorldMatrix(true, false);

      if (frustum.intersectsObject(mesh)) {
        const elapsed = (timers.current.get(adId) ?? 0) + dt;
        timers.current.set(adId, elapsed);
        if (elapsed >= 1) {
          fired.current.add(adId);
          onAdViewed(adId);
        }
      } else {
        timers.current.set(adId, 0);
      }
    }
  });

  return null;
}

// ─── SkyAds — Wrapper ────────────────────────────────────────

interface SkyAdsProps {
  ads: SkyAd[];
  cityRadius: number;
  flyMode: boolean;
  onAdClick?: (ad: SkyAd) => void;
  onAdViewed?: (adId: string) => void;
}

export default function SkyAds({ ads, cityRadius, flyMode, onAdClick, onAdViewed }: SkyAdsProps) {
  const { planeAds, blimpAds } = useMemo(() => getActiveAds(ads), [ads]);
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  if (planeAds.length === 0 && blimpAds.length === 0) return null;

  return (
    <group>
      <SkyAdPointerGuard />
      {planeAds.map((ad, i) => (
        <BannerPlane
          key={ad.id}
          ad={ad}
          index={i}
          total={planeAds.length}
          cityRadius={cityRadius}
          flyMode={flyMode}
          onAdClick={onAdClick}
          meshRef={(el: THREE.Mesh | null) => {
            if (el) meshRefs.current.set(ad.id, el);
            else meshRefs.current.delete(ad.id);
          }}
        />
      ))}
      {blimpAds.map((ad, i) => (
        <Blimp
          key={ad.id}
          ad={ad}
          index={i}
          total={blimpAds.length}
          cityRadius={cityRadius}
          flyMode={flyMode}
          onAdClick={onAdClick}
          screenRef={(el: THREE.Mesh | null) => {
            if (el) meshRefs.current.set(ad.id, el);
            else meshRefs.current.delete(ad.id);
          }}
        />
      ))}
      <ViewabilityTracker meshRefs={meshRefs} onAdViewed={onAdViewed} />
    </group>
  );
}
