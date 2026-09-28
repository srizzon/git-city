"use client";

import { Suspense, useCallback, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import CarModel from "@/components/league/drive/CarModel";
import { M_TO_UNIT, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { beatOf, type FilmClock } from "@trailer-kit/clock";

// Git City's end card button (the kit's EndCard `button` slot): the game's
// own car, side on, rolls in from the right along the name's baseline and
// into its last letter. Like a friend's building in the game, the letter
// doesn't break: the car bounces off it, rocks, and honks. An orthographic
// canvas over the whole card, counted in card units (100 wide).

/** Card units: 100 wide and 56.25 tall, y down from the top. */
const W = 100;
const H = 56.25;
/** The car's wheels roll on the name's baseline (% of the height). */
const BASE_Y = 53;
const CAR_LEN = 10;
/** The model is ~11 city units long; this makes it CAR_LEN card units. */
const CAR_SCALE = CAR_LEN / 11;
const _q = new THREE.Quaternion();
const _s = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);
const _y = new THREE.Vector3(0, 1, 0);

export interface CarBumpProps {
  clock: FilmClock;
  /** Seconds per beat. */
  beat: number;
  /** The beat on the timeline the car starts rolling in, and how many beats until it hits. */
  from: number;
  bump: number;
  color: string;
  /** Where its nose stops: against the last letter (% of the card's width). */
  stopX: number;
  /** The baseline its wheels roll on (% of the card's height), and its size (1 = the Git City name's). */
  baseY?: number;
  scale?: number;
}

function Car({
  clock,
  beat: secondsPerBeat,
  from,
  bump,
  color,
  stopX,
  baseY = BASE_Y,
  scale = 1,
}: CarBumpProps) {
  const car = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Object3D | null)[]>([]);
  const spin = useRef(0);
  const beat = useCallback(() => beatOf(clock) - from, [clock, from]);
  useFrame((three, dt) => {
    // The orthographic camera counts in pixels: zoom it so the card is W units wide.
    const cam = three.camera as THREE.OrthographicCamera;
    const zoom = three.size.width / W;
    if (cam.zoom !== zoom) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }
    const g = car.current;
    if (!g) return;
    const u = beat();
    g.visible = u >= 0;
    if (u < 0) return;
    const t = u * secondsPerBeat;
    const tHit = bump * secondsPerBeat;
    // In at speed, braking into the letter; a bounce back off it, then still.
    const x0 = 118;
    const stop = stopX + (CAR_LEN * scale) / 2;
    let x: number;
    let speed: number;
    if (t < tHit) {
      const k = t / tHit;
      x = x0 - (x0 - stop) * (1 - (1 - k) ** 1.6);
      speed = (1.6 * (x0 - stop) * (1 - k) ** 0.6) / tHit;
    } else {
      const k = t - tHit;
      x = stop + 1.8 * Math.sin(Math.min(k / 0.18, 1) * Math.PI * 0.5) * Math.exp(-k * 4);
      speed = 0;
    }
    // The body: nose dips on the hit, then a little hop on each honk.
    const since = t - tHit;
    const pitch = since > 0 ? -0.12 * Math.exp(-since * 7) * Math.cos(since * 30) : 0;
    const honk =
      since > 0.16 && since < 0.4 ? Math.abs(Math.sin((since - 0.16) * Math.PI * 8)) * 0.35 : 0;
    g.position.set(x - W / 2, -(baseY / 100) * H + H / 2 + honk * scale, 0);
    g.rotation.set(0, -Math.PI / 2 + 0.28, pitch);
    spin.current += (speed * dt) / (WHEEL.radius * M_TO_UNIT * CAR_SCALE * scale);
    WHEELS.forEach((w, i) => {
      const o = wheels.current[i];
      if (!o) return;
      o.position.set(
        w.x * M_TO_UNIT,
        (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT,
        w.z * M_TO_UNIT,
      );
      _q.setFromAxisAngle(_y, w.x < 0 ? Math.PI : 0);
      _s.setFromAxisAngle(_x, spin.current * (w.x < 0 ? -1 : 1));
      o.quaternion.copy(_q).multiply(_s);
    });
  });
  return (
    <group ref={car} scale={CAR_SCALE * scale} visible={false}>
      <Suspense fallback={null}>
        <CarModel color={color} wheelRefs={wheels} />
      </Suspense>
    </group>
  );
}

export default function CarBump(props: CarBumpProps) {
  return (
    <Canvas
      orthographic
      camera={{ near: -200, far: 200, position: [0, 6, 50] }}
      gl={{ alpha: true }}
      dpr={2}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[20, 30, 40]} intensity={1.6} />
      <Car {...props} />
    </Canvas>
  );
}
