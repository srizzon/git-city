"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import CityScene from "@/components/CityScene";
import { townEmerald } from "@/components/league/townTheme";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { cutAt, type Reel, type ReelCut } from "@/lib/reel/film";
import { placeBalloon } from "@/components/reel/ReelOverlay";
import { ease, FOV, ITEMS_H, poseAt, WIDE_SCENES, type SceneWorld, type Target } from "./scenes";

// A reel's camera on the Brasil map (./scenes), in place of the map's
// controls, plus the example building rising on its lot when the reel has
// one. It reads the film's clock every frame, places the camera, sets the
// haze, and pins the balloon over its target's roof.

// The map's own night (BrasilScene): greens, lime windows. The example building wears it too.
const NIGHT = townEmerald().theme;

const ramp = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / Math.max(1e-6, to - from)));
/** Floor by floor, easing in and out (smootherstep), so it reads as a building going up, not a pop. */
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export interface BrasilReelRigProps {
  clock: FilmClock;
  reel: Reel;
  /** The example building (on its lot), if the world has one. */
  example: CityBuilding | null;
  /** The residents' buildings by login (lowercase). */
  byLogin: ReadonlyMap<string, CityBuilding>;
  /** Where a state's capital square is, in world units. */
  capitalOf: (uf: string) => [number, number] | null;
  balloon: RefObject<HTMLDivElement | null>;
}

export default function BrasilReelRig({ clock, reel, example, byLogin, capitalOf, balloon }: BrasilReelRigProps) {
  const { size } = useThree();
  const lone = useMemo(() => (example ? [example] : []), [example]);
  const buildTo = useRef(0);
  const slab = useRef<THREE.Mesh>(null);
  const [finished, setFinished] = useState(!example);
  const riseCut = reel.cuts.find((c) => c.kind === "lot-rise") ?? null;
  const rise = useMemo(() => {
    if (!riseCut) return { from: -1, to: 0 };
    const from = typeof riseCut.params.from === "number" ? riseCut.params.from : riseCut.from;
    const to = typeof riseCut.params.to === "number" ? riseCut.params.to : riseCut.to;
    return { from, to };
  }, [riseCut]);

  const world = useMemo<SceneWorld>(() => {
    const building = (login: string): CityBuilding | null => (example && example.loginLower === login.toLowerCase() ? example : (byLogin.get(login.toLowerCase()) ?? null));
    const targetOf = (cut: ReelCut): Target => {
      const p = cut.params;
      const b = typeof p.login === "string" ? building(p.login) : p.target === "example" || !p.uf ? example : null;
      if (b) return { x: b.position[0], z: b.position[2], height: b.height };
      if (typeof p.uf === "string") {
        const c = capitalOf(p.uf);
        if (c) return { x: c[0], z: c[1], height: 0 };
      }
      throw new Error(`Scene "${cut.name}": no target (login, uf or the example).`);
    };
    return {
      aspect: size.width / size.height,
      targetOf,
      riseAt: (t) => (riseCut ? smoother(ramp(t, rise.from, rise.to)) : 1),
      isRise: (cut) => cut === riseCut,
    };
  }, [size.width, size.height, example, byLogin, capitalOf, riseCut, rise]);

  const floors = example ? Math.max(6, example.floors || Math.round(example.height / 6)) : 1;
  const pin = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera: cam, scene }) => {
    const camera = cam as THREE.PerspectiveCamera;
    const t = Math.max(0, beatOf(clock));
    const { cut, index, u } = cutAt(reel, t);
    const pose = poseAt(reel.cuts, index, u, world);

    camera.fov = FOV;
    camera.near = 5;
    camera.far = 400000;
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // The map's haze, scaled to how far the camera is (as its own camera does).
    const h = pose.pos.distanceTo(pose.look);
    if (!scene.fog) scene.fog = new THREE.Fog(NIGHT.fogColor, 1, 2);
    const fog = scene.fog as THREE.Fog;
    fog.near = h * 1.6;
    fog.far = h * 5;

    // The example goes up floor by floor: cut at the last finished floor, a slab where the next goes up.
    const share = world.riseAt(t);
    if (example) {
      const built = (Math.floor(share * floors + 1e-6) / floors) * example.height;
      buildTo.current = built;
      if (slab.current) {
        slab.current.visible = share > 0 && share < 1;
        slab.current.position.y = built + 0.6;
      }
      if (share >= 1 !== finished) setFinished(share >= 1);
    }

    // The balloon over its target's roof (one at a time: the one whose window holds t).
    const b = reel.balloons.find((x) => t >= x.from && t < x.to + 0.4) ?? null;
    if (!b || WIDE_SCENES.has(cut.kind)) return placeBalloon(balloon.current, null);
    const target = b.target === "example" ? example : byLogin.get(b.target.login.toLowerCase());
    if (!target) return placeBalloon(balloon.current, null);
    const isExample = target === example;
    const top = isExample ? buildTo.current : target.height;
    // Once a rising building is finished its items stand on the roof: the tag rises over them.
    const clear = 8 + ITEMS_H * (isExample && riseCut ? ease(ramp(t, rise.to, rise.to + 0.35)) : 1);
    pin.set(target.position[0], top + clear, target.position[2]).project(camera);
    placeBalloon(balloon.current, {
      left: ((pin.x + 1) / 2) * 100,
      top: ((1 - pin.y) / 2) * 100,
      opacity: Math.min(1, (t - b.from) / 0.15) * Math.max(0, Math.min(1, 1 - (t - b.to) / 0.4)),
      badges: b.badges.map((x) => x.at),
      t,
    });
  });

  if (!example) return null;
  return (
    <group>
      <CityScene buildings={lone} colors={NIGHT.building} introMode filmMode={finished} buildTo={buildTo} />
      <mesh ref={slab} position={[example.position[0], 0, example.position[2]]} visible={false}>
        <boxGeometry args={[example.width + 1, 1.2, example.depth + 1]} />
        <meshBasicMaterial color={NIGHT.building.roof} />
      </mesh>
    </group>
  );
}
