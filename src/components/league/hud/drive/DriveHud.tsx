"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Volume2, VolumeX, X } from "lucide-react";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import { ITEM_NAMES, isItem } from "@/lib/league-city/drive/battle";
import { HUD_BOX } from "../shared";
import PauseMenu, { CONTROLS } from "./PauseMenu";
import StartScreen from "./StartScreen";
import CrownPanel from "./CrownPanel";
import CopyLink from "./CopyLink";
import type { CrownState } from "@/lib/league-city/drive/crown";

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
  drivers,
  crown,
  onStartCrown,
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
  /** Everyone else driving in this city right now. */
  drivers: DriverInfo[];
  /** Crown Rush state from the drive room. */
  crown: { crown: CrownState; offset: number; you: string | null } | null;
  onStartCrown: () => void;
  onResume: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const speed = useRef<HTMLSpanElement>(null);
  const boostTag = useRef<HTMLSpanElement>(null);
  const honk = useRef<HTMLDivElement>(null);
  const itemSlot = useRef<HTMLSpanElement>(null);
  const honkName = useRef<HTMLSpanElement>(null);
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
      if (itemSlot.current) {
        const held = isItem(telemetry.held) ? telemetry.held : null;
        itemSlot.current.textContent = held ? `F  ${ITEM_NAMES[held]}` : "No attack";
        itemSlot.current.dataset.state = !held ? "empty" : performance.now() - telemetry.gotAt < 900 ? "new" : "held";
      }
      if (honk.current && honkName.current) {
        honk.current.dataset.on = String(!!telemetry.near);
        if (telemetry.near) honkName.current.textContent = `@${telemetry.near}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">

      {ready && (
        <div className={`${HUD_BOX} absolute left-4 top-4 flex flex-col gap-1.5 px-3 py-2 text-[9px]`}>
          <p className="flex items-center gap-2 text-cream">
            <span className="h-1.5 w-1.5 animate-pulse bg-lime" aria-hidden />
            {drivers.length + 1} driving now
          </p>
          {drivers.length === 0 ? (
            <div className="flex max-w-[180px] flex-col items-start gap-1.5">
              <p className="text-dim normal-case">Share the link to race your team here.</p>
              <CopyLink />
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {drivers.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2" style={{ background: carColor(d.name) }} aria-hidden />
                  {d.name.startsWith("guest-") ? "guest" : `@${d.name}`}
                </li>
              ))}
              {drivers.length > 6 && <li className="text-dim">+{drivers.length - 6} more</li>}
            </ul>
          )}
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
        <div
          ref={honk}
          data-on="false"
          className={`${HUD_BOX} absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-[10px] text-cream opacity-0 transition-opacity data-[on=true]:opacity-100`}
        >
          <span className="border-2 border-lime px-1.5 text-lime">H</span>
          Honk at <span ref={honkName} className="text-lime" />
        </div>
      )}

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
          <span
            ref={itemSlot}
            data-state="empty"
            className="min-w-[128px] whitespace-pre border-2 border-border px-2 py-0.5 text-center text-[9px] text-dim transition-colors data-[state=held]:border-[#ff5ad8] data-[state=held]:text-[#ff9be8] data-[state=new]:border-[#ff5ad8] data-[state=new]:bg-[#ff5ad8] data-[state=new]:text-bg"
          >
            No attack
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

      {ready && <CrownPanel crown={crown?.crown ?? null} offset={crown?.offset ?? 0} you={crown?.you ?? null} drivers={drivers} onStart={onStartCrown} />}

      {/* Last, so they blur and cover the rest of the HUD. */}
      <StartScreen ready={ready} />
      {paused && ready && (
        <PauseMenu camera={camera} muted={muted} onResume={onResume} onCamera={onCamera} onMute={onMute} onExit={onExit} />
      )}
    </div>
  );
}
