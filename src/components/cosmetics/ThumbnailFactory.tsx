"use client";

import { useRef, Suspense } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PREVIEW_THEMES, PreviewLights, PreviewBuilding } from "./previewScene";
import { VehicleMesh } from "@/components/RaidSequence3D";
import RaidTag3D from "@/components/RaidTag3D";
import { cosmeticVisual, classifyItem, PREVIEW_BD, PREVIEW_VIEWS } from "./itemRenderers";
import type { Cosmetic } from "@/lib/cosmetics/types";

// ─── Card thumbnail factory ────────────────────────────────────
// The browser caps live WebGL contexts (~16), so we can't give every grid
// card its own Canvas. Instead this renders ONE offscreen Canvas that draws
// a single item, snapshots it to a PNG data URL, then advances to the next.
// The parent passes `next` (the first item still missing a thumbnail) and
// gets a data URL back via onThumb. Fixed Midnight theme = stable thumbnails.

const THEME = PREVIEW_THEMES.find((t) => t.name === "Emerald") ?? PREVIEW_THEMES[0];

export interface ThumbItem { id: string; zone: string | null; shop_section?: string | null; render_kind?: string | null; render_spec?: Record<string, unknown> | null }

// Reads the canvas after a few frames (so animated effects have started)
// and hands the PNG back. Only reads `gl` — never mutates hook state.
function Snapshot({ onShot }: { onShot: (url: string) => void }) {
  const { gl } = useThree();
  const frame = useRef(0);
  useFrame(() => {
    frame.current += 1;
    if (frame.current === 7) onShot(gl.domElement.toDataURL("image/png"));
  });
  return null;
}

function Content({ item }: { item: ThumbItem }) {
  const kind = classifyItem(item);
  const onBuilding = kind === "building" || kind === "tag";
  return (
    <>
      <PreviewLights theme={THEME} />
      {onBuilding && (
        <PreviewBuilding theme={THEME} faceOverride={item.id === "custom_color" ? THEME.accent : undefined} />
      )}
      {kind === "building" && cosmeticVisual(
        {
          id: item.id,
          slot: (item.zone ?? null) as Cosmetic["slot"],
          render_kind: (item.render_kind ?? "code") as Cosmetic["render_kind"],
          render_spec: (item.render_spec ?? { key: item.id }) as unknown as Cosmetic["render_spec"],
        },
        { width: PREVIEW_BD.width, height: PREVIEW_BD.height, depth: PREVIEW_BD.depth, color: THEME.accent, billboardImages: [] }
      )}
      {kind === "tag" && (
        <RaidTag3D width={PREVIEW_BD.width} height={PREVIEW_BD.height} depth={PREVIEW_BD.depth} attackerLogin="preview" tagStyle={item.id} />
      )}
      {kind === "vehicle" && <VehicleMesh type={item.id} propagateSuspense />}
    </>
  );
}

export default function ThumbnailFactory({ next, onThumb }: { next: ThumbItem | null; onThumb: (id: string, url: string) => void }) {
  if (!next) return null;
  const v = PREVIEW_VIEWS[classifyItem(next)];
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 220, height: 220, opacity: 0, pointerEvents: "none" }}>
      <Canvas key={next.id} gl={{ preserveDrawingBuffer: true, antialias: false }} camera={{ position: v.cam, fov: v.fov, near: 0.5, far: 2000 }}>
        <color attach="background" args={[THEME.fogColor]} />
        {/* enableDamping keeps update() running each frame so the camera is
            aimed at target before we snapshot. Input is disabled (offscreen). */}
        <OrbitControls target={v.target} enableDamping dampingFactor={0.2} enableRotate={false} enableZoom={false} enablePan={false} />
        {/* Snapshot + Content share one Suspense: while an async GLB loads, both
            unmount, so the snapshot only fires once the model is actually drawn. */}
        <Suspense fallback={null}>
          <Snapshot onShot={(url) => onThumb(next.id, url)} />
          <Content item={next} />
        </Suspense>
      </Canvas>
    </div>
  );
}
