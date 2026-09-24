"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { readInput, type DriveInput, type GamepadLike } from "@/lib/league-city/drive/input";

// Held keys from keyboard listeners plus the first connected gamepad, polled
// every frame. `input` is the level; `pressed` holds this frame's presses
// (camera, reset, horn). Off while a text field has focus.

const NONE: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, horn: false, camera: false, reset: false };
const DRIVE_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "ShiftLeft", "ShiftRight", "KeyH", "KeyC", "KeyR",
]);

function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export interface DriveInputRef {
  input: DriveInput;
  pressed: { camera: boolean; reset: boolean; horn: boolean };
}

export function useDriveInput(): React.MutableRefObject<DriveInputRef> {
  const keys = useRef(new Set<string>());
  // Keys pressed since the last frame: a tap shorter than a frame still counts once.
  const taps = useRef(new Set<string>());
  const ref = useRef<DriveInputRef>({ input: NONE, pressed: { camera: false, reset: false, horn: false } });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!DRIVE_KEYS.has(e.code)) return;
      e.preventDefault(); // no page scroll on Space and the arrows
      keys.current.add(e.code);
      if (!e.repeat) taps.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => {
      keys.current.clear();
      taps.current.clear();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame(() => {
    let pad: GamepadLike | null = null;
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p?.connected) {
        pad = p;
        break;
      }
    }
    const prev = ref.current.input;
    const held = taps.current.size > 0 ? new Set([...keys.current, ...taps.current]) : keys.current;
    taps.current.clear();
    const next = typing() ? NONE : readInput(held, pad);
    ref.current.pressed = {
      camera: next.camera && !prev.camera,
      reset: next.reset && !prev.reset,
      horn: next.horn && !prev.horn,
    };
    ref.current.input = next;
  });

  return ref;
}
