"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { floorScoring } from "@/lib/towns/play-board";
import { HUD_BOX } from "../shared";
import { useT } from "@/lib/i18n/LangProvider";

// Smash, above the honk prompt: "sign in" for a while after you run into a
// building signed out, how long a shielded one has left when you run into
// it, and the floor count while you're parked against your own broken
// building (the drive room builds it back). Over the dash, your floor points
// today against the day's cap, and a note when you hit it. On a phone the
// chips sit over the touch controls and the points counter stays off.
// Read from the telemetry every animation frame, like the honk prompt.

const HINT_MS = 4500;

export default function SmashNotice({ telemetry, touch = false }: { telemetry: DriveTelemetry; touch?: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const hint = useRef<HTMLDivElement>(null);
  const shield = useRef<HTMLDivElement>(null);
  const hours = useRef<HTMLSpanElement>(null);
  const rebuild = useRef<HTMLDivElement>(null);
  const floors = useRef<HTMLSpanElement>(null);
  const today = useRef<HTMLDivElement>(null);
  const todayPts = useRef<HTMLSpanElement>(null);
  const maxed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let hinted = false;
    const tick = () => {
      const now = performance.now();
      if (hint.current) {
        const on = telemetry.sideHintAt > 0 && now - telemetry.sideHintAt < HINT_MS;
        hint.current.dataset.on = String(on);
        // Once a drive: a guest ran into a building it can't knock down.
        if (on && !hinted) {
          hinted = true;
          posthog.capture("smash_hint_shown", { path: pathname });
        }
      }
      if (shield.current && hours.current) {
        const on = telemetry.shieldHintAt > 0 && now - telemetry.shieldHintAt < HINT_MS;
        shield.current.dataset.on = String(on);
        if (on) hours.current.textContent = `${telemetry.shieldHours}h`;
      }
      if (rebuild.current && floors.current) {
        const on = telemetry.rebuildOf > 0;
        rebuild.current.dataset.on = String(on);
        if (on) floors.current.textContent = `${telemetry.rebuildFloors}/${telemetry.rebuildOf}`;
      }
      if (today.current && todayPts.current) {
        const n = telemetry.floorsToday;
        today.current.dataset.on = String(n !== null);
        if (n !== null) {
          const { per, cap } = floorScoring(Date.now());
          todayPts.current.textContent = `${Math.min(n * per, cap)}/${cap}`;
        }
      }
      if (maxed.current) maxed.current.dataset.on = String(telemetry.floorsMaxedAt > 0 && now - telemetry.floorsMaxedAt < HINT_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [telemetry, pathname]);

  // The box without its pointer-events-auto: the chips only take the pointer while they show.
  const chip = `${HUD_BOX.replace("pointer-events-auto", "")} absolute ${touch ? "bottom-[12.5rem]" : "bottom-32"} left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[10px] text-cream opacity-0 transition-opacity data-[on=true]:opacity-100`;
  return (
    <>
      <div ref={hint} data-on="false" className={`${chip} pointer-events-none data-[on=true]:pointer-events-auto`}>
        {t("Sign in to knock buildings down", "Entre pra derrubar prédios")}
        <a
          href={`/api/auth/github?redirect=${encodeURIComponent(`${pathname}?drive=1`)}`}
          onClick={() => posthog.capture("signin_clicked", { where: "smash_hint", path: pathname })}
          className="border-2 border-lime px-1.5 text-lime hover:bg-lime/10"
        >
          {t("Sign in", "Entrar")}
        </a>
      </div>
      <div ref={shield} data-on="false" className={`${chip} pointer-events-none`}>
        {t("Just fell. Shielded for", "Acabou de cair. Protegido por")} <span ref={hours} className="text-lime" />
      </div>
      <div ref={rebuild} data-on="false" className={`${chip} pointer-events-none`}>
        <span className="h-1.5 w-1.5 animate-pulse bg-lime" aria-hidden />
        {t("Rebuilding", "Reconstruindo")} <span ref={floors} className="text-lime" /> {t("floors", "andares")}
      </div>
      <div ref={maxed} data-on="false" className={`${chip} pointer-events-none`}>
        {t("Floors maxed for today", "Limite de andares de hoje")}
      </div>
      {!touch && (
        <div
          ref={today}
          data-on="false"
          className={`${chip.replace("bottom-32", "bottom-[5.5rem]")} pointer-events-none`}
          aria-label={t("Floor points today", "Pontos de andares hoje")}
        >
          <span className="text-muted">{t("Floors today", "Andares hoje")}</span>
          <span ref={todayPts} className="text-lime tabular-nums" />
          <span className="text-muted">pts</span>
        </div>
      )}
    </>
  );
}
