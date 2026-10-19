"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LOT } from "@/lib/league-city/grid";
import { CELL, PAINT_MINE, PAINT_RIVAL, stateAt, stateColor, type PaintBoard, type PaintGeom } from "@/lib/towns/brasil-paint";
import type { UF } from "@/lib/towns/brasil-map";

// The State War's paint on the map: one texture a pixel per cell, laid flat
// over the land under the buildings, so the whole board is one draw call
// (phones count those). Held land is see-through, live trails solid and
// lighter. Your state is lime everywhere; the others take their flag's color
// on the map and one rival red while you drive. Only the cells that changed
// are redrawn, and the texture goes up to the GPU a few times a second at most.

/** Over the asphalt (0.3, LeagueRoads), under its markings (0.45) and everything that stands; pulled forward in depth too, so it never flickers against the road from far. */
const Y = 0.38;
const HELD = 170;
const TRAIL = 235;
/** Shortest time between two texture uploads (ms). */
const UPLOAD_MS = 150;

export default function PaintLayer({ board, mine, driving }: { board: PaintBoard; mine: UF | null; driving: boolean }) {
  const geom = useRef<PaintGeom | null>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const tex = useRef<THREE.DataTexture | null>(null);
  const seen = useRef(-1);
  const full = useRef(true);
  const lastUpload = useRef(0);
  const pending = useRef(false);

  // [r, g, b] per state number (1…27), held and as a trail (lighter).
  const palette = useMemo(() => {
    const held: [number, number, number][] = [[0, 0, 0]];
    const trail: [number, number, number][] = [[0, 0, 0]];
    const c = new THREE.Color();
    const white = new THREE.Color("#ffffff");
    for (let s = 1; s <= 27; s++) {
      const uf = stateAt(s);
      c.set(uf === mine ? PAINT_MINE : driving ? PAINT_RIVAL : uf ? stateColor(uf) : "#000000");
      held.push([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]);
      c.lerp(white, 0.4);
      trail.push([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]);
    }
    return { held, trail };
  }, [mine, driving]);
  // A new palette repaints everything.
  useEffect(() => {
    full.current = true;
  }, [palette]);
  useEffect(() => () => tex.current?.dispose(), []);

  useFrame(() => {
    const g = board.geom;
    if (!g || !mesh.current || !material.current) return;
    if (geom.current !== g || !tex.current) {
      geom.current = g;
      tex.current?.dispose();
      const t = new THREE.DataTexture(new Uint8Array(g.w * g.d * 4), g.w, g.d, THREE.RGBAFormat);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      tex.current = t;
      material.current.map = t;
      material.current.needsUpdate = true;
      mesh.current.position.set((g.x0 + g.w / 2) * CELL - LOT / 2, Y, (g.z0 + g.d / 2) * CELL - LOT / 2);
      mesh.current.scale.set(g.w * CELL, g.d * CELL, 1);
      mesh.current.visible = true;
      full.current = true;
    }
    const data = tex.current.image.data as Uint8Array;
    const { w, d } = g;
    // Texture rows run from the map's south edge up (the plane lies face up: v = 0 is +z).
    const put = (c: number) => {
      const k = ((d - 1 - Math.floor(c / w)) * w + (c % w)) * 4;
      const t = board.trailAt(c);
      const s = t || board.heldAt(c);
      const [r, gg, b] = s ? (t ? palette.trail[s] : palette.held[s]) : palette.held[0];
      data[k] = r;
      data[k + 1] = gg;
      data[k + 2] = b;
      data[k + 3] = !s ? 0 : t ? TRAIL : HELD;
    };
    if (seen.current !== board.version || full.current) {
      seen.current = board.version;
      const dirty = board.takeDirty();
      if (dirty === null || full.current) {
        full.current = false;
        data.fill(0);
        const owner = board.owner;
        for (let c = 0; c < owner.length; c++) if (owner[c] || board.home[c]) put(c);
        for (const t of board.trails.values()) for (const c of t.cells) put(c);
      } else for (const c of dirty) if (c >= 0 && c < board.owner.length) put(c);
      pending.current = true;
    }
    const now = performance.now();
    if (pending.current && now - lastUpload.current >= UPLOAD_MS) {
      pending.current = false;
      lastUpload.current = now;
      tex.current.needsUpdate = true;
    }
  });

  return (
    <mesh ref={mesh} visible={false} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} transparent depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}
