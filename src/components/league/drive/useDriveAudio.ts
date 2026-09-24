"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Howl, Howler } from "howler";
import { startHorn } from "@/lib/league-city/drive/horn";
import { STEER } from "@/lib/league-city/drive/tuning";
import type { CarApi } from "./Car";
import type { DriveInputRef } from "./useDriveInput";

// Engine loop whose rate follows speed, a skid loop whose volume follows the
// slip, crash one-shots scaled by the hit, and the synthesized horn. Created
// when drive mode mounts, right after the Drive click; Howler unlocks audio
// on the first key press if the browser still holds it. Mute and a hidden
// tab pause everything.

const BASE = "/sounds/drive";

export function useDriveAudio({
  car,
  input,
  impact,
  muted,
}: {
  car: React.MutableRefObject<CarApi | null>;
  input: React.MutableRefObject<DriveInputRef>;
  impact: React.MutableRefObject<{ strength: number; at: number }>;
  muted: boolean;
}) {
  const sounds = useRef<{ engine: Howl; skid: Howl; impact: Howl } | null>(null);
  const hornStop = useRef<(() => void) | null>(null);
  const lastHit = useRef(0);
  const silent = useRef(muted);

  useEffect(() => {
    const engine = new Howl({ src: [`${BASE}/engine.ogg`], loop: true, volume: 0.35 });
    const skid = new Howl({ src: [`${BASE}/skid.ogg`], loop: true, volume: 0 });
    const hit = new Howl({ src: [`${BASE}/impact.ogg`], volume: 0.6 });
    engine.play();
    skid.play();
    sounds.current = { engine, skid, impact: hit };
    return () => {
      hornStop.current?.();
      engine.unload();
      skid.unload();
      hit.unload();
      sounds.current = null;
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      const s = sounds.current;
      if (!s) return;
      silent.current = muted || document.hidden;
      for (const h of [s.engine, s.skid, s.impact]) h.mute(silent.current);
      if (document.hidden) {
        s.engine.pause();
        s.skid.pause();
      } else {
        if (!s.engine.playing()) s.engine.play();
        if (!s.skid.playing()) s.skid.play();
      }
      if (silent.current) {
        hornStop.current?.();
        hornStop.current = null;
      }
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [muted]);

  useFrame(() => {
    const s = sounds.current;
    const c = car.current;
    if (!s || !c) return;
    const st = c.state;
    const speedT = Math.min(1.4, Math.abs(st.speed) / STEER.topSpeed);
    s.engine.rate(0.7 + speedT * 1.1 + (st.boosting ? 0.25 : 0));
    s.skid.volume(Math.min(0.7, st.slip * 0.8));

    const hit = impact.current;
    if (hit.at !== lastHit.current && hit.strength > 0.08) {
      lastHit.current = hit.at;
      s.impact.volume(0.2 + hit.strength * 0.8);
      s.impact.play();
    }

    const horn = input.current.input.horn && !silent.current;
    if (horn && !hornStop.current && Howler.ctx && Howler.masterGain) {
      hornStop.current = startHorn(Howler.ctx, Howler.masterGain);
    } else if (!horn && hornStop.current) {
      hornStop.current();
      hornStop.current = null;
    }
  });
}
