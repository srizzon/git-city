"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { MODEL_TO_M, M_TO_UNIT, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";

// The Kenney sedan and its four wheels, painted in a driver's color. Shared by
// your car and everyone else's. The body keeps Kenney's palette texture; only
// the paint cell of that atlas is recolored, keeping its shading.

export const BODY_URL = "/models/cars/sedan.glb";
export const WHEEL_URL = "/models/cars/wheel.glb";
useGLTF.preload([BODY_URL, WHEEL_URL]);

/** Model units → city units. */
export const MODEL_SCALE = MODEL_TO_M * M_TO_UNIT;
/** Kenney wheel radius is 0.3 model units; match the physics wheel. */
export const WHEEL_SCALE = (WHEEL.radius * M_TO_UNIT) / 0.3;

/** The body paint in Kenney's 512² colormap: one 32×128 gradient cell. */
const PAINT = { x: 416, y: 128, w: 32, h: 128 };

const painted = new Map<string, THREE.Texture>();

function paintTexture(base: THREE.Texture, color: string): THREE.Texture {
  const key = `${base.uuid}:${color}`;
  const hit = painted.get(key);
  if (hit) return hit;
  const img = base.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return base;
  ctx.drawImage(img, 0, 0);
  const sx = img.width / 512;
  const x = Math.round(PAINT.x * sx);
  const y = Math.round(PAINT.y * sx);
  const w = Math.round(PAINT.w * sx);
  const h = Math.round(PAINT.h * sx);
  const data = ctx.getImageData(x, y, w, h);
  const tint = new THREE.Color(color);
  // Keep the cell's light-to-dark gradient: scale the tint by each pixel's
  // brightness relative to the brightest one.
  let top = 1;
  for (let i = 0; i < data.data.length; i += 4) top = Math.max(top, data.data[i], data.data[i + 1], data.data[i + 2]);
  for (let i = 0; i < data.data.length; i += 4) {
    const k = Math.max(data.data[i], data.data[i + 1], data.data[i + 2]) / top;
    data.data[i] = Math.round(tint.r * 255 * k);
    data.data[i + 1] = Math.round(tint.g * 255 * k);
    data.data[i + 2] = Math.round(tint.b * 255 * k);
  }
  ctx.putImageData(data, x, y);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = base.flipY;
  tex.colorSpace = base.colorSpace;
  tex.magFilter = base.magFilter;
  tex.minFilter = base.minFilter;
  tex.wrapS = base.wrapS;
  tex.wrapT = base.wrapT;
  painted.set(key, tex);
  return tex;
}

export default function CarModel({
  color,
  wheelRefs,
  children,
}: {
  color: string;
  /** Filled with the wheel groups (FL, FR, RL, RR); the caller poses them. */
  wheelRefs: React.MutableRefObject<(THREE.Object3D | null)[]>;
  children?: React.ReactNode;
}) {
  const { scene: bodyScene } = useGLTF(BODY_URL);
  const { scene: wheelScene } = useGLTF(WHEEL_URL);

  const body = useMemo(() => {
    const clone = bodyScene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (mat.map) mat.map = paintTexture(mat.map, color);
      mesh.material = mat;
    });
    return clone;
  }, [bodyScene, color]);
  useEffect(
    () => () =>
      body.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
      }),
    [body],
  );
  const wheels = useMemo(() => WHEELS.map(() => wheelScene.clone(true)), [wheelScene]);

  return (
    <>
      <primitive object={body} scale={MODEL_SCALE} />
      {wheels.map((m, i) => (
        <group
          key={i}
          ref={(el) => {
            wheelRefs.current[i] = el;
          }}
        >
          <primitive object={m} scale={WHEEL_SCALE} />
        </group>
      ))}
      {children}
    </>
  );
}
