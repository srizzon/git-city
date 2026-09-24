"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import { LOT, lotToWorld, rotToRadians } from "@/lib/league-city/grid";
import { E, N, S, W, roadMask, roadPiece, type RoadShape } from "@/lib/league-city/roads";
import type { CityObject } from "@/lib/league-city/types";

// Procedural roads: one geometry per piece shape (asphalt + lane marks),
// instanced per shape. Pieces come from each road lot's neighbors.

const ROAD_W = 26;
const HALF = LOT / 2;
const SHAPES: RoadShape[] = ["single", "end", "straight", "corner", "tee", "cross"];
const BASE_MASK: Record<RoadShape, number> = {
  single: 0,
  end: N,
  straight: N | S,
  corner: N | E,
  tee: N | E | S,
  cross: N | E | S | W,
};

function flat(w: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

// Arms point from the lot center to the edge; dir is N/E/S/W.
function arm(dir: number, width: number, length: number, from: number, y: number): THREE.BufferGeometry {
  const mid = from + length / 2;
  if (dir === N) return flat(width, length, 0, y, -mid);
  if (dir === S) return flat(width, length, 0, y, mid);
  if (dir === E) return flat(length, width, mid, y, 0);
  return flat(length, width, -mid, y, 0);
}

function shapeGeometries(mask: number) {
  const asphalt = [flat(ROAD_W, ROAD_W, 0, 0.3, 0)];
  const marks: THREE.BufferGeometry[] = [];
  for (const dir of [N, E, S, W]) {
    if (!(mask & dir)) continue;
    asphalt.push(arm(dir, ROAD_W, HALF - ROAD_W / 2, ROAD_W / 2, 0.3));
    marks.push(arm(dir, 1.2, HALF - ROAD_W / 2 - 4, ROAD_W / 2 + 4, 0.45));
  }
  return {
    asphalt: mergeBufferGeometries(asphalt, false) ?? asphalt[0],
    marks: marks.length ? (mergeBufferGeometries(marks, false) ?? marks[0]) : null,
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

function ShapeMeshes({
  geo,
  placements,
  asphaltMat,
  markMat,
}: {
  geo: ReturnType<typeof shapeGeometries>;
  placements: { x: number; z: number; rot: number }[];
  asphaltMat: THREE.Material;
  markMat: THREE.Material;
}) {
  const asphaltRef = useRef<THREE.InstancedMesh>(null);
  const marksRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    placements.forEach((pl, i) => {
      const [wx, wz] = lotToWorld(pl.x, pl.z);
      _q.setFromAxisAngle(_up, rotToRadians(pl.rot));
      _p.set(wx, 0, wz);
      _m.compose(_p, _q, _s);
      asphaltRef.current?.setMatrixAt(i, _m);
      marksRef.current?.setMatrixAt(i, _m);
    });
    for (const r of [asphaltRef.current, marksRef.current]) {
      if (!r) continue;
      r.instanceMatrix.needsUpdate = true;
      r.computeBoundingSphere();
    }
  }, [placements]);
  return (
    <>
      <instancedMesh key={`a${placements.length}`} ref={asphaltRef} args={[geo.asphalt, asphaltMat, placements.length]} />
      {geo.marks && <instancedMesh key={`m${placements.length}`} ref={marksRef} args={[geo.marks, markMat, placements.length]} />}
    </>
  );
}

export default function LeagueRoads({ objects, markingColor }: { objects: CityObject[]; markingColor: string }) {
  const geos = useMemo(() => Object.fromEntries(SHAPES.map((s) => [s, shapeGeometries(BASE_MASK[s])])) as Record<RoadShape, ReturnType<typeof shapeGeometries>>, []);
  const mats = useMemo(
    () => ({
      asphalt: new THREE.MeshStandardMaterial({ color: "#10131a", emissive: "#10131a", emissiveIntensity: 0.1, roughness: 0.9 }),
      mark: new THREE.MeshStandardMaterial({ color: markingColor, emissive: markingColor, emissiveIntensity: 0.6 }),
    }),
    [markingColor],
  );
  useLayoutEffect(
    () => () => {
      mats.asphalt.dispose();
      mats.mark.dispose();
    },
    [mats],
  );
  useLayoutEffect(
    () => () => {
      for (const g of Object.values(geos)) {
        g.asphalt.dispose();
        g.marks?.dispose();
      }
    },
    [geos],
  );

  const byShape = useMemo(() => {
    const roads = objects.filter((o) => o.item_type === "road");
    const keys = new Set(roads.map((o) => `${o.x},${o.z}`));
    const isRoad = (x: number, z: number) => keys.has(`${x},${z}`);
    const out: Record<RoadShape, { x: number; z: number; rot: number }[]> = {
      single: [], end: [], straight: [], corner: [], tee: [], cross: [],
    };
    for (const o of roads) {
      const { shape, rot } = roadPiece(roadMask(isRoad, o.x, o.z));
      out[shape].push({ x: o.x, z: o.z, rot });
    }
    return out;
  }, [objects]);

  return (
    <group>
      {SHAPES.map((s) =>
        byShape[s].length > 0 ? (
          <ShapeMeshes key={s} geo={geos[s]} placements={byShape[s]} asphaltMat={mats.asphalt} markMat={mats.mark} />
        ) : null,
      )}
    </group>
  );
}

/**
 * Editor preview of new road lots: each piece is picked against the real
 * roads plus the other ghost lots, so an L drag shows its corner.
 */
export function GhostRoads({ objects, lots, ok }: { objects: CityObject[]; lots: [number, number][]; ok: boolean }) {
  const geos = useMemo(() => Object.fromEntries(SHAPES.map((s) => [s, shapeGeometries(BASE_MASK[s])])) as Record<RoadShape, ReturnType<typeof shapeGeometries>>, []);
  const mats = useMemo(() => {
    const color = ok ? "#4ade80" : "#ef4444";
    return {
      asphalt: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }),
      mark: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }),
    };
  }, [ok]);
  useLayoutEffect(
    () => () => {
      mats.asphalt.dispose();
      mats.mark.dispose();
    },
    [mats],
  );
  useLayoutEffect(
    () => () => {
      for (const g of Object.values(geos)) {
        g.asphalt.dispose();
        g.marks?.dispose();
      }
    },
    [geos],
  );

  const byShape = useMemo(() => {
    const keys = new Set(objects.filter((o) => o.item_type === "road").map((o) => `${o.x},${o.z}`));
    for (const [x, z] of lots) keys.add(`${x},${z}`);
    const isRoad = (x: number, z: number) => keys.has(`${x},${z}`);
    const out: Record<RoadShape, { x: number; z: number; rot: number }[]> = {
      single: [], end: [], straight: [], corner: [], tee: [], cross: [],
    };
    for (const [x, z] of lots) {
      const { shape, rot } = roadPiece(roadMask(isRoad, x, z));
      out[shape].push({ x, z, rot });
    }
    return out;
  }, [objects, lots]);

  return (
    <group position={[0, 0.2, 0]} renderOrder={5}>
      {SHAPES.map((s) =>
        byShape[s].length > 0 ? (
          <ShapeMeshes key={s} geo={geos[s]} placements={byShape[s]} asphaltMat={mats.asphalt} markMat={mats.mark} />
        ) : null,
      )}
    </group>
  );
}
