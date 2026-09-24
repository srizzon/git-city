"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Volume2, VolumeX, X } from "lucide-react";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import PixelSpinner from "@/components/leagues/PixelSpinner";
import { HUD_BOX } from "../shared";

// Drive mode HUD: speed and boost meter (bottom), camera, mute and exit (top
// right), a controls hint that fades after 6 s, and "Starting engine…" while
// Rapier loads. Speed and boost update from the telemetry object every
// animation frame without re-rendering.

const SEG = "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON_BTN = `${SEG} w-10 justify-center py-2 text-cream hover:text-lime`;
const ICON = { size: 14, strokeWidth: 2.5 } as const;

const HINTS: [string, string][] = [
  ["W A S D", "drive"],
  ["Space", "drift"],
  ["Shift", "boost"],
  ["H", "horn"],
  ["C", "camera"],
  ["R", "reset"],
  ["Esc", "exit"],
];

export default function DriveHud({
  telemetry,
  ready,
  camera,
  muted,
  onCamera,
  onMute,
  onExit,
}: {
  telemetry: DriveTelemetry;
  ready: boolean;
  camera: DriveCameraMode;
  muted: boolean;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const speed = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
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
      if (bar.current) {
        bar.current.style.transform = `scaleX(${telemetry.boosting ? 1 : telemetry.boost})`;
        bar.current.dataset.state = telemetry.boosting ? "burn" : telemetry.boost >= 1 ? "ready" : "charging";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 text-[10px] text-cream">
          <PixelSpinner />
          Starting engine…
        </div>
      )}

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
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted">Boost</span>
            <div className="h-2.5 w-24 border-2 border-border bg-bg">
              <div
                ref={bar}
                className="h-full origin-left bg-lime data-[state=burn]:bg-[#7ee8ff] data-[state=charging]:bg-dim"
              />
            </div>
          </div>
        </div>
      )}

      {ready && (
        <div
          className={`absolute bottom-6 right-6 text-right text-[9px] leading-loose text-muted transition-opacity duration-700 ${hints ? "opacity-100" : "opacity-0"}`}
        >
          {HINTS.map(([k, v]) => (
            <div key={k}>
              <span className="text-cream">{k}</span> {v}
            </div>
          ))}
          <div className="normal-case">Gamepad works too</div>
        </div>
      )}
    </div>
  );
}
