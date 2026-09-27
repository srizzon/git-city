"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Claude Code vs Codex: the two mascots and one landmark per side. Voxel
// boxes like the rest of the town; faces glow a little so they read at night.

const CLAWD = "#d97757";
const CLAWD_DARK = "#b85c3d";
const INK = "#141414";
const CLOUD = "#e8f1ff";
const CLOUD_SHADE = "#b9cdf0";
const CYAN = "#4ad8ff";

function Box({
  at,
  size,
  color,
  glow = 0.18,
  emissive,
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  glow?: number;
  emissive?: string;
}) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={emissive ?? color} emissiveIntensity={glow} roughness={0.85} />
    </mesh>
  );
}

/** A canvas texture with pixel-font text, for signs and screens. */
function textTexture(text: string, color: string, bg: string, w = 256, h = 64): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  let size = Math.floor(h * 0.55);
  ctx.font = `${size}px Silkscreen, monospace`;
  while (ctx.measureText(text).width > w * 0.9 && size > 8) {
    size -= 2;
    ctx.font = `${size}px Silkscreen, monospace`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function useTextTexture(text: string, color: string, bg: string, w?: number, h?: number) {
  const tex = useMemo(() => textTexture(text, color, bg, w, h), [text, color, bg, w, h]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function Sign({ map, w, h, at, rotY = 0 }: { map: THREE.Texture; w: number; h: number; at: [number, number, number]; rotY?: number }) {
  return (
    <mesh position={at} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

const SCALE = { small: 1, giant: 7 } as const;
export type MascotSize = keyof typeof SCALE;

// ─── Clawd ───────────────────────────────────────────────────

const PLINTH_STEP = 12;

/**
 * Claude Code's crab: a wide orange block, two black eyes, stubby arms and
 * four legs. Bobs, and blinks now and then.
 */
export function Clawd({ position, rot, size, phase = 0 }: { position: [number, number]; rot: number; size: MascotSize; phase?: number }) {
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const u = 1.6 * SCALE[size];
  // The giant stands on its plinth: the hop starts from the top step, not the ground.
  const base = size === "giant" ? PLINTH_STEP * 3 : 0;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (body.current) body.current.position.y = base + Math.abs(Math.sin(t * 2.2)) * u * 0.25;
    // A blink every ~4s.
    if (eyes.current) eyes.current.scale.y = t % 4 < 0.12 ? 0.15 : 1;
  });
  const legH = 2 * u;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, (-rot * Math.PI) / 180, 0]}>
      {/* The giant stands on a stepped plinth, high enough to clear the towers around the square. */}
      {size === "giant" &&
        [0, 1, 2].map((i) => (
          <Box key={i} at={[0, PLINTH_STEP * (i + 0.5), 0]} size={[(12 - i * 1.6) * u, PLINTH_STEP, (8 - i * 1.2) * u]} color={i % 2 ? "#4a3028" : "#3a2a24"} glow={0.12} />
        ))}
      <group ref={body} position={[0, base, 0]}>
        {[-3.2, -1.2, 1.2, 3.2].map((x) => (
          <Box key={x} at={[x * u, legH / 2, 0]} size={[1 * u, legH, 1.2 * u]} color={CLAWD_DARK} />
        ))}
        <Box at={[0, legH + 2.5 * u, 0]} size={[8 * u, 5 * u, 5 * u]} color={CLAWD} />
        {[-1, 1].map((s) => (
          <Box key={s} at={[s * 4.9 * u, legH + 2.6 * u, 0]} size={[1.8 * u, 1.6 * u, 2 * u]} color={CLAWD} />
        ))}
        <group ref={eyes} position={[0, legH + 3.3 * u, 2.52 * u]}>
          {[-1.9, 1.9].map((x) => (
            <Box key={x} at={[x * u, 0, 0]} size={[0.8 * u, 1.6 * u, 0.1 * u]} color={INK} glow={0} />
          ))}
        </group>
      </group>
    </group>
  );
}

// ─── Codex cloud ─────────────────────────────────────────────

/** Codex's logo come alive: a voxel cloud with a `>_` face, hovering over a glowing pad. */
export function CodexCloud({ position, rot, size, phase = 0 }: { position: [number, number]; rot: number; size: MascotSize; phase?: number }) {
  const cloud = useRef<THREE.Group>(null);
  const cursor = useRef<THREE.Mesh>(null);
  const u = 1.5 * SCALE[size];
  const hover = size === "giant" ? 30 : 4;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (cloud.current) cloud.current.position.y = hover + Math.sin(t * 1.3) * u * 0.6;
    // The underscore blinks like a terminal cursor.
    if (cursor.current) cursor.current.visible = Math.floor(t * 1.6) % 2 === 0;
  });
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, (-rot * Math.PI) / 180, 0]}>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[4 * u, 4.4 * u, 0.8, 24]} />
        <meshStandardMaterial color="#10203f" emissive={CYAN} emissiveIntensity={0.35} />
      </mesh>
      <group ref={cloud}>
        <Box at={[0, 2 * u, 0]} size={[11 * u, 4 * u, 5 * u]} color={CLOUD} glow={0.35} />
        <Box at={[-3 * u, 5 * u, 0]} size={[4 * u, 3 * u, 4.4 * u]} color={CLOUD} glow={0.35} />
        <Box at={[1 * u, 6 * u, 0]} size={[5 * u, 5 * u, 4.6 * u]} color={CLOUD} glow={0.35} />
        <Box at={[4.4 * u, 4.4 * u, 0]} size={[3 * u, 2.4 * u, 4 * u]} color={CLOUD_SHADE} glow={0.3} />
        {/* `>` as two slanted bars, `_` as a blinking bar. */}
        <group position={[-1.6 * u, 3.4 * u, 2.56 * u]}>
          <mesh position={[0, 0.55 * u, 0]} rotation={[0, 0, -0.7]}>
            <boxGeometry args={[1.9 * u, 0.55 * u, 0.1 * u]} />
            <meshStandardMaterial color="#1a2a6c" emissive={CYAN} emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.55 * u, 0]} rotation={[0, 0, 0.7]}>
            <boxGeometry args={[1.9 * u, 0.55 * u, 0.1 * u]} />
            <meshStandardMaterial color="#1a2a6c" emissive={CYAN} emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
        </group>
        <mesh ref={cursor} position={[1.6 * u, 2.4 * u, 2.56 * u]}>
          <boxGeometry args={[2.2 * u, 0.55 * u, 0.1 * u]} />
          <meshStandardMaterial color="#1a2a6c" emissive={CYAN} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ─── Context window (Claude Code landmark) ───────────────────

const FILL_S = 18;

/**
 * A giant app window on legs. Its context bar fills up; when it's full the
 * screen says "Compacting conversation…" and the bar drops back.
 */
export function ContextWindow({ position, rot }: { position: [number, number]; rot: number }) {
  const bar = useRef<THREE.Mesh>(null);
  const compact = useRef<THREE.Mesh>(null);
  const title = useTextTexture("CONTEXT WINDOW", "#ffd23f", "#2a1410", 512, 64);
  const msg = useTextTexture("Compacting conversation…", "#ffd23f", "#140a08", 512, 96);
  const said = useTextTexture("> You're absolutely right!", "#f4e3d7", "#140a08", 512, 96);
  const W = 110;
  const H = 66;
  const base = 46;
  useFrame(({ clock }) => {
    const p = (clock.elapsedTime % FILL_S) / FILL_S;
    const full = p > 0.85;
    const fill = full ? 1 : 0.15 + (p / 0.85) * 0.85;
    if (bar.current) {
      bar.current.scale.x = fill;
      bar.current.position.x = -((W - 12) / 2) * (1 - fill);
    }
    if (compact.current) compact.current.visible = full && Math.floor(clock.elapsedTime * 3) % 2 === 0;
  });
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, (-rot * Math.PI) / 180, 0]}>
      {[-W / 3, W / 3].map((x) => (
        <Box key={x} at={[x, base / 2, 0]} size={[4, base, 4]} color="#3a3f4a" glow={0.2} />
      ))}
      <group position={[0, base + H / 2, 0]}>
        <Box at={[0, 0, 0]} size={[W + 3, H + 3, 2.4]} color={CLAWD} glow={0.3} />
        {/* Title bar with the three window dots. */}
        <Sign map={title} w={W - 24} h={8} at={[6, H / 2 - 5, 1.3]} />
        {["#ff6b6b", "#ffd23f", "#6bd96b"].map((c, i) => (
          <Box key={c} at={[-W / 2 + 5 + i * 5.5, H / 2 - 5, 1.3]} size={[3.6, 3.6, 0.4]} color={c} glow={0.8} />
        ))}
        <Box at={[0, -2.5, 1.25]} size={[W - 6, H - 16, 0.3]} color="#140a08" glow={0.05} />
        <Sign map={said} w={W - 20} h={15} at={[0, 6, 1.5]} />
        <mesh ref={compact} position={[0, -9, 1.55]}>
          <planeGeometry args={[W - 20, 15]} />
          <meshStandardMaterial map={msg} emissiveMap={msg} emissive="#ffffff" emissiveIntensity={0.9} />
        </mesh>
        {/* The context bar, filling left to right. */}
        <Box at={[0, -H / 2 + 7, 1.4]} size={[W - 11, 5.4, 0.3]} color="#3a2a24" glow={0.1} />
        <mesh ref={bar} position={[0, -H / 2 + 7, 1.6]}>
          <boxGeometry args={[W - 12, 4.4, 0.3]} />
          <meshStandardMaterial color="#ffd23f" emissive="#ffd23f" emissiveIntensity={1} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ─── Sandbox (Codex landmark) ────────────────────────────────

/** A literal sandbox: sand pit, fence, a sand castle, a bucket and a sign. */
export function Sandbox({ position, rot }: { position: [number, number]; rot: number }) {
  const sign = useTextTexture("SANDBOX", CYAN, "#0b0f19", 256, 64);
  const note = useTextTexture("network: off  ·  yolo: on", "#e8f1ff", "#0b0f19", 512, 64);
  const S = 62;
  const posts = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = -S / 2; i <= S / 2; i += 6) out.push([i, -S / 2], [i, S / 2], [-S / 2, i], [S / 2, i]);
    return out;
  }, []);
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, (-rot * Math.PI) / 180, 0]} scale={1.4}>
      <Box at={[0, 0.8, 0]} size={[S, 1.6, S]} color="#e8c98a" glow={0.12} />
      {posts.map(([x, z], i) => (
        <Box key={i} at={[x, 2.6, z]} size={[1.2, 4, 1.2]} color="#5b8def" glow={0.4} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box at={[0, 4, s * (S / 2)]} size={[S, 0.8, 0.8]} color="#5b8def" glow={0.5} />
          <Box at={[s * (S / 2), 4, 0]} size={[0.8, 0.8, S]} color="#5b8def" glow={0.5} />
        </group>
      ))}
      {/* Sand castle */}
      <Box at={[0, 4, -4]} size={[18, 5, 12]} color="#d8b673" />
      {[-7, 7].map((x) =>
        [-9, 1].map((z) => <Box key={`${x}${z}`} at={[x, 8, z]} size={[4, 7, 4]} color="#d8b673" />),
      )}
      <Box at={[0, 9.5, -4]} size={[7, 6, 7]} color="#cfa963" />
      <Box at={[0, 14, -4]} size={[0.4, 5, 0.4]} color="#e8f1ff" />
      <Box at={[1.6, 15.5, -4]} size={[3, 2, 0.2]} color={CYAN} glow={0.9} />
      {/* Bucket and shovel */}
      <mesh position={[16, 4, 12]}>
        <cylinderGeometry args={[2.6, 2, 5, 12]} />
        <meshStandardMaterial color="#ff7ad9" emissive="#ff7ad9" emissiveIntensity={0.3} />
      </mesh>
      <Box at={[-15, 3, 13]} size={[1, 1, 9]} color="#8a93a6" />
      <Box at={[-15, 2.4, 18]} size={[3, 0.6, 3]} color={CYAN} glow={0.5} />
      {/* Sign on the front fence */}
      <Box at={[0, 7, S / 2 + 1]} size={[26, 8, 1]} color="#1a2a6c" glow={0.2} />
      <Sign map={sign} w={24} h={6} at={[0, 7, S / 2 + 1.6]} />
      <Sign map={note} w={30} h={3.6} at={[0, 1.8, S / 2 + 1.6]} />
    </group>
  );
}
