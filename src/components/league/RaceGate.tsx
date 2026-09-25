"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { LOT } from "@/lib/league-city/grid";
import { APPROACH_LOTS } from "@/lib/league-city/identity-geometry";

// The way to the town's race track, as a place in the city (Forza Horizon's
// event markers, Disney's "weenie"): the track's own start gantry over the
// approach road, just past the portal. Its lime banner carries the track's
// name; its five lamps light up one by one and go out, slowly, like a start.
// The gantry faces the road, so from the orbit camera it's edge-on: above it
// a sign that always turns to the camera ("▸ Race", the track and its
// record) on a lime beam, the beacon you spot from anywhere. Click either,
// or drive out through the gantry, and you're at the track.

/** Where it stands on the approach road (world z), and the half width a car drives through. */
export const RACE_GATE = {
  z: LOT / 2 + LOT * Math.min(1.3, APPROACH_LOTS - 1),
  halfX: 14,
} as const;

const POST_X = 17;
/** The beacon sign: its height over the road and size (world units). */
const SIGN = { y: 48, w: 52, h: 17 };
const H = 17;
const BANNER = { w: 30, h: 5.2 };
const FONT = "Silkscreen, monospace";
const _dir = new THREE.Vector3();

function canvasTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function fit(g: CanvasRenderingContext2D, text: string, maxW: number, size: number): void {
  let s = size;
  g.font = `${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 12) {
    s -= 2;
    g.font = `${s}px ${FONT}`;
  }
}

export default function RaceGate({
  townName,
  record,
  onClick,
}: {
  townName: string;
  /** The track record, for the plate under the banner ("0:22.912"), or null. */
  record: string | null;
  onClick?: () => void;
}) {
  const [font, setFont] = useState(false);
  useEffect(() => {
    let live = true;
    (document.fonts?.load(`40px ${FONT}`) ?? Promise.resolve())
      .catch(() => null)
      .finally(() => live && setFont(true));
    return () => {
      live = false;
    };
  }, []);

  const banner = useMemo(
    () =>
      canvasTexture(
        (g, w, h) => {
          g.fillStyle = "#c8ff3a";
          g.fillRect(0, 0, w, h);
          g.fillStyle = "#0b0d12";
          g.textAlign = "center";
          g.textBaseline = "middle";
          fit(g, `${townName} GP`, w - 60, 78);
          g.fillText(`${townName} GP`, w / 2, h / 2 + 4);
        },
        1024,
        176,
      ),
    // Redrawn once the pixel font is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [townName, font],
  );
  const plate = useMemo(
    () =>
      canvasTexture(
        (g, w, h) => {
          g.fillStyle = "#0b0d12";
          g.fillRect(0, 0, w, h);
          g.fillStyle = "#c8ff3a";
          g.textAlign = "center";
          g.textBaseline = "middle";
          const text = record ? `Race track  ▸  record ${record}` : "Race track  ▸  set the first lap";
          fit(g, text, w - 40, 40);
          g.fillText(text, w / 2, h / 2 + 2);
        },
        1024,
        72,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [record, font],
  );
  const sign = useMemo(
    () =>
      canvasTexture(
        (g, w, h) => {
          g.fillStyle = "#0b0d12";
          g.fillRect(0, 0, w, h);
          g.strokeStyle = "#c8ff3a";
          g.lineWidth = 12;
          g.strokeRect(6, 6, w - 12, h - 12);
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillStyle = "#c8ff3a";
          g.font = `120px ${FONT}`;
          g.fillText("▸ Race", w / 2, h * 0.4);
          g.fillStyle = "#f4efe6";
          const line = record ? `${townName} GP · ${record}` : `${townName} GP`;
          fit(g, line, w - 80, 52);
          g.fillText(line, w / 2, h * 0.76);
        },
        1024,
        332,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [townName, record, font],
  );
  const checker = useMemo(
    () =>
      canvasTexture(
        (g, w, h) => {
          const n = 16;
          const s = w / n;
          for (let i = 0; i < n; i++)
            for (let j = 0; j < h / s; j++) {
              g.fillStyle = (i + j) % 2 ? "#0b0d12" : "#f4efe6";
              g.fillRect(i * s, j * s, s, s);
            }
        },
        512,
        64,
      ),
    [],
  );
  useEffect(() => () => [banner, plate, sign, checker].forEach((t) => t.dispose()), [banner, plate, sign, checker]);

  // The lamps: one more lit every beat, a hold, then all out, over and over.
  const lamps = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const [hover, setHover] = useState(false);
  const beacon = useRef<THREE.Group>(null);
  useFrame(({ clock, camera }) => {
    // The sign turns about its pole to stay square to the screen.
    const b = beacon.current;
    if (b) {
      camera.getWorldDirection(_dir);
      b.rotation.y = Math.atan2(-_dir.x, -_dir.z);
    }
    const beat = Math.floor(clock.elapsedTime / 0.7) % 8;
    const lit = beat <= 5 ? beat : 0;
    lamps.current.forEach((m, i) => m?.color.set(i % 5 < lit ? "#ff2a2a" : "#2a1416"));
  });
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    return () => void (document.body.style.cursor = "");
  }, [hover]);

  const handlers = onClick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(true);
        },
        onPointerOut: () => setHover(false),
      }
    : {};

  const glow = hover ? 1.15 : 0.85;
  return (
    <group position={[0, 0, RACE_GATE.z]}>
      {[-POST_X, POST_X].map((x) => (
        <mesh key={x} position={[x, H / 2, 0]}>
          <boxGeometry args={[1.6, H, 1.6]} />
          <meshStandardMaterial color="#2a2f3a" emissive="#2a2f3a" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <group position={[0, H, 0]} {...handlers}>
        <mesh>
          <boxGeometry args={[POST_X * 2 + 1.6, 1.4, 1.4]} />
          <meshStandardMaterial color="#1a1d24" emissive="#1a1d24" emissiveIntensity={0.3} />
        </mesh>
        {/* The banner both ways: toward the city and toward the road out. */}
        {[0, Math.PI].map((r) => (
          <group key={r} rotation={[0, r, 0]}>
            <mesh position={[0, BANNER.h / 2 + 0.7, -0.75]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[BANNER.w, BANNER.h]} />
              <meshBasicMaterial map={banner} toneMapped={false} color={new THREE.Color(glow, glow, glow)} />
            </mesh>
            <mesh position={[0, -1.6, -0.75]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[BANNER.w * 0.8, 1.8]} />
              <meshBasicMaterial map={plate} toneMapped={false} />
            </mesh>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} position={[(i - 2) * 2.6, -3.6, -0.75]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[1.6, 1.6]} />
                <meshBasicMaterial ref={(m) => void (lamps.current[(r === 0 ? 0 : 5) + i] = m)} color="#2a1416" toneMapped={false} />
              </mesh>
            ))}
          </group>
        ))}
        {/* A bigger invisible target, so the click lands from far away. */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[POST_X * 2 + 4, 12, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {/* The beacon: a lime beam from the road and the sign on top. */}
      <mesh position={[0, SIGN.y / 2, 0]}>
        <cylinderGeometry args={[0.9, 0.9, SIGN.y, 8, 1, true]} />
        <meshBasicMaterial color="#c8ff3a" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={beacon} position={[0, SIGN.y + SIGN.h / 2, 0]} {...handlers}>
        <mesh>
          <planeGeometry args={[SIGN.w, SIGN.h]} />
          <meshBasicMaterial map={sign} toneMapped={false} side={THREE.DoubleSide} color={new THREE.Color(glow, glow, glow)} />
        </mesh>
      </group>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[RACE_GATE.halfX * 2, 3]} />
        <meshBasicMaterial map={checker} toneMapped={false} />
      </mesh>
    </group>
  );
}
