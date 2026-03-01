"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { isBuildingAd, type SkyAd } from "@/lib/skyAds";
import type { CityBuilding } from "@/lib/github";
import { createLedTexture, ViewabilityTracker, SCROLL_SPEED, markAdPointerConsumed, registerAdMesh, unregisterAdMesh } from "./SkyAds";

// ─── Ref helper — registers mesh for capture-phase pointer guard ─

function adMeshRef(
  el: THREE.Mesh | null,
  prev: React.MutableRefObject<THREE.Mesh | null>,
  externalRef?: (el: THREE.Mesh | null) => void,
) {
  if (prev.current && prev.current !== el) {
    unregisterAdMesh(prev.current);
  }
  prev.current = el;
  if (el) registerAdMesh(el);
  externalRef?.(el);
}

// ─── Shared click/hover handlers ───────────────────────────────

function useAdInteraction(ad: SkyAd, onAdClick?: (ad: SkyAd) => void) {
  const handleClick = (e: any) => {
    e.stopPropagation();
    markAdPointerConsumed();
    onAdClick?.(ad);
  };
  return { handleClick };
}

// ─── AdBillboard — Large mounted panel with frame ──────────────
//
// Wide rectangular panel bolted to the building face.
// Dark metal frame, 2 support struts from below, spot glow.

function AdBillboard({
  ad,
  building,
  meshRef,
  onAdClick,
}: {
  ad: SkyAd;
  building: CityBuilding;
  meshRef?: (el: THREE.Mesh | null) => void;
  onAdClick?: (ad: SkyAd) => void;
}) {
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
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    [tex]
  );

  useEffect(() => {
    return () => { tex.dispose(); ledMat.dispose(); };
  }, [tex, ledMat]);

  useFrame(({ clock }) => {
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED) % 1;
  });

  const { handleClick } = useAdInteraction(ad, onAdClick);
  const prevMesh = useRef<THREE.Mesh | null>(null);
  useEffect(() => { return () => { if (prevMesh.current) unregisterAdMesh(prevMesh.current); }; }, []);

  const { width, depth, height } = building;
  const panelW = Math.max(width * 0.9, 12);
  const panelH = Math.max(panelW * 0.3, 5);
  const frameT = 0.4;
  const y = height * 0.95;
  const zOff = depth / 2 + 0.2;

  return (
    <group position={[building.position[0], 0, building.position[2]]}>
      {/* Dark frame behind the screen */}
      <mesh position={[0, y, zOff - 0.3]} onClick={handleClick}>
        <boxGeometry args={[panelW + frameT * 2, panelH + frameT * 2, 0.3]} />
        <meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* LED screen */}
      <mesh
        ref={(el) => adMeshRef(el, prevMesh, meshRef)}
        material={ledMat}
        position={[0, y, zOff + 0.1]}
        onClick={handleClick}
      >
        <planeGeometry args={[panelW, panelH]} />
      </mesh>
      {/* Support struts from below */}
      <mesh position={[-panelW * 0.3, y - panelH / 2 - 1.5, zOff - 0.3]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.3, 3, 0.3]} />
        <meshStandardMaterial color="#333" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[panelW * 0.3, y - panelH / 2 - 1.5, zOff - 0.3]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.3, 3, 0.3]} />
        <meshStandardMaterial color="#333" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

// ─── AdRooftopSign — Tall vertical spinning sign on pole ───────
//
// Vertical orientation (taller than wide), dual-sided, spinning on a pole.
// Metal crossbar at top and bottom of the sign.

function AdRooftopSign({
  ad,
  building,
  meshRef,
  onAdClick,
}: {
  ad: SkyAd;
  building: CityBuilding;
  meshRef?: (el: THREE.Mesh | null) => void;
  onAdClick?: (ad: SkyAd) => void;
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
    return () => { tex.dispose(); ledMat.dispose(); };
  }, [tex, ledMat]);

  useFrame(({ clock }, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.4 * Math.min(delta, 0.05);
    }
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED) % 1;
  });

  const { handleClick } = useAdInteraction(ad, onAdClick);
  const prevMesh = useRef<THREE.Mesh | null>(null);
  useEffect(() => { return () => { if (prevMesh.current) unregisterAdMesh(prevMesh.current); }; }, []);

  const { width, height } = building;
  const signW = Math.max(width * 1.2, 14);
  const signH = 10;
  // Label sits at height + 20, so pole must clear it
  const poleBase = height;
  const poleH = 26;
  const poleY = poleBase + poleH / 2;
  const signY = poleBase + poleH + signH / 2;

  return (
    <group position={[building.position[0], 0, building.position[2]]}>
      {/* Main pole */}
      <mesh position={[0, poleY, 0]}>
        <cylinderGeometry args={[0.3, 0.4, poleH, 6]} />
        <meshStandardMaterial color="#666" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Spinning sign group */}
      <group ref={groupRef} position={[0, signY, 0]}>
        {/* Top crossbar */}
        <mesh position={[0, signH / 2 + 0.2, 0]}>
          <boxGeometry args={[signW + 1, 0.4, 0.6]} />
          <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Bottom crossbar */}
        <mesh position={[0, -signH / 2 - 0.2, 0]}>
          <boxGeometry args={[signW + 1, 0.4, 0.6]} />
          <meshStandardMaterial color="#555" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Front face */}
        <mesh
          ref={(el) => adMeshRef(el, prevMesh, meshRef)}
          material={ledMat}
          position={[0, 0, 0.15]}
          onClick={handleClick}
        >
          <planeGeometry args={[signW, signH]} />
        </mesh>
        {/* Back face */}
        <mesh
          material={ledMat}
          position={[0, 0, -0.15]}
          rotation={[0, Math.PI, 0]}
          onClick={handleClick}
        >
          <planeGeometry args={[signW, signH]} />
        </mesh>
      </group>
    </group>
  );
}

// ─── AdLedWrap — Thin glowing band wrapping all 4 faces ────────
//
// Thin horizontal strip (2 units tall) that hugs the building on all sides.
// Strong pulse, fast scroll, accent lines above and below.

function AdLedWrap({
  ad,
  building,
  meshRef,
  onAdClick,
}: {
  ad: SkyAd;
  building: CityBuilding;
  meshRef?: (el: THREE.Mesh | null) => void;
  onAdClick?: (ad: SkyAd) => void;
}) {
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

  const accentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ad.color,
        emissive: ad.color,
        emissiveIntensity: 2,
        toneMapped: false,
      }),
    [ad.color]
  );

  useEffect(() => {
    return () => { tex.dispose(); ledMat.dispose(); accentMat.dispose(); };
  }, [tex, ledMat, accentMat]);

  useFrame(({ clock }) => {
    if (needsScroll) tex.offset.x = (clock.elapsedTime * SCROLL_SPEED * 0.8) % 1;
  });

  const { handleClick } = useAdInteraction(ad, onAdClick);
  const faceMeshes = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);
  useEffect(() => { return () => { for (const m of faceMeshes.current) { if (m) unregisterAdMesh(m); } }; }, []);

  const { width, depth, height } = building;
  const wrapH = 3; // thin band
  const accentH = 0.3; // accent line height
  const y = height * 0.88;
  const gap = 0.15; // offset from building face

  const faces = useMemo(
    () => [
      { pos: [0, y, depth / 2 + gap] as const, rot: [0, 0, 0] as const, w: width + gap * 2 },
      { pos: [0, y, -depth / 2 - gap] as const, rot: [0, Math.PI, 0] as const, w: width + gap * 2 },
      { pos: [width / 2 + gap, y, 0] as const, rot: [0, Math.PI / 2, 0] as const, w: depth + gap * 2 },
      { pos: [-width / 2 - gap, y, 0] as const, rot: [0, -Math.PI / 2, 0] as const, w: depth + gap * 2 },
    ],
    [width, depth, y, gap]
  );

  // Invisible viewability proxy at building center — covers all 4 directions
  const proxyRef = useRef<THREE.Mesh | null>(null);
  useEffect(() => { return () => { if (proxyRef.current) unregisterAdMesh(proxyRef.current); }; }, []);

  return (
    <group position={[building.position[0], 0, building.position[2]]}>
      {/* Invisible proxy mesh for viewability tracking (covers all faces) */}
      <mesh
        ref={(el) => {
          const prev = proxyRef.current;
          if (prev && prev !== el) unregisterAdMesh(prev);
          proxyRef.current = el;
          if (el) registerAdMesh(el);
          meshRef?.(el);
        }}
        position={[0, y, 0]}
        visible={false}
      >
        <boxGeometry args={[width, wrapH, depth]} />
        <meshBasicMaterial />
      </mesh>
      {faces.map((f, i) => (
        <group key={i}>
          {/* LED text band */}
          <mesh
            ref={(el) => {
              const prev = faceMeshes.current[i];
              if (prev && prev !== el) unregisterAdMesh(prev);
              faceMeshes.current[i] = el;
              if (el) registerAdMesh(el);
            }}
            material={ledMat}
            position={[f.pos[0], f.pos[1], f.pos[2]]}
            rotation={[f.rot[0], f.rot[1], f.rot[2]]}
            onClick={handleClick}
          >
            <planeGeometry args={[f.w, wrapH]} />
          </mesh>
          {/* Accent line above */}
          <mesh
            material={accentMat}
            position={[f.pos[0], f.pos[1] + wrapH / 2 + accentH / 2, f.pos[2]]}
            rotation={[f.rot[0], f.rot[1], f.rot[2]]}
          >
            <planeGeometry args={[f.w, accentH]} />
          </mesh>
          {/* Accent line below */}
          <mesh
            material={accentMat}
            position={[f.pos[0], f.pos[1] - wrapH / 2 - accentH / 2, f.pos[2]]}
            rotation={[f.rot[0], f.rot[1], f.rot[2]]}
          >
            <planeGeometry args={[f.w, accentH]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── BuildingAds — Main wrapper ────────────────────────────────

interface BuildingAdsProps {
  ads: SkyAd[];
  buildings: CityBuilding[];
  onAdClick?: (ad: SkyAd) => void;
  onAdViewed?: (adId: string) => void;
  focusedBuilding?: string | null;
  focusedBuildingB?: string | null;
}

export default function BuildingAds({ ads, buildings, onAdClick, onAdViewed, focusedBuilding, focusedBuildingB }: BuildingAdsProps) {
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  const top10 = useMemo(
    () =>
      [...buildings]
        .sort((a, b) => b.height - a.height)
        .slice(0, 10),
    [buildings]
  );

  const { billboardAds, rooftopSignAds, ledWrapAds } = useMemo(() => {
    const buildingAds = ads.filter((a) => isBuildingAd(a.vehicle));
    return {
      billboardAds: buildingAds.filter((a) => a.vehicle === "billboard"),
      rooftopSignAds: buildingAds.filter((a) => a.vehicle === "rooftop_sign"),
      ledWrapAds: buildingAds.filter((a) => a.vehicle === "led_wrap"),
    };
  }, [ads]);

  if (billboardAds.length === 0 && rooftopSignAds.length === 0 && ledWrapAds.length === 0) {
    return null;
  }

  const focusedLower = focusedBuilding?.toLowerCase() ?? null;
  const focusedBLower = focusedBuildingB?.toLowerCase() ?? null;

  return (
    <group>
      {billboardAds.map((ad, i) => {
        const building = top10[i];
        if (!building) return null;
        const loginLower = building.login.toLowerCase();
        const isDimmed = !!focusedLower && loginLower !== focusedLower && loginLower !== focusedBLower;
        return (
          <group key={ad.id} visible={!isDimmed}>
            <AdBillboard
              ad={ad}
              building={building}
              onAdClick={onAdClick}
              meshRef={(el) => {
                if (el) meshRefs.current.set(ad.id, el);
                else meshRefs.current.delete(ad.id);
              }}
            />
          </group>
        );
      })}
      {rooftopSignAds.map((ad, i) => {
        const building = top10[i];
        if (!building) return null;
        const loginLower = building.login.toLowerCase();
        const isDimmed = !!focusedLower && loginLower !== focusedLower && loginLower !== focusedBLower;
        return (
          <group key={ad.id} visible={!isDimmed}>
            <AdRooftopSign
              ad={ad}
              building={building}
              onAdClick={onAdClick}
              meshRef={(el) => {
                if (el) meshRefs.current.set(ad.id, el);
                else meshRefs.current.delete(ad.id);
              }}
            />
          </group>
        );
      })}
      {ledWrapAds.map((ad, i) => {
        const building = top10[i];
        if (!building) return null;
        const loginLower = building.login.toLowerCase();
        const isDimmed = !!focusedLower && loginLower !== focusedLower && loginLower !== focusedBLower;
        return (
          <group key={ad.id} visible={!isDimmed}>
            <AdLedWrap
              ad={ad}
              building={building}
              onAdClick={onAdClick}
              meshRef={(el) => {
                if (el) meshRefs.current.set(ad.id, el);
                else meshRefs.current.delete(ad.id);
              }}
            />
          </group>
        );
      })}
      <ViewabilityTracker meshRefs={meshRefs} onAdViewed={onAdViewed} />
    </group>
  );
}
