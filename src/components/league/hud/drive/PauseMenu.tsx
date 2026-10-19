"use client";

import { useEffect, useRef, useState } from "react";
import { Backdrop, Band, Chip } from "@/components/games/ui";
import { KEYS_ONLY, T } from "@/components/games/kit";
import type { DriveCameraMode } from "@/lib/league-city/drive/telemetry";

// Console-style pause, in the car games' bands (drift's pause): the city blurs behind a lime PAUSED, a menu you walk
// with ↑↓ / W S / the D-pad and pick with Enter, Space or A, and the controls
// beside it. B / Start resume; Esc again (handled by the page) exits.

export const CONTROLS: [string, string][] = [
  ["W A S D", "drive"],
  ["Hold Space + steer", "drift"],
  ["Hold Shift", "boost"],
  ["H", "horn"],
  ["C", "camera"],
  ["R", "reset"],
  ["F", "attack (from ? boxes)"],
  ["1 – 6", "react"],
  ["Esc", "pause"],
];

/** The same, on a phone (TouchControls). */
export const TOUCH_CONTROLS: [string, string][] = [
  ["Touch", "go"],
  ["Drag left / right", "steer"],
  ["Hold Drift", "drift (or steer hard)"],
  ["Hold Brake", "brake, then reverse"],
  ["Hold Boost", "boost"],
  ["Tap the item", "attack (from ? boxes)"],
  ["Tap a face", "react (the row over the buttons)"],
];

type Item = { id: "resume" | "camera" | "sound" | "menu" | "exit"; label: string };

// Standard gamepad buttons.
const PAD_A = 0;
const PAD_B = 1;
const PAD_START = 9;
const PAD_UP = 12;
const PAD_DOWN = 13;

export default function PauseMenu({
  camera,
  muted,
  onResume,
  onCamera,
  onMute,
  onExit,
  controls = CONTROLS,
  onMenu,
}: {
  camera: DriveCameraMode;
  muted: boolean;
  onResume: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
  /** The keys listed beside the menu (the race track has its own). */
  controls?: [string, string][];
  /** A "Race menu" item (the race track). */
  onMenu?: () => void;
}) {
  const items: Item[] = [
    { id: "resume", label: "Resume" },
    { id: "camera", label: `Camera: ${camera === "chase" ? "Chase" : "Top-down"}` },
    { id: "sound", label: `Sound: ${muted ? "Off" : "On"}` },
    ...(onMenu ? [{ id: "menu" as const, label: "Race menu" }] : []),
    { id: "exit", label: "Exit" },
  ];
  const [sel, setSel] = useState(0);

  const pick = (id: Item["id"]) => {
    if (id === "resume") onResume();
    else if (id === "camera") onCamera();
    else if (id === "sound") onMute();
    else if (id === "menu") onMenu?.();
    else onExit();
  };
  const pickRef = useRef(pick);
  const selRef = useRef(sel);
  useEffect(() => {
    pickRef.current = pick;
    selRef.current = sel;
  });

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        setSel((s) => (s + items.length - 1) % items.length);
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        setSel((s) => (s + 1) % items.length);
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        pickRef.current(items[selRef.current].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // items only changes labels, never length or order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gamepad: presses only (edges), polled per animation frame.
  useEffect(() => {
    let raf = 0;
    let prev: boolean[] = [];
    let first = true;
    const tick = () => {
      const pad = typeof navigator.getGamepads === "function" ? [...navigator.getGamepads()].find((p) => p?.connected) : null;
      if (pad) {
        const now = pad.buttons.map((b) => b.pressed);
        // Ignore buttons already held when the menu opened (the Start that paused).
        const hit = (i: number) => !first && now[i] && !prev[i];
        if (hit(PAD_UP)) setSel((s) => (s + items.length - 1) % items.length);
        if (hit(PAD_DOWN)) setSel((s) => (s + 1) % items.length);
        if (hit(PAD_A)) pickRef.current(items[selRef.current].id);
        if (hit(PAD_B) || hit(PAD_START)) pickRef.current("resume");
        prev = now;
        first = false;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The car games' look (components/games), as drift's pause: the scene
  // blurred behind, a lime PAUSED band, the items as bands (the one picked in
  // cream), the keys beside them on a wide screen, the hints under (not on a phone).
  return (
    <div role="dialog" aria-label="Paused" className="pointer-events-auto absolute inset-0 font-pixel uppercase">
      <Backdrop side="left" />
      <div className="absolute left-[6vw] top-1/2 flex w-[min(420px,calc(100vw-2rem))] -translate-y-1/2 flex-col items-stretch gap-5 max-sm:left-4">
        <Band tone="lime" className="self-start px-6 pb-3 pt-4 leading-none tracking-[0.08em]" style={{ fontSize: "clamp(40px, min(9vh, 12vw), 104px)" }}>
          Paused
        </Band>
        <div role="menu" className="flex flex-col items-stretch" style={{ fontSize: T.body }}>
          {items.map((it, i) => {
            const on = i === sel;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(it.id)}
                className={`drift-band flex min-h-11 items-center gap-4 px-5 py-3 text-left shadow-[0_6px_0_rgba(0,0,0,0.35)] outline-none ${on ? "bg-cream text-bg" : "bg-[#141417] text-cream"}`}
                style={{ animationDelay: `${60 + i * 50}ms` }}
              >
                <span className={`w-3 ${on ? "" : "opacity-0"}`} aria-hidden>
                  ▶
                </span>
                <span className="flex-1">{it.label}</span>
              </button>
            );
          })}
          <Band delay={300} className={`justify-center gap-3 px-5 py-2 text-muted ${KEYS_ONLY}`} style={{ fontSize: T.small }}>
            <Chip>↑</Chip>
            <Chip>↓</Chip> choose <Chip>Enter</Chip> select <Chip>Esc</Chip> exit
          </Band>
        </div>
      </div>
      <div className="absolute right-[6vw] top-1/2 flex w-[min(320px,30vw)] -translate-y-1/2 flex-col items-stretch max-lg:hidden">
        {controls.map(([k, v], i) => (
          <Band key={k} delay={120 + i * 30} className="justify-between gap-4 px-4 py-2" style={{ fontSize: T.small }}>
            <span className="text-cream">{k}</span>
            <span className="normal-case text-muted">{v}</span>
          </Band>
        ))}
      </div>
    </div>
  );
}
