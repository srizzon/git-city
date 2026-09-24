"use client";

// Instanced versions of the three most common building cosmetics — claimed
// roofline trim, streak corner strips and the free claim flag. Rendered per
// building they were ~1,300 meshes (each with its own material) at the default
// view; here they are 5 draw calls total, however many buildings show them.
// Looks match the per-building components in Building3D / BuildingEffects,
// which the shop and previews still use.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import { tierFromLevel } from "@/lib/xp";
import { TAG_THEMES, raidTagLayout, type TagTheme } from "./RaidTag3D";
import { createLedTexture } from "./SkyAds";

// ClaimedGlow dimensions
const TRIM_T = 1.2;
const TRIM_H = 2;
// Emissive-dominated standard materials (emissive ×N, toneMapped off) read as
// flat color × N; an unlit material with color × (N + ambient share) matches.
const TRIM_GAIN = 3.2;
// StreakFlame
const STRIP_W = 1.2;
// Flag
const POLE_H = 10;

const _box = new THREE.BoxGeometry(1, 1, 1);
const _plane = new THREE.PlaneGeometry(1, 1);
const _pole = new THREE.CylinderGeometry(0.25, 0.35, POLE_H, 6);
const _tip = new THREE.SphereGeometry(0.5, 8, 8);

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

function streakFill(days: number) {
  return Math.min(1, days <= 1 ? 0.1 : days < 7 ? days / 30 : days < 14 ? 0.5 : days < 30 ? 0.75 : 1);
}
function streakIntensity(days: number) {
  return days >= 30 ? 5 : days >= 14 ? 4 : days >= 7 ? 3 : 2;
}

/** Capacity rounded up to a power of two so small set changes don't realloc. */
const cap = (needed: number) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, needed))));

function setMatrix(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _q.identity();
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

export default function InstancedEffects({
  buildings,
  flagBuildings,
  farTagBuildings,
  accentColor,
}: {
  /** Active, visible buildings (not dimmed/hidden). */
  buildings: CityBuilding[];
  /** Subset whose crown slot shows the flag. */
  flagBuildings: CityBuilding[];
  /** Subset whose raid tag is too small on screen for its LED text. */
  farTagBuildings: CityBuilding[];
  accentColor: string;
}) {
  const tagsByTheme = useMemo(() => {
    const m = new Map<string, CityBuilding[]>();
    for (const b of farTagBuildings) {
      const style = TAG_THEMES[b.active_raid_tag!.tag_style] ? b.active_raid_tag!.tag_style : "default";
      (m.get(style) ?? m.set(style, []).get(style)!).push(b);
    }
    return [...m.entries()];
  }, [farTagBuildings]);

  const claimed = useMemo(() => buildings.filter((b) => b.claimed), [buildings]);
  const streaks = useMemo(() => buildings.filter((b) => b.app_streak > 0), [buildings]);

  const trimMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const stripMat = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }),
    [],
  );
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#888899", metalness: 0.7, roughness: 0.3 }), []);
  const tipMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ccccdd", metalness: 0.8 }), []);
  const clothMat = useMemo(() => new THREE.MeshStandardMaterial({ emissiveIntensity: 0.5, side: THREE.DoubleSide }), []);
  useEffect(() => {
    clothMat.color.set(accentColor);
    clothMat.emissive.set(accentColor);
  }, [clothMat, accentColor]);
  useEffect(() => () => { trimMat.dispose(); stripMat.dispose(); poleMat.dispose(); tipMat.dispose(); clothMat.dispose(); }, [trimMat, stripMat, poleMat, tipMat, clothMat]);

  const trims = useRef<THREE.InstancedMesh>(null);
  const strips = useRef<THREE.InstancedMesh>(null);
  const poles = useRef<THREE.InstancedMesh>(null);
  const tips = useRef<THREE.InstancedMesh>(null);
  const cloths = useRef<THREE.InstancedMesh>(null);
  const frame = useRef(0);
  const trimCap = cap(claimed.length * 4);
  const stripCap = cap(streaks.length * 4);
  const flagCap = cap(flagBuildings.length);
  // Stable per capacity: a new array in `args` would rebuild the attribute.
  const trimColors = useMemo(() => new Float32Array(trimCap * 3), [trimCap]);
  const stripColors = useMemo(() => new Float32Array(stripCap * 3), [stripCap]);

  // Claimed trim: 4 bars around the roofline, owner's XP-tier color.
  useEffect(() => {
    const trim = trims.current;
    if (!trim) return;
    let i = 0;
    for (const b of claimed) {
      const y = b.height - TRIM_H / 2;
      const hw = b.width / 2 + TRIM_T / 2;
      const hd = b.depth / 2 + TRIM_T / 2;
      const [x, , z] = b.position;
      _c.set(tierFromLevel(b.xp_level ?? 1).color).multiplyScalar(TRIM_GAIN);
      setMatrix(trim, i, x, y, z + hd, b.width + TRIM_T * 2, TRIM_H, TRIM_T); trim.setColorAt(i++, _c);
      setMatrix(trim, i, x, y, z - hd, b.width + TRIM_T * 2, TRIM_H, TRIM_T); trim.setColorAt(i++, _c);
      setMatrix(trim, i, x - hw, y, z, TRIM_T, TRIM_H, b.depth); trim.setColorAt(i++, _c);
      setMatrix(trim, i, x + hw, y, z, TRIM_T, TRIM_H, b.depth); trim.setColorAt(i++, _c);
    }
    trim.count = i;
    trim.instanceMatrix.needsUpdate = true;
    if (trim.instanceColor) trim.instanceColor.needsUpdate = true;
  }, [claimed, trimCap]);

  // Streak: glowing strips up the 4 corners, height/brightness by streak length.
  useEffect(() => {
    const strip = strips.current;
    if (!strip) return;
    let i = 0;
    for (const b of streaks) {
      const h = b.height * streakFill(b.app_streak);
      const hw = b.width / 2, hd = b.depth / 2;
      const [x, , z] = b.position;
      _c.set(accentColor).multiplyScalar(streakIntensity(b.app_streak) + 0.2);
      for (const [cx, cz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
        setMatrix(strip, i, x + cx, h / 2, z + cz, STRIP_W, h, STRIP_W);
        strip.setColorAt(i++, _c);
      }
    }
    strip.count = i;
    strip.instanceMatrix.needsUpdate = true;
    if (strip.instanceColor) strip.instanceColor.needsUpdate = true;
  }, [streaks, stripCap, accentColor]);

  // Flag: static pole + tip.
  useEffect(() => {
    const pole = poles.current, tip = tips.current, cloth = cloths.current;
    if (!pole || !tip || !cloth) return;
    let i = 0;
    for (const b of flagBuildings) {
      const x = b.position[0] + b.width * 0.45, y = b.height, z = b.position[2] + b.depth * 0.45;
      setMatrix(pole, i, x, y + POLE_H / 2, z, 1, 1, 1);
      setMatrix(tip, i, x, y + POLE_H + 0.4, z, 1, 1, 1);
      i++;
    }
    pole.count = tip.count = cloth.count = i;
    pole.instanceMatrix.needsUpdate = tip.instanceMatrix.needsUpdate = true;
    frame.current = 0; // place the cloths on the next frame
  }, [flagBuildings, flagCap]);

  // Flag cloth: every flag waves in sync (same clock), updated every 3rd frame
  // like the original.
  useFrame(({ clock }) => {
    const cloth = cloths.current;
    if (!cloth || flagBuildings.length === 0 || frame.current++ % 3 !== 0) return;
    const t = clock.elapsedTime;
    const offX = Math.sin(t * 3) * 0.2 + 2.5;
    _q.setFromEuler(_e.set(0, Math.sin(t * 2) * 0.2, 0));
    _s.set(5, 3, 1);
    for (let i = 0; i < flagBuildings.length; i++) {
      const b = flagBuildings[i];
      _p.set(b.position[0] + b.width * 0.45 + offX, b.height + POLE_H - 1.5, b.position[2] + b.depth * 0.45);
      cloth.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    cloth.instanceMatrix.needsUpdate = true;
  });

  // Remount (key) when a capacity bucket changes; every instance is an
  // on-screen building (EffectsLayer already culled), so skip frustum tests.
  return (
    <>
      <instancedMesh key={`t${trimCap}`} ref={trims} args={[_box, trimMat, trimCap]} count={0} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[trimColors, 3]} />
      </instancedMesh>
      <instancedMesh key={`s${stripCap}`} ref={strips} args={[_box, stripMat, stripCap]} count={0} frustumCulled={false}>
        <instancedBufferAttribute attach="instanceColor" args={[stripColors, 3]} />
      </instancedMesh>
      <instancedMesh key={`p${flagCap}`} ref={poles} args={[_pole, poleMat, flagCap]} count={0} frustumCulled={false} />
      <instancedMesh key={`h${flagCap}`} ref={tips} args={[_tip, tipMat, flagCap]} count={0} frustumCulled={false} />
      <instancedMesh key={`c${flagCap}`} ref={cloths} args={[_plane, clothMat, flagCap]} count={0} frustumCulled={false} />
      {tagsByTheme.map(([style, list]) => (
        <FarRaidTags key={style} theme={TAG_THEMES[style]} buildings={list} />
      ))}
    </>
  );
}

// ─── Raid tag far LOD ─────────────────────────────────────────

// Average linear color of a representative LED texture for a theme: what the
// panel's texels blend to once the text is too small to resolve.
const ledAverage = new Map<string, THREE.Color>();
const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
function averageLedColor(theme: TagTheme): THREE.Color {
  const key = `${theme.color}|${theme.bg}`;
  const hit = ledAverage.get(key);
  if (hit) return hit;
  const { tex } = createLedTexture("@RAIDER WAS HERE", theme.color, theme.bg);
  const img = tex.image as HTMLCanvasElement;
  const px = img.getContext("2d")!.getImageData(0, 0, img.width, img.height).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += SRGB_TO_LINEAR[px[i]]; g += SRGB_TO_LINEAR[px[i + 1]]; b += SRGB_TO_LINEAR[px[i + 2]]; }
  const n = px.length / 4;
  tex.dispose();
  const avg = new THREE.Color(r / n, g / n, b / n); // already linear
  ledAverage.set(key, avg);
  return avg;
}

function FarRaidTags({ theme, buildings }: { theme: TagTheme; buildings: CityBuilding[] }) {
  const frames = useRef<THREE.InstancedMesh>(null);
  const panels = useRef<THREE.InstancedMesh>(null);
  const capacity = cap(buildings.length * 2);

  // Frame: same material as RaidTag3D. Panel: unlit average LED color, scaled
  // by the theme's emissive intensity like the original emissiveMap.
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: theme.frameColor, emissive: theme.frameEmissive, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.4,
  }), [theme]);
  const panelMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false });
    m.color.copy(averageLedColor(theme)).multiplyScalar(theme.intensity);
    return m;
  }, [theme]);
  useEffect(() => () => { frameMat.dispose(); panelMat.dispose(); }, [frameMat, panelMat]);

  useEffect(() => {
    const fr = frames.current, pa = panels.current;
    if (!fr || !pa) return;
    let i = 0;
    for (const b of buildings) {
      const { panelW, panelH, frameT, yPos, zFront, zBack } = raidTagLayout(b.width, b.height, b.depth);
      const [x, , z] = b.position;
      const y = yPos;
      // front
      setMatrix(fr, i, x, y, z + zFront - 0.2, panelW + frameT * 2, panelH + frameT * 2, 0.3);
      _q.identity(); _p.set(x, y, z + zFront + 0.02); _s.set(panelW, panelH, 1);
      pa.setMatrixAt(i++, _m.compose(_p, _q, _s));
      // back (plane turned around to face outward)
      setMatrix(fr, i, x, y, z + zBack + 0.2, panelW + frameT * 2, panelH + frameT * 2, 0.3);
      _q.setFromEuler(_e.set(0, Math.PI, 0)); _p.set(x, y, z + zBack - 0.02);
      pa.setMatrixAt(i++, _m.compose(_p, _q, _s));
    }
    fr.count = pa.count = i;
    fr.instanceMatrix.needsUpdate = pa.instanceMatrix.needsUpdate = true;
  }, [buildings, capacity]);

  return (
    <>
      <instancedMesh key={`f${capacity}`} ref={frames} args={[_box, frameMat, capacity]} count={0} frustumCulled={false} />
      <instancedMesh key={`l${capacity}`} ref={panels} args={[_plane, panelMat, capacity]} count={0} frustumCulled={false} />
    </>
  );
}
