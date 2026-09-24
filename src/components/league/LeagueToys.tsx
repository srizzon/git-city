"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ConvexGeometry } from "three-stdlib";
import { rotToRadians } from "@/lib/league-city/grid";
import { RAMP, RAMP_BIG, rampCorners, type RampSize } from "@/lib/league-city/ramp";
import { BOOST_PAD, CONE, CRATE, SPEED_BUMP, TIRE, crateLayout, tireLayout } from "@/lib/league-city/toys";
import type { CityObject } from "@/lib/league-city/types";

// Driving toys, one instanced mesh per part: ramps (orange wedges), boost
// pads (a glowing cyan strip), speed bumps, tire walls, cones and crate
// stacks. While driving, cones and crates are physics bodies drawn by
// DriveWorld, so they're left out here.

const _local = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export function rampGeometry(size: RampSize = RAMP): THREE.BufferGeometry {
  const [a, b, c, d, e, f] = rampCorners(size);
  // Deck (quad c-d-e-f), back face (a-b-f-e), two side triangles, bottom.
  const tris = [
    d, c, f, d, f, e, // deck
    b, a, e, b, e, f, // back wall
    a, d, e, // west side
    c, b, f, // east side
    a, b, c, a, c, d, // bottom
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  // Deck is orange, walls and bottom darker (vertex colors, 6 deck vertices first).
  const deck = new THREE.Color("#e08a2e");
  const wall = new THREE.Color("#7a4a2a");
  const colors: number[] = [];
  for (let i = 0; i < tris.length; i++) colors.push(...(i < 6 ? deck : wall).toArray());
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function bumpGeometry(): THREE.BufferGeometry {
  const w = SPEED_BUMP.width / 2;
  const d = SPEED_BUMP.depth / 2;
  const h = SPEED_BUMP.height;
  const top = d * 0.35;
  const pts = [
    [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d],
    [-w, h, -top], [w, h, -top], [w, h, top], [-w, h, top],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return new ConvexGeometry(pts);
}

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; matrices: THREE.Matrix4[] };

function Instances({ part }: { part: Part }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    part.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part]);
  if (part.matrices.length === 0) return null;
  return <instancedMesh key={part.matrices.length} ref={ref} args={[part.geo, part.mat, part.matrices.length]} />;
}

/** World matrix for a prop, times a local offset. */
function placed(o: CityObject, local?: THREE.Matrix4): THREE.Matrix4 {
  _q.setFromAxisAngle(_up, rotToRadians(o.rot));
  _p.set(o.px!, 0, o.pz!);
  const m = new THREE.Matrix4().compose(_p, _q, _one);
  return local ? m.multiply(local) : m;
}

export default function LeagueToys({ objects, driving = false }: { objects: CityObject[]; driving?: boolean }) {
  const kit = useMemo(() => {
    const tireGeo = new THREE.CylinderGeometry(TIRE.radius, TIRE.radius, TIRE.width, 12);
    tireGeo.rotateX(Math.PI / 2); // axle along z
    return {
      ramp: rampGeometry(RAMP),
      rampBig: rampGeometry(RAMP_BIG),
      rampMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: "#3a2008", emissiveIntensity: 0.4 }),
      pad: new THREE.PlaneGeometry(BOOST_PAD.width, BOOST_PAD.length).rotateX(-Math.PI / 2),
      padGlow: new THREE.PlaneGeometry(BOOST_PAD.width + 1.6, BOOST_PAD.length + 1.6).rotateX(-Math.PI / 2),
      padMat: new THREE.MeshBasicMaterial({ color: "#39d8ff", toneMapped: false, transparent: true, opacity: 0.9 }),
      padGlowMat: new THREE.MeshBasicMaterial({ color: "#b8f2ff", toneMapped: false, transparent: true, opacity: 0.45, depthWrite: false }),
      bump: bumpGeometry(),
      bumpMat: new THREE.MeshStandardMaterial({ color: "#f5c518", emissive: "#f5c518", emissiveIntensity: 0.35, roughness: 0.7 }),
      tire: tireGeo,
      tireMat: new THREE.MeshStandardMaterial({ color: "#1c1c22", emissive: "#2a2a33", emissiveIntensity: 0.4, roughness: 0.9 }),
      cone: new THREE.ConeGeometry(CONE.radius, CONE.height, 10).translate(0, CONE.height / 2, 0),
      coneMat: new THREE.MeshStandardMaterial({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.45 }),
      crate: new THREE.BoxGeometry(CRATE, CRATE, CRATE),
      crateMat: new THREE.MeshStandardMaterial({ color: "#a8743f", emissive: "#5a3a1a", emissiveIntensity: 0.4, roughness: 0.85 }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const v of Object.values(kit)) (v as { dispose?: () => void }).dispose?.();
    },
    [kit],
  );

  const parts = useMemo(() => {
    const of = (t: string) => objects.filter((o) => o.item_type === t && o.px !== null && o.pz !== null);
    const list: Part[] = [
      { geo: kit.ramp, mat: kit.rampMat, matrices: of("ramp").map((o) => placed(o)) },
      { geo: kit.rampBig, mat: kit.rampMat, matrices: of("ramp_big").map((o) => placed(o)) },
      { geo: kit.padGlow, mat: kit.padGlowMat, matrices: of("boost_pad").map((o) => placed(o, _local.makeTranslation(0, 0.3, 0))) },
      { geo: kit.pad, mat: kit.padMat, matrices: of("boost_pad").map((o) => placed(o, _local.makeTranslation(0, 0.4, 0))) },
      { geo: kit.bump, mat: kit.bumpMat, matrices: of("speed_bump").map((o) => placed(o)) },
      {
        geo: kit.tire,
        mat: kit.tireMat,
        matrices: of("tire_wall").flatMap((o) => tireLayout().map(([x, y]) => placed(o, _local.makeTranslation(x, y, 0)))),
      },
    ];
    if (!driving) {
      list.push({ geo: kit.cone, mat: kit.coneMat, matrices: of("cone").map((o) => placed(o)) });
      list.push({
        geo: kit.crate,
        mat: kit.crateMat,
        matrices: of("crates").flatMap((o) => crateLayout().map(([x, y, z]) => placed(o, _local.makeTranslation(x, y, z)))),
      });
    }
    return list;
  }, [objects, driving, kit]);

  return (
    <>
      {parts.map((p, i) => (
        <Instances key={i} part={p} />
      ))}
    </>
  );
}
