"use client";

import { Bird, Bomb, Magnet, MonitorX, Rocket, type LucideIcon } from "lucide-react";
import { KIT_NAMES, type HeistSide, type KitItem, type KitSlot } from "@/lib/towns/heist";
import { useLang } from "@/lib/i18n/LangProvider";

// A side's three weapons, in place of the ? box slot while you play the city
// of the day: on the dash (desktop, keys 1 2 3) and as a row of buttons over
// the phone's controls. A charging slot shows the seconds left over a fill
// that rises as it charges back. Robbers in the attacks' orange, cops in blue.

export const KIT_ICON: Record<KitItem, LucideIcon> = { missile: Rocket, duck: Bird, bomb: Bomb, magnet: Magnet, bluescreen: MonitorX };
export const SIDE_COLOR: Record<HeistSide, string> = { robber: "#ff9a3c", cop: "#5aa0ff" };
const IDLE = "#5c5c6c";

/** The dash's slots (replaces the item slot). */
export function KitDash({ kit, side }: { kit: KitSlot[]; side: HeistSide }) {
  const { lang } = useLang();
  const color = SIDE_COLOR[side];
  return (
    <div className="flex items-center gap-1 px-2 py-2">
      {kit.map((s) => {
        const Icon = KIT_ICON[s.item];
        const ready = s.charging === 0;
        return (
          <div key={s.key} className="flex w-14 flex-col items-center gap-1.5">
            <div
              className="relative flex h-11 w-11 items-center justify-center border-[3px]"
              style={{ borderColor: ready ? color : "#2a2a30", background: ready ? `${color}26` : undefined }}
            >
              {ready ? (
                <Icon size={20} strokeWidth={2.5} color={color} aria-hidden />
              ) : (
                <>
                  <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.round((1 - s.charging) * 100)}%`, background: `${color}33` }} aria-hidden />
                  <span className="relative text-[11px] tabular-nums text-cream">{s.secs}s</span>
                </>
              )}
              <span className="absolute -bottom-2 -right-2 border-2 bg-bg px-1 text-[9px] leading-tight text-cream" style={{ borderColor: ready ? color : "#2a2a30" }}>
                {s.key}
              </span>
            </div>
            <span className="whitespace-nowrap text-[8px]" style={{ color: ready ? color : IDLE }}>
              {KIT_NAMES[s.item][lang === "pt" ? 1 : 0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The phone's row of three, over the controls. */
export function KitTouch({ kit, side }: { kit: KitSlot[]; side: HeistSide }) {
  const { lang } = useLang();
  const color = SIDE_COLOR[side];
  return (
    <div className="flex items-end justify-center gap-2.5">
      {kit.map((s) => {
        const Icon = KIT_ICON[s.item];
        const ready = s.charging === 0;
        const name = KIT_NAMES[s.item][lang === "pt" ? 1 : 0];
        return (
          <button
            key={s.key}
            type="button"
            disabled={!ready}
            aria-label={name}
            className="pointer-events-auto relative flex h-14 w-14 touch-none select-none flex-col items-center justify-center gap-1 border-[3px] bg-bg/80 text-[7px] backdrop-blur-sm"
            style={{ borderColor: ready ? color : "#3a3a44", color: ready ? color : IDLE }}
          >
            {!ready && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.round((1 - s.charging) * 100)}%`, background: `${color}33` }} aria-hidden />}
            {ready ? <Icon size={18} strokeWidth={2.5} aria-hidden /> : <span className="relative text-[12px] tabular-nums text-cream">{s.secs}s</span>}
            <span className="relative">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
