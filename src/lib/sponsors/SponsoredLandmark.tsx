"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { gridToWorldPos, type SponsorConfig } from "./registry";
import { trackLandmarkImpression } from "@/lib/himetrica";
import { trackAdEvent } from "@/lib/skyAds";
import { getLandmarkAdId, getLandmarkAdIds } from "./landmarkAdIds";

interface SponsoredLandmarkProps {
  config: SponsorConfig;
  onClick: () => void;
  themeAccent: string;
  themeWindowLit: string[];
  themeFace: string;
  dimmed?: boolean;
}

type SponsorWindowFlags = Window & {
  __sponsorClicked?: boolean;
  /** Number of landmark instances currently showing pointer cursor. */
  __sponsorCursorCount?: number;
};

export default function SponsoredLandmark({
  config,
  onClick,
  themeAccent,
  themeWindowLit,
  themeFace,
  dimmed,
}: SponsoredLandmarkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { gl, camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const position = gridToWorldPos(config.gridX, config.gridZ);

  // Prefetch landmark ad IDs on mount
  useEffect(() => { getLandmarkAdIds(); }, []);

  // ── Impression tracking (frustum visibility, throttled) ──
  const lastImpression = useRef(0);
  const frustum = useRef(new THREE.Frustum());
  const projScreenMatrix = useRef(new THREE.Matrix4());
  const boundingSphere = useRef(new THREE.Sphere(
    new THREE.Vector3(position[0], config.hitboxHeight / 2, position[2]),
    config.hitboxRadius,
  ));

  useFrame(() => {
    const now = Date.now();
    if (now - lastImpression.current < 30_000) return; // max 1 per 30s

    projScreenMatrix.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(projScreenMatrix.current);

    if (frustum.current.intersectsSphere(boundingSphere.current)) {
      lastImpression.current = now;
      trackLandmarkImpression(config.slug);
      const adId = getLandmarkAdId(config.slug);
      if (adId) trackAdEvent(adId, "impression");
    }
  });

  // ── Click + cursor (capture phase) ──
  useEffect(() => {
    const canvas = gl.domElement;
    const w = window as SponsorWindowFlags;

    const hitsLandmark = (e: PointerEvent): boolean => {
      const group = groupRef.current;
      if (!group) return false;
      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);

      const landmarkHits = raycaster.current.intersectObject(group, true);
      if (landmarkHits.length === 0) return false;

      const landmarkDistance = landmarkHits[0].distance;
      const sceneHits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of sceneHits) {
        if (hit.distance >= landmarkDistance) break;
        if ((hit.object as THREE.InstancedMesh).isInstancedMesh) return false;
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
      if (hitsLandmark(e)) {
        w.__sponsorClicked = true;
        tap = { time: performance.now(), x: e.clientX, y: e.clientY };
      }
    };

    const onUp = (e: PointerEvent) => {
      w.__sponsorClicked = false;
      if (!tap) return;
      const elapsed = performance.now() - tap.time;
      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      tap = null;
      if (elapsed > 300 || dx * dx + dy * dy > 100) return;
      onClickRef.current();
    };

    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMove = 0;
    let hovering = false;
    const onMove = isTouch
      ? null
      : (e: PointerEvent) => {
          const now = performance.now();
          if (now - lastMove < 66) return;
          lastMove = now;
          const hits = hitsLandmark(e);
          if (hits && !hovering) {
            hovering = true;
            w.__sponsorCursorCount = (w.__sponsorCursorCount ?? 0) + 1;
            document.body.style.cursor = "pointer";
          } else if (!hits && hovering) {
            hovering = false;
            w.__sponsorCursorCount = Math.max(0, (w.__sponsorCursorCount ?? 1) - 1);
            if (w.__sponsorCursorCount === 0) document.body.style.cursor = "";
          }
        };

    canvas.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    if (onMove) canvas.addEventListener("pointermove", onMove, true);

    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      if (onMove) canvas.removeEventListener("pointermove", onMove, true);
      w.__sponsorClicked = false;
      if (hovering) {
        hovering = false;
        w.__sponsorCursorCount = Math.max(0, (w.__sponsorCursorCount ?? 1) - 1);
        if (w.__sponsorCursorCount === 0) document.body.style.cursor = "";
      }
    };
  }, [gl, camera, scene]);

  // Dim other landmarks when one is selected
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          for (const m of mat) { m.transparent = true; m.opacity = dimmed ? 0.15 : 1; }
        } else if (mat) {
          mat.transparent = true;
          mat.opacity = dimmed ? 0.15 : 1;
        }
      }
    });
  }, [dimmed]);

  const { Building } = config;

  return (
    <group ref={groupRef} position={position} userData={{ isLandmark: true }}>
      {/* Invisible hitbox */}
      <mesh position={[0, config.hitboxHeight / 2, 0]} visible={false}>
        <cylinderGeometry args={[config.hitboxRadius, config.hitboxRadius, config.hitboxHeight, 8]} />
        <meshBasicMaterial />
      </mesh>

      <Building
        themeAccent={themeAccent}
        themeWindowLit={themeWindowLit}
        themeFace={themeFace}
      />
    </group>
  );
}
