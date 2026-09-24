"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Volume2, VolumeX, X } from "lucide-react";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { HUD_BOX } from "../shared";
import PauseMenu, { CONTROLS } from "./PauseMenu";
import StartScreen from "./StartScreen";

// Drive mode HUD: speed and a boost light (bottom), camera, mute and exit (top
// right), a controls hint that fades after 6 s, the start screen while Rapier
// loads, and the pause menu. Speed and boost update from the telemetry object every
// animation frame without re-rendering.

const SEG = "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON_BTN = `${SEG} w-10 justify-center py-2 text-cream hover:text-lime`;
const ICON = { size: 14, strokeWidth: 2.5 } as const;


export default function DriveHud({
  telemetry,
  ready,
  camera,
  muted,
  paused,
  onResume,
  onCamera,
  onMute,
  onExit,
}: {
  telemetry: DriveTelemetry;
  ready: boolean;
  camera: DriveCameraMode;
  muted: boolean;
  paused: boolean;
  onResume: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const speed = useRef<HTMLSpanElement>(null);
  const boostTag = useRef<HTMLSpanElement>(null);
  const [hints, setHints] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setHints(false), 6000);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(telemetry.speed) * 3.6));
      if (boostTag.current) boostTag.current.dataset.on = String(telemetry.boosting);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">

      <div className={`${HUD_BOX} absolute right-4 top-4 flex items-stretch divide-x-2 divide-border`}>
        <button
          type="button"
          onClick={onCamera}
          aria-label={camera === "chase" ? "Top-down camera (C)" : "Chase camera (C)"}
          title={camera === "chase" ? "Top-down camera (C)" : "Chase camera (C)"}
          className={ICON_BTN}
        >
          <Camera {...ICON} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? "Sound on" : "Mute"}
          aria-pressed={muted}
          title={muted ? "Sound on" : "Mute"}
          className={ICON_BTN}
        >
          {muted ? <VolumeX {...ICON} aria-hidden /> : <Volume2 {...ICON} aria-hidden />}
        </button>
        <button type="button" onClick={onExit} className={`${SEG} gap-2 px-3 py-2 text-[10px] text-cream hover:text-lime`}>
          <X {...ICON} aria-hidden />
          <span>Exit</span>
        </button>
      </div>

      {ready && (
        <div className={`${HUD_BOX} absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 px-4 py-2`}>
          <div className="flex items-baseline gap-1.5 tabular-nums">
            <span ref={speed} className="w-[3ch] text-right text-lg text-cream">
              0
            </span>
            <span className="text-[9px] text-muted">km/h</span>
          </div>
          <span
            ref={boostTag}
            className="border-2 border-border px-2 py-0.5 text-[9px] text-dim transition-colors data-[on=true]:border-[#7ee8ff] data-[on=true]:text-[#7ee8ff]"
          >
            Shift boost
          </span>
        </div>
      )}

      {ready && (
        <div
          className={`absolute bottom-6 right-6 text-right text-[9px] leading-loose text-muted transition-opacity duration-700 ${hints ? "opacity-100" : "opacity-0"}`}
        >
          {CONTROLS.map(([k, v]) => (
            <div key={k}>
              <span className="text-cream">{k}</span> {v}
            </div>
          ))}
          <div className="normal-case">Gamepad works too</div>
        </div>
      )}

      {/* Last, so they blur and cover the rest of the HUD. */}
      <StartScreen ready={ready} />
      {paused && ready && (
        <PauseMenu camera={camera} muted={muted} onResume={onResume} onCamera={onCamera} onMute={onMute} onExit={onExit} />
      )}
    </div>
  );
}
