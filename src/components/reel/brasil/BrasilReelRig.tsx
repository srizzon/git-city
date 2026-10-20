"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import CityScene from "@/components/CityScene";
import { CELLS as CROWN_CELLS, GEMS as CROWN_GEMS } from "@/components/LeagueCrown3D";
import { townEmerald } from "@/components/league/townTheme";
import type { Geo } from "@/lib/towns/brasil-geo";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { cutAt, type Reel, type ReelCut } from "@/lib/reel/film";
import { placeBalloon } from "@/components/reel/ReelOverlay";
import { CROWN_CELL, CROWN_H, ease, FOV, ITEMS_H, poseAt, WIDE_SCENES, type SceneWorld, type Target } from "./scenes";
import BrasilTakes, { isBrasilTake } from "./BrasilTakes";

// A reel's camera on the Brasil map (./scenes), in place of the map's
// controls, plus the example building rising on its lot when the reel has
// one. It reads the film's clock every frame, places the camera, sets the
// haze, and pins the balloon over its target's roof. A crown cut sets the
// week's crown on its target's roof, coming down onto it as the cut opens.

// The map's own night (BrasilScene): greens, lime windows. The example building wears it too.
const NIGHT = townEmerald().theme;

/** An empty city's dot: hot red, unlit, so it reads on the green map at any distance. */
const EMPTY_DOT = new THREE.MeshBasicMaterial({ color: "#ff3b4e", toneMapped: false });

/** The crown comes down from this far above its place, over this long. */
const CROWN_DROP = { h: 160, s: 0.9 };

const ramp = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / Math.max(1e-6, to - from)));
/** Floor by floor, easing in and out (smootherstep), so it reads as a building going up, not a pop. */
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export interface BrasilReelRigProps {
  clock: FilmClock;
  /** The country's extent at the map's scale. */
  bounds: Geo["bounds"];
  reel: Reel;
  /** The example building (on its lot), if the world has one. */
  example: CityBuilding | null;
  /** The residents' buildings by login (lowercase). */
  byLogin: ReadonlyMap<string, CityBuilding>;
  /** Where a state's capital square is, in world units. */
  capitalOf: (uf: string) => [number, number] | null;
  /** Where the cities nobody lives in stand, for an empties overlay. */
  empty?: readonly [number, number][];
  balloon: RefObject<HTMLDivElement | null>;
}

export default function BrasilReelRig({ clock, reel, bounds, example, byLogin, capitalOf, empty = [], balloon }: BrasilReelRigProps) {
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

  // Every building as a box, for the orbits' line of sight.
  const nearby = useMemo(
    () => [...byLogin.values()].map((b) => ({ x: b.position[0], z: b.position[2], w: b.width, d: b.depth, h: b.height })),
    [byLogin],
  );
  const world = useMemo<SceneWorld>(() => {
    const building = (login: string): CityBuilding | null => (example && example.loginLower === login.toLowerCase() ? example : (byLogin.get(login.toLowerCase()) ?? null));
    const targetOf = (cut: ReelCut): Target => {
      const p = cut.params;
      const b = typeof p.login === "string" ? building(p.login) : p.target === "example" || !p.uf ? example : null;
      if (b) return { x: b.position[0], z: b.position[2], height: b.height, items: !!b.owned_items?.length, crown: cut.kind === "crown" || p.crown === true };
      if (typeof p.uf === "string") {
        const c = capitalOf(p.uf);
        if (c) return { x: c[0], z: c[1], height: 0 };
      }
      throw new Error(`Scene "${cut.name}": no target (login, uf or the example).`);
    };
    return {
      aspect: size.width / size.height,
      bounds,
      targetOf,
      riseAt: (t) => (riseCut ? smoother(ramp(t, rise.from, rise.to)) : 1),
      isRise: (cut) => cut === riseCut,
      near: (x, z, r) =>
        nearby.filter((o) => Math.abs(o.x - x) < r && Math.abs(o.z - z) < r),
    };
  }, [size.width, size.height, bounds, example, byLogin, capitalOf, riseCut, rise, nearby]);

  const floors = example ? Math.max(6, example.floors || Math.round(example.height / 6)) : 1;
  const pin = useMemo(() => new THREE.Vector3(), []);
  // Each crown cut's building (by cut), and the group the crown hangs from.
  const crowns = useMemo(
    () =>
      reel.cuts.flatMap((c) => {
        if ((c.kind !== "crown" && c.params.crown !== true) || typeof c.params.login !== "string") return [];
        const b = c.params.login.toLowerCase() === example?.loginLower ? example : byLogin.get(c.params.login.toLowerCase());
        return b ? [{ cut: c, b }] : [];
      }),
    [reel, byLogin, example],
  );
  const crownRefs = useRef<(THREE.Group | null)[]>([]);
  // Each pinned photo's capital, and its place in the north-to-south wave.
  const pinned = useMemo(
    () =>
      reel.pins.map((g) => {
        const at = g.rows.map((r) => capitalOf(r.uf));
        const order = g.rows.map((_, k) => k).sort((a, b) => (at[a]?.[1] ?? 0) - (at[b]?.[1] ?? 0));
        const rank = new Map(order.map((k, n) => [k, n]));
        return g.rows.map((_, k) => ({ at: at[k], n: rank.get(k) ?? 0 }));
      }),
    [reel, capitalOf],
  );
  // The empty cities: a flat dot each, popping in on its own turn (a scattered order, the same every render).
  const dots = useRef<THREE.InstancedMesh>(null);
  const dotTurn = useMemo(() => empty.map((_, i) => ((i * 2654435761) % 4294967296) / 4294967296), [empty]);
  const dotSize = (bounds.maxX - bounds.minX) / 260;
  const dotM = useMemo(() => new THREE.Matrix4(), []);
  const crownBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const crownGold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#ffb800", emissiveIntensity: 1.2, toneMapped: false }), []);
  const crownGem = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ff3b6b", emissive: "#ff1f55", emissiveIntensity: 1.4, toneMapped: false }), []);

  useFrame(({ camera: cam, scene }) => {
    const camera = cam as THREE.PerspectiveCamera;
    const t = Math.max(0, beatOf(clock));
    const { cut, index, u } = cutAt(reel, t);
    // A drift take places its own camera (BrasilTakes).
    if (isBrasilTake(cut.kind)) return placeBalloon(balloon.current, -1, null);
    const pose = poseAt(reel.cuts, index, u, world);
    // The crown faces the camera (it's a flat voxel crown, an icon), comes down onto the roof, then bobs on the film's clock.
    crowns.forEach(({ cut: c, b }, k) => {
      const g = crownRefs.current[k];
      if (!g) return;
      g.visible = c === cut;
      if (c !== cut) return;
      const drop = (1 - ease(Math.min(1, (t - c.from) / CROWN_DROP.s))) * CROWN_DROP.h;
      g.position.set(b.position[0], b.height + 14 + CROWN_CELL * 2.5 + drop + Math.sin(t * 2.2) * CROWN_CELL * 0.25, b.position[2]);
      g.rotation.y = Math.atan2(pose.pos.x - b.position[0], pose.pos.z - b.position[2]) + Math.sin(t * 1.4) * 0.25;
    });

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

    // The empty cities pop in over [from, reach], each with a small overshoot, and stay until `to`.
    const mesh = dots.current;
    const e = reel.empties.find((x) => t >= x.from && t < x.to + 0.3);
    if (mesh) {
      mesh.visible = !!e;
      if (e) {
        const out = Math.min(1, Math.max(0, (e.to + 0.3 - t) / 0.3));
        empty.forEach(([x, z], i) => {
          const pop = Math.min(1, Math.max(0, (t - (e.from + dotTurn[i] * (e.reach - e.from))) / 0.25));
          const s = pop <= 0 ? 0 : (1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2)) * out * dotSize;
          dotM.makeScale(Math.max(1e-4, s), Math.max(1e-4, s * 0.15), Math.max(1e-4, s)).setPosition(x, 4, z);
          mesh.setMatrixAt(i, dotM);
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Photos pinned over capitals: each pops in on its turn in the wave, standing on its capital.
    reel.pins.forEach((g, i) => {
      pinned[i].forEach(({ at, n }, k) => {
        const el = balloon.current?.querySelector<HTMLElement>(`[data-pin="${i}-${k}"]`);
        if (!el) return;
        const start = g.from + n * g.stagger;
        if (!at || t < start || t > g.to + 0.3) return void (el.style.opacity = "0");
        pin.set(at[0], 0, at[1]).project(camera);
        const pop = Math.min(1, (t - start) / 0.3);
        const s = pop <= 0 ? 0 : 1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2);
        el.style.left = `${((pin.x + 1) / 2) * 100}%`;
        el.style.top = `${((1 - pin.y) / 2) * 100}%`;
        el.style.opacity = String(Math.min(1, pop * 3) * Math.min(1, Math.max(0, (g.to + 0.3 - t) / 0.3)));
        el.style.transform = `translate(-50%, -100%) scale(${Math.max(0.001, s)})`;
      });
    });

    // The balloon over its target's roof (one at a time: the one whose window holds t).
    // A balloon fades out after its end only while its take goes on: a cut to another building drops it at once.
    const bi = reel.balloons.findIndex((x) => t >= x.from && (t < x.to || (t < x.to + 0.4 && cut.from < x.to)));
    const b = reel.balloons[bi];
    // A wide scene has no balloon, except a map opening close on a building: that building's own.
    const opener = cut.kind === "map" && typeof cut.params.login === "string" && b?.target !== "example" && b?.target.login.toLowerCase() === cut.params.login.toLowerCase();
    if (!b || (WIDE_SCENES.has(cut.kind) && !opener)) return placeBalloon(balloon.current, -1, null);
    const target = b.target === "example" ? example : byLogin.get(b.target.login.toLowerCase());
    if (!target) return placeBalloon(balloon.current, -1, null);
    const isExample = target === example;
    const top = isExample ? buildTo.current : target.height;
    // Its roof items (crown, face, aura) stand on the roof: the tag clears them (once a rising one is finished).
    const items = Math.max(target.owned_items?.length ? ITEMS_H : 0, crowns.some((c) => c.cut === cut && c.b === target) ? CROWN_H : 0);
    const clear = 8 + items * (isExample && riseCut ? ease(ramp(t, rise.to, rise.to + 0.35)) : 1);
    // The roof on screen, for the export's check that no caption covers it.
    pin.set(target.position[0], top, target.position[2]).project(camera);
    const roof = { x: (pin.x + 1) / 2, y: (1 - pin.y) / 2 };
    pin.set(target.position[0], top + clear, target.position[2]).project(camera);
    placeBalloon(balloon.current, bi, {
      left: ((pin.x + 1) / 2) * 100,
      top: ((1 - pin.y) / 2) * 100,
      opacity: Math.min(1, (t - b.from) / 0.15) * Math.max(0, Math.min(1, 1 - (t - b.to) / 0.4)),
      badges: b.badges.map((x) => x.at),
      t,
      roof,
    });
  });

  const takes = reel.cuts.some((c) => isBrasilTake(c.kind)) ? <BrasilTakes clock={clock} reel={reel} /> : null;
  const crowned = crowns.map((_, k) => (
    <group key={k} ref={(g) => void (crownRefs.current[k] = g)} visible={false}>
      {CROWN_CELLS.map(([x, y]) => (
        <mesh key={`${x}-${y}`} geometry={crownBox} material={CROWN_GEMS.some(([gx, gy]) => gx === x && gy === y) ? crownGem : crownGold} position={[(x - 2) * CROWN_CELL, (y - 2) * CROWN_CELL, 0]} scale={[CROWN_CELL, CROWN_CELL, CROWN_CELL * 1.4]} />
      ))}
    </group>
  ));
  const emptied = empty.length ? (
    <instancedMesh ref={dots} args={[crownBox, EMPTY_DOT, empty.length]} visible={false} frustumCulled={false} />
  ) : null;
  if (!example) return (
    <group>
      {takes}
      {crowned}
      {emptied}
    </group>
  );
  return (
    <group>
      {takes}
      {crowned}
      {emptied}
      <CityScene buildings={lone} colors={NIGHT.building} introMode filmMode={finished} buildTo={buildTo} />
      <mesh ref={slab} position={[example.position[0], 0, example.position[2]]} visible={false}>
        <boxGeometry args={[example.width + 1, 1.2, example.depth + 1]} />
        <meshBasicMaterial color={NIGHT.building.roof} />
      </mesh>
    </group>
  );
}
