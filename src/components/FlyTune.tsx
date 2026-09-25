"use client";

// Live flight tuning (?tune=1 in fly mode). Defaults are Sam's tuned values (2026-09-25). The flight loop reads FLY_TUNE every
// frame, so dragging a slider changes the feel immediately; "copy" puts the
// values on the clipboard to bake them in as defaults.
import { useState } from "react";

export const FLY_TUNE = {
  /** Boost multiplier on the base speed while Shift is held. */
  boost: 18,
  /** How fast speed eases toward its target (1/s). */
  speedEase: 2.2,
  /** Camera arm length behind the plane. */
  camDist: 74,
  /** Camera height above the plane. */
  camHeight: 24,
  /** How fast the camera swings in behind a turn (1/s): lower = lazier. */
  camYawLag: 6.3,
  /** How fast the camera follows a climb or dive (1/s). */
  camHeightLag: 4.2,
  /** How fast turning ramps in and out (1/s). */
  turnEase: 9.5,
  /** How fast climbing ramps in and out (1/s). */
  climbEase: 6.5,
  /** Extra field of view at full boost (degrees). */
  fovKick: 10,
};

type Key = keyof typeof FLY_TUNE;
const RANGES: Record<Key, [number, number, number]> = {
  boost: [1, 30, 0.5],
  speedEase: [0.3, 6, 0.1],
  camDist: [20, 120, 1],
  camHeight: [0, 60, 1],
  camYawLag: [0.5, 15, 0.1],
  camHeightLag: [0.5, 15, 0.1],
  turnEase: [1, 20, 0.5],
  climbEase: [1, 20, 0.5],
  fovKick: [0, 35, 1],
};

export function FlyTunePanel() {
  const [, force] = useState(0);
  return (
    <div className="fixed right-3 top-16 z-[100] w-64 bg-black/85 p-3 font-pixel text-[10px] normal-case text-lime-200">
      {(Object.keys(FLY_TUNE) as Key[]).map((k) => {
        const [min, max, step] = RANGES[k];
        return (
          <label key={k} className="mb-1.5 block">
            <span className="flex justify-between"><span>{k}</span><span>{FLY_TUNE[k]}</span></span>
            <input
              type="range" min={min} max={max} step={step} value={FLY_TUNE[k]}
              onChange={(e) => { FLY_TUNE[k] = Number(e.target.value); force((n) => n + 1); }}
              className="w-full"
            />
          </label>
        );
      })}
      <button
        type="button"
        className="mt-1 w-full border border-lime-300/60 py-1"
        onClick={() => navigator.clipboard?.writeText(JSON.stringify(FLY_TUNE))}
      >
        copy values
      </button>
    </div>
  );
}
