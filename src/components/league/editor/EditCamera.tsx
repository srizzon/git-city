"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { terrainBounds, worldToLot } from "@/lib/league-city/grid";
import { isTypingTarget } from "@/lib/league-city/editor/shortcuts";

// Build-mode camera: right-drag orbits (turn and tilt), middle-drag,
// Space-drag or WASD/arrows pan, scroll zooms, Q/E turn 90° with a short
// ease. Lots are picked by intersecting the pointer ray with the ground plane;
// props are picked on screen (nearest projected prop within a few pixels),
// since what you see of a tree is its canopy, not its base. Runs under frameloop="demand", so it invalidates whenever
// the view changes and keeps invalidating while something animates.

/** The lot under the pointer, the exact ground point, Shift (no snap), and the prop under the pointer on screen. */
export type LotPoint = { x: number; z: number; wx: number; wz: number; free: boolean; propId?: string };

/** A prop the pointer can grab: id and a point in the middle of its body. */
export type Pickable = { id: string; x: number; y: number; z: number };

export type LotEvent =
  | ({ kind: "hover" } & LotPoint)
  | { kind: "leave" }
  | ({ kind: "down" } & LotPoint)
  | ({ kind: "drag" } & LotPoint)
  | ({ kind: "up" } & LotPoint)
  | ({ kind: "pick" } & LotPoint);

export interface EditCameraApi {
  /** Eases the camera to look at a lot. */
  lookAtLot(x: number, z: number): void;
}

const START_PITCH = (55 * Math.PI) / 180;
const MIN_PITCH = (22 * Math.PI) / 180;
const MAX_PITCH = (84 * Math.PI) / 180;
const PICK_PX = 22;
const START_YAW = Math.PI / 4;
const PAN_SPEED = 0.9; // of the view distance per second
const CLICK_SLOP = 4; // px before a press counts as a drag

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();
const _proj = new THREE.Vector3();

const PAN_KEYS: Record<string, [number, number]> = {
  w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
  a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};

export default function EditCamera({
  size,
  onLot,
  apiRef,
  pickables,
}: {
  size: number;
  onLot: (e: LotEvent) => void;
  apiRef?: React.MutableRefObject<EditCameraApi | null>;
  pickables?: React.MutableRefObject<Pickable[]>;
}) {
  const { camera, gl, invalidate } = useThree();
  const { cx, cz, width } = terrainBounds(size);
  const view = useRef({
    center: new THREE.Vector3(cx, 0, cz),
    goal: new THREE.Vector3(cx, 0, cz),
    yaw: START_YAW,
    yawGoal: START_YAW,
    pitch: START_PITCH,
    dist: width * 0.9 + 200,
  });
  const keys = useRef(new Set<string>());
  const onLotRef = useRef(onLot);
  useEffect(() => {
    onLotRef.current = onLot;
  }, [onLot]);

  const bounds = useRef({ cx, cz, width });
  useEffect(() => {
    bounds.current = { cx, cz, width };
    invalidate();
  }, [cx, cz, width, invalidate]);

  const clampCenter = (v: THREE.Vector3) => {
    const b = bounds.current;
    const half = b.width / 2;
    v.x = THREE.MathUtils.clamp(v.x, b.cx - half, b.cx + half);
    v.z = THREE.MathUtils.clamp(v.z, b.cz - half, b.cz + half);
  };

  const place = () => {
    const v = view.current;
    const flat = Math.cos(v.pitch) * v.dist;
    camera.position.set(v.center.x + Math.sin(v.yaw) * flat, Math.sin(v.pitch) * v.dist, v.center.z + Math.cos(v.yaw) * flat);
    camera.lookAt(v.center);
  };

  useEffect(() => {
    if (apiRef) {
      apiRef.current = {
        lookAtLot(x, z) {
          view.current.goal.set(x * 48, 0, z * 48);
          clampCenter(view.current.goal);
          invalidate();
        },
      };
    }
    return () => {
      if (apiRef) apiRef.current = null;
    };
     
  }, [apiRef, invalidate]);

  // Pointer: pan drags, zoom, and lot events.
  useEffect(() => {
    const el = gl.domElement;
    let pan: { x: number; y: number; id: number; orbit: boolean } | null = null;
    let press: { x: number; y: number; button: number; alt: boolean; moved: boolean } | null = null;
    let space = false;

    const lotAt = (e: PointerEvent | MouseEvent): LotPoint | null => {
      const r = el.getBoundingClientRect();
      _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      _ray.setFromCamera(_ndc, camera);
      if (!_ray.ray.intersectPlane(_ground, _hit)) return null;
      const [x, z] = worldToLot(_hit.x, _hit.z);
      // Nearest prop on screen, within PICK_PX.
      let propId: string | undefined;
      let best = PICK_PX * PICK_PX;
      for (const p of pickables?.current ?? []) {
        _proj.set(p.x, p.y, p.z).project(camera);
        if (_proj.z > 1) continue;
        const sx = ((_proj.x + 1) / 2) * r.width + r.left;
        const sy = ((1 - _proj.y) / 2) * r.height + r.top;
        const d = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2;
        if (d < best) {
          best = d;
          propId = p.id;
        }
      }
      return { x, z, wx: _hit.x, wz: _hit.z, free: e.shiftKey, propId };
    };
    const worldPerPixel = () => {
      const cam = camera as THREE.PerspectiveCamera;
      return (2 * view.current.dist * Math.tan(((cam.fov ?? 50) * Math.PI) / 360)) / el.clientHeight;
    };

    const onDown = (e: PointerEvent) => {
      const orbit = e.button === 2;
      const isPan = orbit || (e.button === 1 && !e.altKey) || (e.button === 0 && space);
      press = { x: e.clientX, y: e.clientY, button: e.button, alt: e.altKey, moved: false };
      if (isPan) {
        pan = { x: e.clientX, y: e.clientY, id: e.pointerId, orbit };
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        return;
      }
      if (e.button !== 0) return;
      const lot = lotAt(e);
      if (!lot) return;
      el.setPointerCapture(e.pointerId);
      if (!e.altKey) onLotRef.current({ kind: "down", ...lot });
    };

    const onMove = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) press.moved = true;
      if (pan) {
        const k = worldPerPixel();
        const dx = e.clientX - pan.x;
        const dy = e.clientY - pan.y;
        pan.x = e.clientX;
        pan.y = e.clientY;
        const v = view.current;
        if (pan.orbit) {
          v.yaw -= dx * 0.006;
          v.yawGoal = v.yaw;
          v.pitch = THREE.MathUtils.clamp(v.pitch + dy * 0.004, MIN_PITCH, MAX_PITCH);
          invalidate();
          return;
        }
        const right = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
        const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
        v.center.addScaledVector(right, -dx * k).addScaledVector(fwd, (dy * k) / Math.sin(v.pitch));
        clampCenter(v.center);
        v.goal.copy(v.center);
        invalidate();
        return;
      }
      const lot = lotAt(e);
      if (!lot) return onLotRef.current({ kind: "leave" });
      onLotRef.current({ kind: press && press.button === 0 && !press.alt ? "drag" : "hover", ...lot });
    };

    const onUp = (e: PointerEvent) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      const p = press;
      press = null;
      if (pan) {
        pan = null;
        el.style.cursor = "";
        // A middle click that didn't move picks the item under the cursor.
        if (p && p.button === 1 && !p.moved) {
          const lot = lotAt(e);
          if (lot) onLotRef.current({ kind: "pick", ...lot });
        }
        return;
      }
      if (!p || p.button !== 0) return;
      const lot = lotAt(e);
      if (!lot) return;
      onLotRef.current({ kind: p.alt ? "pick" : "up", ...lot });
    };

    const onLeave = () => {
      if (!pan && !press) onLotRef.current({ kind: "leave" });
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      const max = bounds.current.width * 1.6 + 300;
      v.dist = THREE.MathUtils.clamp(v.dist * Math.exp(e.deltaY * 0.0012), 140, max);
      invalidate();
    };
    const onContext = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        space = true;
        e.preventDefault();
        return;
      }
      if (k === "q" || k === "e") {
        view.current.yawGoal += (k === "q" ? -1 : 1) * (Math.PI / 2);
        invalidate();
        return;
      }
      if (PAN_KEYS[k]) {
        keys.current.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
        invalidate();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === " ") space = false;
      keys.current.delete(k);
    };
    const onBlur = () => {
      keys.current.clear();
      space = false;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      el.style.cursor = "";
    };
     
  }, [camera, gl, invalidate, pickables]);

  // All camera motion in one frame loop that re-invalidates while active.
  useFrame((_, delta) => {
    const v = view.current;
    let active = false;
    const dt = Math.min(delta, 0.05);

    if (keys.current.size > 0) {
      let fx = 0;
      let fz = 0;
      for (const k of keys.current) {
        const d = PAN_KEYS[k];
        if (d) {
          fx += d[0];
          fz += d[1];
        }
      }
      const right = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      const fwd = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
      const step = v.dist * PAN_SPEED * dt;
      v.goal.addScaledVector(right, fx * step).addScaledVector(fwd, fz * step);
      clampCenter(v.goal);
      v.center.copy(v.goal);
      active = true;
    }
    if (v.center.distanceToSquared(v.goal) > 0.25) {
      v.center.lerp(v.goal, 1 - Math.exp(-dt * 8));
      active = true;
    }
    if (Math.abs(v.yaw - v.yawGoal) > 0.001) {
      v.yaw += (v.yawGoal - v.yaw) * (1 - Math.exp(-dt * 10));
      active = true;
    } else v.yaw = v.yawGoal;

    place();
    if (active) invalidate();
  });

  return null;
}
