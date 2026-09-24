"use client";

import { useEffect, useRef, useState } from "react";
import type { DriveCameraMode } from "@/lib/league-city/drive/telemetry";

// Console-style pause: the city blurs behind a big PAUSED, a menu you walk
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
  ["Esc", "pause"],
];

type Item = { id: "resume" | "camera" | "sound" | "exit"; label: string };

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
}: {
  camera: DriveCameraMode;
  muted: boolean;
  onResume: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const items: Item[] = [
    { id: "resume", label: "Resume" },
    { id: "camera", label: `Camera: ${camera === "chase" ? "Chase" : "Top-down"}` },
    { id: "sound", label: `Sound: ${muted ? "Off" : "On"}` },
    { id: "exit", label: "Exit" },
  ];
  const [sel, setSel] = useState(0);

  const pick = (id: Item["id"]) => {
    if (id === "resume") onResume();
    else if (id === "camera") onCamera();
    else if (id === "sound") onMute();
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

  return (
    <div
      role="dialog"
      aria-label="Paused"
      className="pointer-events-auto absolute inset-0 flex animate-[fade-in_0.15s_ease-out] items-center justify-center bg-bg/60 backdrop-blur-md"
    >
      <div className="flex flex-col gap-10 px-6">
        <h2 className="text-4xl tracking-[0.3em] text-cream sm:text-5xl">Paused</h2>

        <div className="flex gap-16">
          <ul className="flex min-w-[220px] flex-col gap-3" role="menu">
            {items.map((it, i) => (
              <li key={it.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(it.id)}
                  className={`flex items-center gap-3 text-sm transition-colors ${sel === i ? "text-lime" : "text-muted hover:text-cream"}`}
                >
                  <span aria-hidden className={`w-3 ${sel === i ? "animate-pulse" : "invisible"}`}>
                    ▶
                  </span>
                  {it.label}
                </button>
              </li>
            ))}
          </ul>

          <dl className="hidden grid-cols-[auto_auto] gap-x-6 gap-y-2 self-start text-[10px] sm:grid">
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-cream">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[9px] text-dim">↑↓ choose · Enter select · Esc exit</p>
      </div>
    </div>
  );
}
