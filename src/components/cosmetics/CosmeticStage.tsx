"use client";

import "@/lib/silenceThreeClockWarning";
import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PREVIEW_THEMES, PreviewSky, PreviewGround, PreviewLights, PreviewBuilding, PreviewVehicle } from "./previewScene";
import { cosmeticVisual, type BuildingVisualOpts } from "./itemRenderers";
import RaidTag3D from "@/components/RaidTag3D";
import type { Cosmetic, CosmeticSlot } from "@/lib/cosmetics/types";

/** How a cosmetic is staged: on the building, standalone, or no 3D model. */
export type StageKind = "building" | "vehicle" | "tag" | "utility";

// ─── Shared live preview stage ────────────────────────────────────────────
// One immersive 3D "stage" used by the Shop, the Customize screen, and the
// admin editor — the same renderer everywhere, so "view" and "own" never
// diverge (the Fortnite/Valorant lesson). It draws the player's building with
// a set of cosmetics on it, across the 4 city themes, with rotate/zoom, a
// hide-UI clean view, and item-aware camera framing.

export interface StageCosmetic {
  cosmetic: Cosmetic;
  /** Per-cosmetic billboard images (faces slot only). */
  billboardImages?: string[];
}

const DEFAULT_DIMS = { width: 18, height: 40, depth: 18 };

// Item-aware camera: crown/roof cosmetics live near the top, so frame there.
function viewFor(focusSlot: CosmeticSlot | null, height: number) {
  const wide = { cam: [62, 52, 82] as [number, number, number], target: [0, height * 0.5, 0] as [number, number, number], fov: 42, min: 30, max: 220 };
  if (focusSlot === "crown") return { cam: [40, height + 14, 56] as [number, number, number], target: [0, height + 4, 0] as [number, number, number], fov: 40, min: 16, max: 220 };
  if (focusSlot === "roof") return { cam: [44, height + 8, 58] as [number, number, number], target: [0, height - 1, 0] as [number, number, number], fov: 40, min: 16, max: 220 };
  return wide;
}

export default function CosmeticStage({
  dims = DEFAULT_DIMS,
  cosmetics,
  faceColor,
  focusSlot = null,
  kind = "building",
  focusId,
  defaultThemeIdx,
  className,
  hint,
}: {
  dims?: { width: number; height: number; depth: number };
  /** Everything to draw on the building right now (equipped + any preview override). */
  cosmetics: StageCosmetic[];
  /** Tints the building face (custom_color / template "tint"). */
  faceColor?: string | null;
  /** Frames the camera on this slot's region. */
  focusSlot?: CosmeticSlot | null;
  /** How to stage the focused cosmetic: on building, standalone vehicle, tag, or no model. */
  kind?: StageKind;
  /** Id of the focused vehicle/tag (for the standalone renderers). */
  focusId?: string;
  defaultThemeIdx?: number;
  className?: string;
  hint?: string;
}) {
  const [themeIdx, setThemeIdx] = useState(defaultThemeIdx ?? Math.max(0, PREVIEW_THEMES.findIndex((t) => t.name === "Emerald")));
  const [autoRotate, setAutoRotate] = useState(true);
  const [showBuilding, setShowBuilding] = useState(true);
  const [hideUI, setHideUI] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const theme = PREVIEW_THEMES[themeIdx];

  const clamped = useMemo(() => ({
    width: Math.max(16, dims.width),
    height: Math.min(58, Math.max(28, dims.height)),
    depth: Math.max(14, dims.depth),
  }), [dims.width, dims.height, dims.depth]);

  const view = useMemo(() => {
    if (kind === "vehicle") return { cam: [0, 4, 15] as [number, number, number], target: [0, 2, 0] as [number, number, number], fov: 40, min: 5, max: 60 };
    return viewFor(focusSlot, clamped.height);
  }, [kind, focusSlot, clamped.height]);

  const opts = (extra?: Partial<BuildingVisualOpts>): BuildingVisualOpts => ({
    width: clamped.width, height: clamped.height, depth: clamped.depth, color: theme.accent, ...extra,
  });

  const resetView = () => {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(...view.target);
    c.object.position.set(...view.cam);
    c.update();
  };

  return (
    <div className={`relative overflow-hidden border-[3px] border-border ${className ?? ""}`} style={{ backgroundColor: theme.fogColor }}>
      <div className="h-72 sm:h-96 lg:h-[34rem]">
        <Canvas key={`${themeIdx}:${kind}:${focusSlot}`} camera={{ position: view.cam, fov: view.fov, near: 0.5, far: 2000 }} gl={{ antialias: false }}>
          <color attach="background" args={[theme.fogColor]} />
          <fog attach="fog" args={[theme.fogColor, clamped.height * 2, clamped.height * 8]} />
          <PreviewSky stops={theme.sky} />
          <PreviewLights theme={theme} />
          {/* Vehicles fly during raids — no ground (it would slice them in half). */}
          {kind !== "vehicle" && <PreviewGround color={theme.groundColor} grid={theme.grid} />}

          {/* Vehicles stage standalone; building/tag cosmetics stage on the tower. */}
          {kind === "vehicle" ? (
            focusId && (
              <group position={[0, 2, 0]}>
                <PreviewVehicle type={focusId} />
              </group>
            )
          ) : (
            <>
              {showBuilding && (
                <PreviewBuilding theme={theme} width={clamped.width} height={clamped.height} depth={clamped.depth} faceOverride={faceColor ?? undefined} />
              )}
              {cosmetics.map(({ cosmetic, billboardImages }) => (
                <group key={cosmetic.id}>
                  {cosmeticVisual(cosmetic, opts(billboardImages ? { billboardImages } : undefined))}
                </group>
              ))}
              {kind === "tag" && focusId && (
                <RaidTag3D width={clamped.width} height={clamped.height} depth={clamped.depth} attackerLogin="preview" tagStyle={focusId} />
              )}
            </>
          )}

          <OrbitControls
            ref={controlsRef as never}
            enableDamping
            dampingFactor={0.06}
            target={view.target}
            minDistance={view.min}
            maxDistance={view.max}
            maxPolarAngle={Math.PI / 2.05}
            autoRotate={autoRotate}
            autoRotateSpeed={0.5}
          />
        </Canvas>
      </div>

      {/* Floating controls (Apex-style: a clean "hide UI" toggle is always reachable). */}
      {!hideUI && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
          <div className="pointer-events-auto flex flex-wrap gap-1.5">
            <StageBtn active={autoRotate} onClick={() => setAutoRotate((v) => !v)}>{autoRotate ? "rotating" : "rotate"}</StageBtn>
            <StageBtn onClick={resetView}>reset</StageBtn>
            {kind !== "vehicle" && <StageBtn active={showBuilding} onClick={() => setShowBuilding((v) => !v)}>building</StageBtn>}
            <StageBtn onClick={() => setHideUI(true)}>hide ui</StageBtn>
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5 border border-border bg-bg/70 px-1.5 py-1 backdrop-blur-sm">
            {PREVIEW_THEMES.map((th, i) => (
              <button
                key={th.name}
                title={th.name}
                onClick={() => setThemeIdx(i)}
                className={`h-3.5 w-3.5 rounded-full border ${themeIdx === i ? "border-cream" : "border-transparent"}`}
                style={{ background: th.accent }}
              />
            ))}
          </div>
        </div>
      )}
      {hideUI && (
        <button onClick={() => setHideUI(false)} className="absolute bottom-2 right-2 border border-border bg-bg/70 px-2 py-0.5 text-[9px] uppercase text-muted backdrop-blur-sm hover:text-cream">
          show ui
        </button>
      )}
      {hint && !hideUI && (
        <span className="pointer-events-none absolute left-2 top-2 bg-bg/80 px-2 py-0.5 text-[9px] text-muted">{hint}</span>
      )}
    </div>
  );
}

function StageBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border bg-bg/70 px-2 py-0.5 text-[9px] uppercase backdrop-blur-sm transition-colors ${active ? "border-lime/50 text-lime" : "border-border text-muted hover:text-cream"}`}
    >
      {children}
    </button>
  );
}
