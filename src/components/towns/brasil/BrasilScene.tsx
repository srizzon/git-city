"use client";

import "@/lib/silenceThreeClockWarning";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls } from "@react-three/drei";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import CityScene from "@/components/CityScene";
import MergedStatic from "@/components/MergedStatic";
import TrophyIcon from "@/components/towns/TrophyIcon";
import { ThemeLights } from "@/components/city/theme";
import ThemeSkyFX from "@/components/ThemeSkyFX";
import { EXPOSURE, townEmerald } from "@/components/league/townTheme";
import IdentityLayer, { useFontReady } from "@/components/league/identity/IdentityLayer";
import { makeWaterMaterial, tickWater } from "@/components/city/mapMaterials";
import { Billboard } from "@/components/league/identity/IdentityPieces";
import LeagueRoads from "@/components/league/LeagueRoads";
import LeagueToys from "@/components/league/LeagueToys";
import LeagueTrees from "@/components/league/LeagueTrees";
import type { DriveWorldProps } from "@/components/league/drive/DriveWorld";
import type { CarFeed } from "@/components/league/drive/useDrivePresence";
import type { CityBuilding, CityDecoration } from "@/lib/github";
import { InstancedDecorations } from "@/components/city/decorations";
import { LOT, lotToWorld } from "@/lib/league-city/grid";
import { TREE_TYPES, type CityObject, type TreeType } from "@/lib/league-city/types";
import type { SmashStore } from "@/lib/league-city/smash";
import RubbleFlags from "@/components/league/RubbleFlags";
import { geoAt, type Geo, type Ring } from "@/lib/towns/brasil-geo";
import { mapNav, type MapCameraStore } from "@/lib/map-nav";
import { usePerfMode } from "@/lib/perfMode";
import { stateOf, type CityLayout, type UF } from "@/lib/towns/brasil-map";
import type { BoardRowLite } from "@/components/drift/DriftTitle";
import { DriftSite, DriftTag } from "./BrasilDrift";
import { DRIFT_SITE } from "@/lib/towns/brasil-drift";

// The Brasil town: the country on its real outline under the towns' night
// sky, a pale coast, the states' borders dashed in lime, every city someone
// lives in paved like a town, highway streets between them, the island out
// at sea. Brazil is drawn at the map's scale (geoAt): it grows with the cities.
// Tags float over the cities like a map's labels: from the whole country the
// capitals, closer in more cities, up close every one on screen; where two
// would overlap the one with more devs wins. A tag flies the camera to its city. The camera is a map's: drag to pan,
// right-drag to turn, scroll to zoom. Drive mode is the towns' (DriveWorld).
// Off the coast between São Paulo and Rio, on its own island, lies the drift track (BrasilDrift): crossing its
// START line swaps the town's car for a drift run (DriftWorld) right there.

const DriveWorld = dynamic(() => import("@/components/league/drive/DriveWorld"), { ssr: false, loading: () => null });

// Brazil's night: the towns' light levels in greens (townEmerald), lime windows.
const { theme: NIGHT, key: NIGHT_KEY, fx: NIGHT_FX } = townEmerald();
/** The open country: darker than a block's paving, so the cities read as towns. */
const LAND = "#173a25";
/** A strip of shore along the coast and round the island. */
const COAST = "#1d4a2e";
/** A block's paving: the towns' ground. */
const PAVING = NIGHT.groundColor;
const LIME = "#c8e64a";

// ─── Ground ──────────────────────────────────────────────────

function shapeOf(ring: Ring): THREE.Shape {
  // Rotated onto the ground (-90° about x): world z is the shape's -y.
  const s = new THREE.Shape();
  ring.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
  return s;
}

/** A flat band of `w` along a closed ring (the beach, a highway). */
function ribbon(points: [number, number][], w: number, closed: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = points.length;
  const at = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i++) {
    const [px, pz] = at(i - 1);
    const [nx, nz] = at(i + 1);
    let dx = nx - px;
    let dz = nz - pz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const [x, z] = points[i];
    pos.push(x - dz * w * 0.5, 0, z + dx * w * 0.5, x + dz * w * 0.5, 0, z - dx * w * 0.5);
    if (i < n - 1 || closed) {
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function Ground({ island, geo }: { island: CityLayout; geo: Geo }) {
  const land = useMemo(() => new THREE.ShapeGeometry(geo.outline.map(shapeOf)), [geo]);
  const beach = useMemo(() => geo.outline.map((r) => ribbon(r, 160, true)), [geo]);
  const rivers = useMemo(() => geo.rivers.map((r) => ribbon(r.points, r.width, false)), [geo]);
  const banks = useMemo(() => geo.rivers.map((r) => ribbon(r.points, r.width + 26, false)), [geo]);
  // The sea is the main city's bay as it is; the rivers the same water, lighter.
  // Brighter than the bay's: an ocean blue that sets the green country off and keeps the map readable.
  const sea = useMemo(() => {
    const m = makeWaterMaterial();
    (m.uniforms.uDeep.value as THREE.Color).set("#1b4d72");
    (m.uniforms.uShallow.value as THREE.Color).set("#2b6e98");
    (m.uniforms.uSky.value as THREE.Color).set("#1d4466");
    return m;
  }, []);
  const water = useMemo(() => {
    const m = makeWaterMaterial();
    m.side = THREE.DoubleSide;
    // Lighter than the bay's: rivers are thin and must read against the land at night
    // (the shader writes its colors as they are, so these come out darker than they read here).
    (m.uniforms.uDeep.value as THREE.Color).set("#3d7fa8");
    (m.uniforms.uShallow.value as THREE.Color).set("#5aa6cf");
    return m;
  }, []);
  useFrame((_, dt) => {
    tickWater(water, dt);
    tickWater(sea, dt);
  });
  const borders = useMemo(() => {
    const pts: number[] = [];
    for (const rings of Object.values(geo.stateRings)) {
      for (const r of rings) {
        for (let i = 0; i < r.length; i++) {
          const [ax, az] = r[i];
          const [bx, bz] = r[(i + 1) % r.length];
          pts.push(ax, 0, az, bx, 0, bz);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: LIME, dashSize: 100, gapSize: 70, transparent: true, opacity: 0.4 })).computeLineDistances();
  }, [geo]);
  useEffect(
    () => () => {
      land.dispose();
      beach.forEach((b) => b.dispose());
      rivers.forEach((r) => r.dispose());
      banks.forEach((r) => r.dispose());
      water.dispose();
      sea.dispose();
      borders.geometry.dispose();
      (borders.material as THREE.Material).dispose();
    },
    [land, beach, borders, rivers, banks, water, sea],
  );
  // The island: a wobbly shore round its blocks, sand outside it.
  const [ix, iz] = lotToWorld(...island.hub);
  const ir = (island.radius + 1.5) * LOT;
  const shore = useMemo(() => {
    const ring: [number, number][] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const k = 1 + 0.09 * Math.sin(3 * a + 1.3) + 0.06 * Math.sin(5 * a + 0.4);
      ring.push([Math.cos(a) * ir * k, Math.sin(a) * ir * k]);
    }
    return ring;
  }, [ir]);
  const isle = useMemo(() => new THREE.ShapeGeometry(shapeOf(shore)), [shore]);
  // The drift track's island: a rounded shore just round its site.
  const track = useMemo(() => {
    const [cx, cz] = lotToWorld((DRIFT_SITE.x0 + DRIFT_SITE.x1) / 2, (DRIFT_SITE.z0 + DRIFT_SITE.z1) / 2);
    const rx = ((DRIFT_SITE.x1 - DRIFT_SITE.x0) / 2 + 1.5) * LOT;
    const rz = ((DRIFT_SITE.z1 - DRIFT_SITE.z0) / 2 + 1.5) * LOT;
    const ring: [number, number][] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      // A squircle: square enough to hold the track, round enough to read as an island.
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const k = 1 + 0.04 * Math.sin(4 * a + 0.7);
      ring.push([cx + Math.sign(c) * Math.abs(c) ** 0.5 * rx * k, cz + Math.sign(sn) * Math.abs(sn) ** 0.5 * rz * k]);
    }
    return { land: new THREE.ShapeGeometry(shapeOf(ring)), sand: ribbon(ring, 150, true) };
  }, []);
  const sand = useMemo(() => ribbon(shore, 150, true), [shore]);
  useEffect(
    () => () => {
      isle.dispose();
      sand.dispose();
      track.land.dispose();
      track.sand.dispose();
    },
    [isle, sand, track],
  );
  const { bounds } = geo;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return (
    <group>
      <mesh position={[cx, -8, cz]} rotation={[-Math.PI / 2, 0, 0]} material={sea}>
        <planeGeometry args={[span * 6, span * 6, 64, 64]} />
      </mesh>
      {beach.map((g, i) => (
        <mesh key={i} geometry={g} position={[0, -4, 0]}>
          <meshStandardMaterial color={COAST} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={land} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <meshStandardMaterial color={LAND} emissive={LAND} emissiveIntensity={0.2} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {banks.map((g, i) => (
        <mesh key={`bank-${i}`} geometry={g} position={[0, -0.7, 0]}>
          <meshStandardMaterial color={COAST} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {rivers.map((g, i) => (
        <mesh key={`river-${i}`} geometry={g} position={[0, -0.4, 0]} material={water} />
      ))}
      <primitive object={borders} position={[0, 0.4, 0]} />
      <mesh geometry={track.sand} position={[0, -4, 0]}>
        <meshStandardMaterial color={COAST} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={track.land} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <meshStandardMaterial color={LAND} emissive={LAND} emissiveIntensity={0.2} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <group position={[ix, 0, iz]}>
        <mesh geometry={sand} position={[0, -4, 0]}>
          <meshStandardMaterial color={COAST} roughness={1} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={isle} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
          <meshStandardMaterial color={LAND} emissive={LAND} emissiveIntensity={0.2} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

const _m = new THREE.Matrix4();

/** Every block in use, paved like a town's ground (its lots, inside the streets). */
function Paving({ cities }: { cities: CityLayout[] }) {
  const blocks = useMemo(() => cities.flatMap((c) => c.blocks), [cities]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    blocks.forEach(([x0, z0], i) => {
      const [x, z] = lotToWorld(x0 + 1, z0 + 1);
      _m.makeTranslation(x, 0.05, z);
      ref.current?.setMatrixAt(i, _m);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [blocks]);
  if (blocks.length === 0) return null;
  return (
    <instancedMesh key={blocks.length} ref={ref} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[LOT * 3 + 4, 0.1, LOT * 3 + 4]} />
      <meshStandardMaterial color={PAVING} emissive={PAVING} emissiveIntensity={0.15} roughness={0.95} />
    </instancedMesh>
  );
}

function decorationsOf(objects: CityObject[]): CityDecoration[] {
  const out: CityDecoration[] = [];
  for (const o of objects) {
    const [x, z] = o.px !== null && o.pz !== null ? [o.px, o.pz] : lotToWorld(o.x, o.z);
    if (o.item_type === "lamp") out.push({ type: "streetLamp", position: [x, 0, z], rotation: (o.rot * Math.PI) / 180, variant: 0 });
    else if (o.item_type === "fountain") out.push({ type: "fountain", position: [x, 0.6, z], rotation: 0, variant: 0 });
    else if (o.item_type === "bench") out.push({ type: "bench", position: [x, 0, z], rotation: (o.rot * Math.PI) / 180, variant: 0 });
  }
  return out;
}

/** Every city's square: a round plaza round its fountain. */
function Squares({ cities }: { cities: CityLayout[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    cities.forEach((c, i) => {
      const [x, z] = lotToWorld(...c.center);
      _m.makeTranslation(x, 0.3, z);
      ref.current?.setMatrixAt(i, _m);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [cities]);
  return (
    <instancedMesh key={cities.length} ref={ref} args={[undefined, undefined, cities.length]}>
      <cylinderGeometry args={[LOT * 0.62, LOT * 0.62, 0.6, 32]} />
      <meshStandardMaterial color={NIGHT.sidewalkColor} emissive={NIGHT.sidewalkColor} emissiveIntensity={0.2} roughness={0.85} />
    </instancedMesh>
  );
}

/** The city's name on a board by its square (the towns' billboard), lime on the night panel. */
function CitySign({ city }: { city: CityLayout }) {
  const fontReady = useFontReady();
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0f19";
    ctx.fillRect(0, 0, 256, 128);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const name = city.name.toUpperCase();
    let px = 34;
    ctx.font = `${px}px Silkscreen, monospace`;
    while (ctx.measureText(name).width > 236 && px > 12) ctx.font = `${(px -= 2)}px Silkscreen, monospace`;
    ctx.fillStyle = "#c8e64a";
    ctx.fillText(name, 128, 54);
    ctx.font = "18px Silkscreen, monospace";
    ctx.fillStyle = "#8a93a6";
    ctx.fillText(city.uf ?? "ISLAND", 128, 96);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
    // fontReady: redraw once Silkscreen is in.
  }, [city.name, city.uf, fontReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  const [x, z] = lotToWorld(...city.center);
  return <Billboard position={[x, z - LOT * 0.42]} rot={0} map={tex} />;
}
/** Closer than this a city's sign is drawn. */
const SIGN_VIEW = 9000;
/** Most signs up at once: each is a texture and a draw call. */
const SIGN_MAX = 16;

/**
 * The signs of the cities nearest the camera, within SIGN_VIEW (unreadable
 * from higher): mounted as they come near, so a country of cities never
 * holds a texture for each.
 */
function NearSigns({ cities }: { cities: CityLayout[] }) {
  const [shown, setShown] = useState<CityLayout[]>([]);
  const last = useRef(0);
  const key = useRef("");
  const spots = useMemo(() => cities.map((c) => ({ c, at: lotToWorld(...c.center) })), [cities]);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - last.current < 0.4) return;
    last.current = clock.elapsedTime;
    const near = spots
      .map((s) => ({ c: s.c, d: Math.hypot(camera.position.x - s.at[0], camera.position.y, camera.position.z - s.at[1]) }))
      .filter((e) => e.d < SIGN_VIEW)
      .sort((a, b) => a.d - b.d)
      .slice(0, SIGN_MAX)
      .map((e) => e.c);
    const k = near.map((c) => c.key).join();
    if (k !== key.current) {
      key.current = k;
      setShown(near);
    }
  });
  return (
    <>
      {shown.map((c) => (
        <CitySign key={c.key} city={c} />
      ))}
    </>
  );
}

/** Up close: the @login over the buildings nearest the middle of the view (the towns' name tags). */
function NearPlates({ buildings, fresh, offices }: { buildings: CityBuilding[]; fresh?: ReadonlySet<string>; offices?: ReadonlyMap<string, string> }) {
  const [shown, setShown] = useState<CityBuilding[]>([]);
  const last = useRef(0);
  const key = useRef("");
  useFrame(({ camera, controls, clock }) => {
    if (clock.elapsedTime - last.current < 0.4) return;
    last.current = clock.elapsedTime;
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    if (!target) return;
    const far = camera.position.distanceTo(target) > 1500;
    const near = far
      ? []
      : buildings
          .map((b) => ({ b, d: Math.hypot(b.position[0] - target.x, b.position[2] - target.z) }))
          .filter((e) => e.d < 420)
          .sort((p, q) => p.d - q.d)
          .slice(0, 8)
          .map((e) => e.b);
    const k = near.map((b) => b.login).join();
    if (k !== key.current) {
      key.current = k;
      setShown(near);
    }
  });
  return (
    <>
      {shown.map((b) => (
        <Html key={b.login} position={[b.position[0], b.height + 10, b.position[2]]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`flex items-center gap-1 whitespace-nowrap border-2 bg-bg/80 px-1.5 py-0.5 font-pixel text-[9px] normal-case text-cream ${fresh?.has(b.loginLower) ? "border-lime" : "border-border"}`}>
            {offices?.get(b.loginLower) && <span className="bg-cream px-1 text-[8px] uppercase text-bg">{offices.get(b.loginLower)}</span>}
            {fresh?.has(b.loginLower) && <span className="bg-lime px-1 text-[8px] uppercase text-bg">new</span>}@{b.login}
          </div>
        </Html>
      ))}
    </>
  );
}

// ─── Tags ────────────────────────────────────────────────────

function Tag({ city, near, far, crowned, onClick }: { city: CityLayout; near: boolean; far: boolean; crowned: boolean; onClick: () => void }) {
  const [x, z] = lotToWorld(...city.center);
  const founder = city.devs.find((d) => d.founder)?.dev.login ?? null;
  const st = city.uf ? stateOf(city.uf) : null;
  const swatch = st ? (st.colors[0] === "#ffffff" ? st.colors[1] : st.colors[0]) : LIME;
  return (
    <Html position={[x, 60, z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "auto" }}>
      <button type="button" onClick={onClick} className="flex cursor-pointer flex-col items-center whitespace-nowrap font-pixel uppercase">
        <span className="flex items-center gap-1 border-2 border-border bg-bg/85 px-1 py-px text-[9px] text-cream hover:border-lime sm:gap-1.5 sm:px-1.5 sm:py-0.5 sm:text-[11px]">
          {crowned ? <TrophyIcon size={11} className="text-lime" label="State of the week" /> : <span className="h-1.5 w-1.5 sm:h-2 sm:w-2" style={{ background: swatch }} aria-hidden />}
          {/* From the whole country a capital stands for its state. */}
          {city.ibge === null ? "Island" : far && city.capital ? city.uf : city.name}
          {city.devs.length > 0 && <span className="text-lime">{city.devs.length}</span>}
        </span>
        {near && (
          <span className="border-2 border-t-0 border-border bg-bg/85 px-1.5 py-0.5 text-[8px] normal-case text-muted">
            {founder ? (
              <>
                <span className="uppercase text-lime">founder</span> @{founder}
              </>
            ) : (
              <span className="uppercase">{city.uf ? "no founder yet" : "no city"}</span>
            )}
          </span>
        )}
      </button>
    </Html>
  );
}

// ─── Camera ──────────────────────────────────────────────────

/** Whether the camera is close enough for the tags' details (the founder pill). */
type Near = (near: boolean) => void;

export interface CameraApi {
  /** Fly to a lot, close enough to see its streets (or back to the whole map with null). */
  flyTo: (lot: [number, number] | null, radiusLots?: number) => void;
  /** Fly down to a point (world units) from `distance` away; `done` once there. */
  flyToPoint: (x: number, z: number, distance: number, done?: () => void) => void;
}

/** A city's key, the same everywhere: its IBGE code, or "island". */
export const cityKey = (c: CityLayout) => c.key;

/** Most tags up at once closer in (from far, the 27 capitals and the island): each is a DOM node over the canvas, and more reads as noise. */
const TAG_MAX = 24;
/** Room kept clear round a tag (px). */
const TAG_PAD = 10;
/** Farther than this share of the whole-country view, only the capitals (and the island) are tagged. */
const TAG_FAR = 0.55;

const _v = new THREE.Vector3();

/**
 * Which tags show, like a map's labels: on screen, the ones that matter most
 * first (a crowned or capital city, then more devs), each kept only if it
 * doesn't overlap one already placed; from far, only the capitals.
 */
function Tags({ cities, near, crowned, onTag, overview }: { cities: CityLayout[]; near: boolean; crowned: UF | null; onTag?: (c: CityLayout) => void; overview: number }) {
  const [shown, setShown] = useState<{ list: CityLayout[]; far: boolean }>({ list: [], far: true });
  const last = useRef(0);
  const key = useRef("");
  const ranked = useMemo(
    () =>
      cities
        .map((c) => {
          const founder = c.devs.find((d) => d.founder)?.dev.login ?? "";
          // Silkscreen runs ~10px a letter at the tag's size, plus the swatch and the count; from far a capital shows its state's sigla; up close the founder pill under it may be wider.
          const label = (far: boolean) => (c.ibge === null ? 6 : far && c.capital ? 2 : c.name.length) * 10 + 30 + String(c.devs.length).length * 10;
          return { c, at: lotToWorld(...c.center), w: (far: boolean, near: boolean) => Math.max(label(far), near ? founder.length * 7 + 80 : 0), rank: (crowned && c.capital && c.uf === crowned ? 2e9 : 0) + (c.capital || c.ibge === null ? 1e9 : 0) + c.devs.length };
        })
        .sort((a, b) => b.rank - a.rank || (a.c.key < b.c.key ? -1 : 1)),
    [cities, crowned],
  );
  useFrame(({ camera, controls, size, clock }) => {
    if (clock.elapsedTime - last.current < 0.3) return;
    last.current = clock.elapsedTime;
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    const far = !!target && camera.position.distanceTo(target) > overview * TAG_FAR;
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const list: CityLayout[] = [];
    for (const r of ranked) {
      if (!far && list.length >= TAG_MAX) break;
      if (far && !r.c.capital && r.c.ibge !== null) continue;
      _v.set(r.at[0], 60, r.at[1]).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) continue;
      const x = ((_v.x + 1) / 2) * size.width;
      const y = ((1 - _v.y) / 2) * size.height;
      const w = r.w(far, near);
      // From far only the 27 capitals: they sit close, and each must show.
      const pad = far ? 0 : TAG_PAD;
      const box = { x0: x - w / 2 - pad, x1: x + w / 2 + pad, y0: y - 12 - pad, y1: y + (near ? 34 : 12) + pad };
      if (placed.some((p) => box.x0 < p.x1 && p.x0 < box.x1 && box.y0 < p.y1 && p.y0 < box.y1)) continue;
      placed.push(box);
      list.push(r.c);
    }
    const k = `${far}|${list.map((c) => c.key).join()}`;
    if (k !== key.current) {
      key.current = k;
      setShown({ list, far });
    }
  });
  return (
    <>
      {shown.list.map((c) => (
        <Tag key={c.key} city={c} near={near} far={shown.far} crowned={!!crowned && c.uf === crowned && c.capital} onClick={() => onTag?.(c)} />
      ))}
    </>
  );
}

/** Up close, the city the camera looks at (its center within reach of where the camera points). */
function cityAt(cities: CityLayout[], x: number, z: number): CityLayout | null {
  let best: CityLayout | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const [cx, cz] = lotToWorld(...c.center);
    const d = Math.hypot(cx - x, cz - z);
    if (d < (c.radius + 6) * LOT && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
/** Closer than this, the camera is "in" a city. */
const CITY_VIEW = 7000;

/** The city with people nearest to where the camera points (what you're looking at, from any height but the whole country). */
function cityNearest(cities: CityLayout[], x: number, z: number): CityLayout | null {
  let best: CityLayout | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    if (!c.devs.length) continue;
    const [cx, cz] = lotToWorld(...c.center);
    const d = Math.hypot(cx - x, cz - z);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}


const FOV = 45;

/** The whole country in frame, a little tilted, north up. */
function overviewPose(aspect: number, bounds: Geo["bounds"]) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const half = Math.tan(((FOV / 2) * Math.PI) / 180);
  // A phone held upright: the width decides, with room for the coast and the island past it.
  const dist = (Math.max(w / aspect, d) / (2 * half)) * (aspect < 1 ? 1.05 : 1.08);
  const tilt = (72 * Math.PI) / 180;
  return { target: new THREE.Vector3(cx, 0, cz), position: new THREE.Vector3(cx, dist * Math.sin(tilt), cz + dist * Math.cos(tilt)) };
}

/** How far the overview sits: zooming out stops a little past it, on any screen shape. */
function overviewDistance(aspect: number, bounds: Geo["bounds"]) {
  const p = overviewPose(aspect, bounds);
  return p.position.distanceTo(p.target);
}

function MapCamera({
  apiRef,
  onNear,
  store,
  cities,
  onCity,
  start,
  bounds,
}: {
  bounds: Geo["bounds"];
  apiRef?: React.MutableRefObject<CameraApi | null>;
  onNear: Near;
  store?: MapCameraStore;
  cities: CityLayout[];
  onCity?: (key: string | null, looking: string | null) => void;
  /** Where to open instead of the whole country (back from the car: where it stopped). */
  start?: { x: number; z: number } | null;
}) {
  const near = useRef(false);
  const lastCity = useRef<string | null | undefined>(undefined);
  const lastCityCheck = useRef(0);
  const flightDone = useRef<(() => void) | null>(null);
  const lastStore = useRef(0);
  const controls = useRef<MapControlsImpl>(null);
  const { size } = useThree();
  const flight = useRef<{ from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number } | null>(null);
  const placed = useRef(false);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      flyTo: (lot, radiusLots = 12) => {
        const c = controls.current;
        if (!c) return;
        const to = lot
          ? (() => {
              const [x, z] = lotToWorld(...lot);
              const d = Math.max(900, radiusLots * LOT * 2.6);
              return [new THREE.Vector3(x, d * 0.75, z + d * 0.7), new THREE.Vector3(x, 0, z)] as [THREE.Vector3, THREE.Vector3];
            })()
          : (() => {
              const p = overviewPose(size.width / size.height, bounds);
              return [p.position, p.target] as [THREE.Vector3, THREE.Vector3];
            })();
        flightDone.current = null;
        flight.current = { from: [c.object.position.clone(), c.target.clone()], to, t: 0 };
      },
      flyToPoint: (x, z, d, done) => {
        const c = controls.current;
        if (!c) return void done?.();
        flightDone.current = done ?? null;
        flight.current = { from: [c.object.position.clone(), c.target.clone()], to: [new THREE.Vector3(x, d * 0.55, z + d * 0.8), new THREE.Vector3(x, 0, z)], t: 0 };
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, size, bounds]);

  // The compass and zoom buttons (MapNavControls), and the minimap's clicks.
  useEffect(
    () =>
      mapNav.subscribe((cmd) => {
        const c = controls.current;
        if (!c) return;
        const pos = c.object.position;
        const tgt = c.target;
        if (cmd.type === "zoom") {
          const to = pos.clone().sub(tgt).multiplyScalar(cmd.factor).add(tgt);
          flight.current = { from: [pos.clone(), tgt.clone()], to: [to, tgt.clone()], t: 0 };
        } else if (cmd.type === "north") {
          const d = pos.distanceTo(tgt);
          const h = pos.y - tgt.y;
          const flat = Math.sqrt(Math.max(1, d * d - h * h));
          flight.current = { from: [pos.clone(), tgt.clone()], to: [new THREE.Vector3(tgt.x, pos.y, tgt.z + flat), tgt.clone()], t: 0 };
        } else if (cmd.type === "flyTo") {
          const d = cmd.distance ?? 2400;
          flight.current = { from: [pos.clone(), tgt.clone()], to: [new THREE.Vector3(cmd.x, d * 0.75, cmd.z + d * 0.7), new THREE.Vector3(cmd.x, 0, cmd.z)], t: 0 };
        }
      }),
    [],
  );

  useFrame(({ camera, scene }, dt) => {
    const c = controls.current;
    if (!c) return;
    if (!placed.current) {
      placed.current = true;
      if (start) {
        camera.position.set(start.x, 900, start.z + 1100);
        c.target.set(start.x, 0, start.z);
      } else {
        const p = overviewPose(size.width / size.height, bounds);
        camera.position.copy(p.position);
        c.target.copy(p.target);
      }
    }
    const f = flight.current;
    if (f) {
      f.t = Math.min(1, f.t + dt / 1.4);
      const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      camera.position.lerpVectors(f.from[0], f.to[0], k);
      c.target.lerpVectors(f.from[1], f.to[1], k);
      if (f.t >= 1) {
        flight.current = null;
        const done = flightDone.current;
        flightDone.current = null;
        done?.();
      }
    }
    // Which city is in view up close (none from high up), told when it changes.
    if (onCity && performance.now() - lastCityCheck.current > 300) {
      lastCityCheck.current = performance.now();
      const dist = camera.position.distanceTo(c.target);
      const city = dist < CITY_VIEW ? cityAt(cities, c.target.x, c.target.z) : null;
      const key = city ? cityKey(city) : null;
      // Below the whole-country view, the city you're looking at (for Drive) even before you're over its streets.
      const looking = dist < overviewDistance(size.width / size.height, bounds) * 0.7 ? cityNearest(cities, c.target.x, c.target.z) : null;
      const both = `${key}|${looking ? cityKey(looking) : ""}`;
      if (both !== lastCity.current) {
        lastCity.current = both;
        onCity(key, looking ? cityKey(looking) : null);
      }
    }
    if (store && performance.now() - lastStore.current > 120) {
      lastStore.current = performance.now();
      store.set(camera.position.x, camera.position.z, c.target.x, c.target.z);
    }
    // Haze scaled to how far up the camera is: the whole country from the top, the streets up close.
    const h = camera.position.distanceTo(c.target);
    const isNear = h < 16000;
    if (isNear !== near.current) {
      near.current = isNear;
      onNear(isNear);
    }
    if (!scene.fog) scene.fog = new THREE.Fog(NIGHT.fogColor, 1, 2);
    const fog = scene.fog as THREE.Fog;
    fog.near = h * 1.6;
    fog.far = h * 5;
    c.update();
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={180}
      maxDistance={Math.max((bounds.maxX - bounds.minX) * 1.6, overviewDistance(size.width / size.height, bounds) * 1.15)}
      maxPolarAngle={Math.PI / 2.4}
    />
  );
}

// ─── Scene ───────────────────────────────────────────────────

export interface BrasilSceneProps {
  /** How big Brazil is drawn (the layout's scale). */
  scale?: number;
  cities: CityLayout[];
  island: CityLayout;
  objects: CityObject[];
  buildings: CityBuilding[];
  cameraApi?: React.MutableRefObject<CameraApi | null>;
  /** Filled with where the camera is, for the compass. */
  cameraStore?: MapCameraStore;
  onTag?: (city: CityLayout) => void;
  onBuildingClick?: (b: CityBuilding) => void;
  /** The building whose card is open (lit up). */
  focused?: string | null;
  /** Drive mode: the car and its world (offline in the preview). */
  drive?: Omit<DriveWorldProps, "objects" | "buildings" | "h" | "smash">;
  smash?: SmashStore;
  /** Up close, the city in view (its cityKey), or null from high up; and the city with people you're looking at, below the whole-country view. */
  onCity?: (key: string | null, looking: string | null) => void;
  /** Open the map camera here instead of the whole country. */
  cameraStart?: { x: number; z: number } | null;
  /** Each office holder's short title (PRES, GOV, SEN, MAYOR) for their name plate. */
  offices?: ReadonlyMap<string, string>;
  /** Logins (lowercase) that arrived in the last day: their name plates say "new". */
  fresh?: ReadonlySet<string>;
  /** Who's out driving, and where each one is now (units): a pin over every car, at any height. */
  drivers?: { id: string; name: string }[];
  driverAt?: (id: string) => { x: number; z: number } | null;
  /** The state of the week: its tag wears the crown. */
  crowned?: UF | null;
  /** Dev only: fps, draw calls and triangles in a corner (the preview's ?stats=1). */
  stats?: boolean;
  /** Everyone out driving, drawn while you look at the map. */
  watching?: CarFeed[];
  /** A lot just taken: a lime ring spreads from it once (a new key plays it again). */
  pulse?: { x: number; z: number; key: number } | null;
  /** A drift run on the town's track: its world, in place of the town's car. */
  drift?: ReactNode;
  /** The track's top five, for the sign by its gate. */
  driftBoard?: BoardRowLite[];
  /** The track's tag on the map: drive there. */
  onDriftTag?: () => void;
}

const WatchedCars = dynamic(() => import("@/components/league/drive/WatchedCars"), { ssr: false, loading: () => null });

/** Fps, draw calls and triangles, written to window.__brasilStats and a corner label (dev only). */
function Stats() {
  const el = useRef<HTMLDivElement | null>(null);
  const frames = useRef({ n: 0, t: 0 });
  useFrame(({ gl }) => {
    const f = frames.current;
    f.n++;
    const now = performance.now();
    if (!f.t) f.t = now;
    if (now - f.t < 1000) return;
    const s = { fps: Math.round((f.n * 1000) / (now - f.t)), calls: gl.info.render.calls, tris: gl.info.render.triangles, geos: gl.info.memory.geometries };
    (window as unknown as { __brasilStats?: typeof s }).__brasilStats = s;
    if (el.current) el.current.textContent = `${s.fps} fps · ${s.calls} calls · ${(s.tris / 1000).toFixed(0)}k tris · ${s.geos} geos`;
    f.n = 0;
    f.t = now;
  });
  return (
    <Html fullscreen zIndexRange={[50, 50]}>
      <div ref={el} className="pointer-events-none fixed bottom-1 right-2 bg-bg/90 px-2 py-1 font-mono text-[11px] text-lime" />
    </Html>
  );
}

/** Trees past this far from the camera aren't drawn: a street's worth up close, none from the whole country. */
const TREE_CULL = { maxDistance: 9000 };
/** Lamps and fountains this close to where the car starts are props it can knock over. */
const KNOCK_PROPS_RADIUS = 2600;

/** A pin over someone's car, following it: who's driving where, readable from the whole country down. */
function DriverPin({ id, name, at }: { id: string; name: string; at: (id: string) => { x: number; z: number } | null }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const p = at(id);
    const g = group.current;
    if (!g) return;
    g.visible = !!p;
    // Just over the car's roof (the ground is at 0).
    if (p) g.position.set(p.x, 14, p.z);
  });
  return (
    <group ref={group} visible={false}>
      <Html center zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex items-center gap-1 whitespace-nowrap border-2 border-lime bg-bg/90 px-1.5 py-0.5 font-pixel text-[9px] normal-case text-cream">
          <span aria-hidden>🚗</span>@{name}
        </div>
      </Html>
    </group>
  );
}

const PULSE_S = 1.8;
const NO_BOARD: BoardRowLite[] = [];

/** Three lime rings spreading from a lot and fading, once. */
function Pulse({ x, z }: { x: number; z: number }) {
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const mats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: "#c8e64a", transparent: true, depthWrite: false, side: THREE.DoubleSide })), []);
  const geo = useMemo(() => new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
    },
    [geo, mats],
  );
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    born.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    g.visible = t < PULSE_S + 0.6;
    g.children.forEach((ring, i) => {
      const k = Math.min(1, Math.max(0, (t - i * 0.3) / PULSE_S));
      const r = 20 + k * LOT * 3;
      ring.scale.set(r, 1, r);
      mats[i].opacity = k > 0 ? (1 - k) * 0.9 : 0;
    });
  });
  return (
    <group ref={group} position={[x, 2, z]}>
      {mats.map((m, i) => (
        <mesh key={i} geometry={geo} material={m} renderOrder={10} />
      ))}
    </group>
  );
}

export default function BrasilScene({ scale = 1, cities, island, objects, buildings, cameraApi, cameraStore, onTag, onBuildingClick, focused = null, drive, smash, pulse = null, watching, onCity, cameraStart = null, stats = false, crowned = null, fresh, offices, drivers, driverAt, drift, driftBoard = NO_BOARD, onDriftTag }: BrasilSceneProps) {
  const allCities = useMemo(() => [...cities, island], [cities, island]);
  // Phones and weak GPUs draw at a lower resolution, as in the main city (?perf=low|high overrides).
  const { mode: perf } = usePerfMode();
  // Dev only: ?off=ground,roads hides layers, to see what each one costs.
  const [hidden] = useState(() => (stats && typeof window !== "undefined" ? new Set((new URLSearchParams(window.location.search).get("off") ?? "").split(",")) : new Set<string>()));
  const off = (layer: string) => hidden.has(layer);
  const drifting = !!drift;
  const driving = !!drive || drifting;
  const [near, setNear] = useState(false);
  // Driving: the trees fall instead of stopping the car (LeagueTrees' knock, so they're out of the colliders),
  // and the lamps and fountains round where the car starts are physics props you can knock over (thousands
  // of them across the country would be too many bodies); their standing copies hide while you drive.
  const spawnAt = useMemo(() => {
    if (!drive) return null;
    if (drive.spawnAt) return [drive.spawnAt.x, drive.spawnAt.z] as [number, number];
    const o = objects.find((x) => x.kind === "building" && x.developer_id === drive.viewerDevId);
    return o ? lotToWorld(o.x, o.z) : null;
  }, [objects, drive]);
  const knockable = useMemo(() => {
    const out = new Set<string>();
    if (!spawnAt) return out;
    for (const o of objects) {
      if (o.item_type !== "lamp" && o.item_type !== "fountain") continue;
      const [x, z] = o.px !== null && o.pz !== null ? [o.px, o.pz] : lotToWorld(o.x, o.z);
      if (Math.hypot(x - spawnAt[0], z - spawnAt[1]) < KNOCK_PROPS_RADIUS) out.add(o.id);
    }
    return out;
  }, [objects, spawnAt]);
  const driveObjects = useMemo(
    () => objects.filter((o) => !TREE_TYPES.includes(o.item_type as TreeType) && ((o.item_type !== "lamp" && o.item_type !== "fountain") || knockable.has(o.id))),
    [objects, knockable],
  );
  const decorations = useMemo(() => decorationsOf(driving ? objects.filter((o) => !knockable.has(o.id)) : objects), [objects, driving, knockable]);
  // Item boxes on the cities' streets, never out on the highways between them.
  const cityStreets = useMemo(() => allCities.flatMap((c) => c.roads.map(([x, z]) => [x, z] as [number, number])).sort((a, b) => a[0] - b[0] || a[1] - b[1]), [allCities]);
  // Trees: a physics bubble round the car (TreeBubble) knocks the nearest ones about; the instanced trees skip those.
  const bubbleTrees = useMemo(
    () =>
      objects
        .filter((o) => TREE_TYPES.includes(o.item_type as TreeType))
        .map((o) => {
          const [x, z] = o.px !== null && o.pz !== null ? [o.px, o.pz] : lotToWorld(o.x, o.z);
          return { id: o.id, x, z, type: o.item_type as TreeType, rot: o.rot };
        }),
    [objects],
  );
  const [hiddenTrees, setHiddenTrees] = useState<{ ids: ReadonlySet<string>; version: number }>({ ids: new Set(), version: 0 });
  const onHiddenTrees = useCallback((ids: ReadonlySet<string>) => setHiddenTrees((h) => ({ ids, version: h.version + 1 })), []);
  const treeCull = useMemo(() => ({ ...TREE_CULL, hidden: hiddenTrees }), [hiddenTrees]);
  const treeBubble = useMemo(() => ({ list: bubbleTrees, onHidden: onHiddenTrees }), [bubbleTrees, onHiddenTrees]);
  const identity = useMemo(() => ({ sky: 0, signSide: null, logoUrl: null, logoRemoved: false, identityVersion: 0 }), []);
  const geo = geoAt(scale);
  const { bounds } = geo;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const [aspect, setAspect] = useState(() => (typeof window === "undefined" ? 1.6 : window.innerWidth / Math.max(1, window.innerHeight)));
  useEffect(() => {
    const on = () => setAspect(window.innerWidth / Math.max(1, window.innerHeight));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const overview = overviewDistance(aspect, bounds);
  return (
    <Canvas
      shadows={false}
      dpr={perf === "low" ? 0.75 : [1, 1.5]}
      camera={{ position: [cx, 40000, cz + 15000], fov: FOV, near: 5, far: 400000 }}
      gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: EXPOSURE }}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
    >
      <ThemeLights theme={NIGHT} themeIndex={NIGHT_KEY} />
      <ThemeSkyFX themeIndex={NIGHT_FX} theme={NIGHT} lowSky />
      {!driving && <MapCamera apiRef={cameraApi} onNear={setNear} store={cameraStore} cities={allCities} onCity={onCity} start={cameraStart} bounds={bounds} />}
      {/* The ground is ~200 static meshes (sea, land, borders, rivers and their banks): merged to a handful of draw calls. */}
      {!off("ground") && (
        <MergedStatic byMaterial>
          <Ground island={island} geo={geo} />
        </MergedStatic>
      )}
      {!off("paving") && <Paving cities={[...cities, island]} />}
      {!off("squares") && <Squares cities={[...cities, island]} />}
      {!off("signs") && <NearSigns cities={allCities} />}
      {!off("decor") && <InstancedDecorations items={decorations} roadMarkingColor={NIGHT.roadMarkingColor} sidewalkColor={NIGHT.sidewalkColor} />}
      {!off("roads") && <LeagueRoads objects={objects} markingColor={NIGHT.roadMarkingColor} />}
      <LeagueToys objects={objects} driving={driving} />
      <Suspense fallback={null}>
        <LeagueTrees objects={objects} cull={treeCull} />
      </Suspense>
      {!off("identity") && <IdentityLayer objects={objects} identity={identity} name="Brasil" h={geo.h} hillColor={LAND} />}
      {!off("buildings") && <CityScene
        buildings={buildings}
        colors={NIGHT.building}
        accentColor={NIGHT.building.accent}
        smash={smash}
        focusedBuilding={driving ? null : focused}
        onBuildingClick={driving ? undefined : onBuildingClick}
      />}
      {smash && !off("buildings") && <RubbleFlags store={smash} />}
      {!driving && <NearPlates buildings={buildings} fresh={fresh} offices={offices} />}
      {!driving && <Tags cities={allCities} near={near} crowned={crowned} onTag={onTag} overview={overview} />}
      {!drifting && <DriftSite board={driftBoard} />}
      {!driving && onDriftTag && <DriftTag record={driftBoard[0] ?? null} onClick={onDriftTag} />}
      {drift}
      {drive && !drifting && <DriveWorld objects={driveObjects} buildings={buildings} h={geo.h} smash={smash} boxSpots={cityStreets} trees={treeBubble} {...drive} />}
      {pulse && !driving && <Pulse key={pulse.key} x={pulse.x} z={pulse.z} />}
      {stats && <Stats />}
      {!driving && watching && watching.length > 0 && <WatchedCars cars={watching} />}
      {!driving && driverAt && drivers?.map((d) => <DriverPin key={d.id} id={d.id} name={d.name} at={driverAt} />)}
    </Canvas>
  );
}

export type { UF };
