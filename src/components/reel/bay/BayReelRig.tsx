"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import CityScene from "@/components/CityScene";
import type { BuildingColors } from "@/components/CityCanvas";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { cutAt, type Reel, type ReelCut } from "@/lib/reel/film";
import { placeBalloon } from "@/components/reel/ReelOverlay";
import { BAY_WIDE, bayPose, FOV, type BayWorld } from "./scenes";
import BayTakes, { isTake } from "./BayTakes";
import type { SmashStore } from "@/lib/league-city/smash";

// A reel's camera in the home city (./scenes), mounted in CityCanvas in place
// of its controls; the lot's building (left out of the city) rising on its
// lot when the reel has one; and the balloon over each take's building.

/** Ease-out-back over 0.8s: past full height, then settles (the towns' rise). */
function riseOf(t: number, from: number) {
  const x = Math.min(1, Math.max(0, (t - from) / 0.8));
  const c = 1.7;
  return x <= 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

export interface BayReelRigProps {
  clock: FilmClock;
  reel: Reel;
  buildings: CityBuilding[];
  /** The building left out of the city: its lot stands empty until it rises. */
  lot: CityBuilding | null;
  colors: BuildingColors;
  balloon: RefObject<HTMLDivElement | null>;
  /** The buildings the takes knock down (left out of the city), and their smash store. */
  store: SmashStore | null;
  targets: CityBuilding[];
}

export default function BayReelRig({ clock, reel, buildings, lot, colors, balloon, store, targets }: BayReelRigProps) {
  const riser = useRef<THREE.Group>(null);
  const lone = useMemo(() => (lot ? [lot] : []), [lot]);
  const byLogin = useMemo(() => new Map(buildings.map((b) => [b.loginLower, b])), [buildings]);
  const lotCut = reel.cuts.find((c) => c.kind === "lot") ?? null;
  const riseFrom = lotCut && typeof lotCut.params.from === "number" ? lotCut.params.from : Infinity;

  const world = useMemo<BayWorld>(() => {
    const boxes = buildings.map((b) => ({ x: b.position[0], z: b.position[2], w: b.width, d: b.depth, h: b.height }));
    const targetOf = (cut: ReelCut) => {
      const login = typeof cut.params.login === "string" ? cut.params.login.toLowerCase() : null;
      const b = login ? byLogin.get(login) : null;
      if (b) return { x: b.position[0], z: b.position[2], h: b.height };
      return lot ? { x: lot.position[0], z: lot.position[2], h: 0 } : null;
    };
    return { targetOf, near: (x, z, r) => boxes.filter((o) => Math.abs(o.x - x) < r && Math.abs(o.z - z) < r) };
  }, [buildings, byLogin, lot]);
  const pin = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera: cam, scene }) => {
    const camera = cam as THREE.PerspectiveCamera;
    const t = Math.max(0, beatOf(clock));
    const { cut, u } = cutAt(reel, t);
    // A gameplay take places its own camera (BayTakes).
    if (isTake(cut.kind)) return placeBalloon(balloon.current, -1, null);
    const rise = riseOf(t, riseFrom);
    const pose = bayPose(cut, u, world, cut.kind === "lot" && lot ? lot.height * rise + 6 : undefined);

    // The city's own fog (SunRig sets it every frame, before this runs), pushed out for the wide moves.
    const f = scene.fog as THREE.Fog | null;
    if (f && pose.fog !== 1) {
      f.near *= pose.fog;
      f.far *= pose.fog;
      camera.far = Math.max(camera.far, f.far * 1.25);
    }
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    camera.updateMatrixWorld();

    if (riser.current) {
      riser.current.visible = rise > 0;
      riser.current.scale.y = Math.max(0.001, rise);
    }

    // A balloon fades out after its end only while its take goes on: a cut to another building drops it at once.
    const bi = reel.balloons.findIndex((x) => t >= x.from && (t < x.to || (t < x.to + 0.4 && cut.from < x.to)));
    const b = reel.balloons[bi];
    if (!b || BAY_WIDE.has(cut.kind)) return placeBalloon(balloon.current, -1, null);
    const target = b.target === "example" ? lot : byLogin.get(b.target.login.toLowerCase());
    if (!target) return placeBalloon(balloon.current, -1, null);
    const onLot = target === lot;
    const top = onLot ? lot!.height * rise : target.height;
    pin.set(target.position[0], top, target.position[2]).project(camera);
    const roof = { x: (pin.x + 1) / 2, y: (1 - pin.y) / 2 };
    pin.set(target.position[0], top + (onLot ? 6 : 10), target.position[2]).project(camera);
    placeBalloon(balloon.current, bi, {
      left: ((pin.x + 1) / 2) * 100,
      top: ((1 - pin.y) / 2) * 100,
      opacity: Math.min(1, (t - b.from) / 0.15) * Math.max(0, Math.min(1, 1 - (t - b.to) / 0.4)),
      badges: b.badges.map((x) => x.at),
      t,
      roof,
    });
  });

  // The lot's building on its own, so only it grows; the gameplay takes' actors.
  return (
    <>
      <group ref={riser} visible={false}>
        <CityScene buildings={lone} colors={colors} introMode filmMode />
      </group>
      {store && targets.length > 0 && <CityScene buildings={targets} colors={colors} introMode filmMode smash={store} />}
      {reel.cuts.some((c) => isTake(c.kind)) && <BayTakes clock={clock} reel={reel} store={store} byLogin={byLogin} />}
    </>
  );
}
