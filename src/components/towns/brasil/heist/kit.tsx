"use client";

import { Bird, Bomb, Magnet, MonitorX, Rocket, type LucideIcon } from "lucide-react";
import { KIT_NAMES, type HeistSide, type KitItem, type KitSlot } from "@/lib/towns/heist";
import { useLang } from "@/lib/i18n/LangProvider";

// A side's three weapons, in place of the ? box slot while you play the city
// of the day. On the dash (desktop) three squares as tall as the item slot
// they replace, so the dash keeps its height and the chips over it stay
// clear, each with its key (Q, E, F; 1 to 6 are reactions). On a phone a
// column over Boost, under the right thumb and away from the horn's name.
// A charging slot shows the seconds left over a fill that rises as it charges
// back. Robbers in the attacks' orange, cops in blue.

export const KIT_ICON: Record<KitItem, LucideIcon> = { missile: Rocket, duck: Bird, bomb: Bomb, magnet: Magnet, bluescreen: MonitorX };
export const SIDE_COLOR: Record<HeistSide, string> = { robber: "#ff9a3c", cop: "#5aa0ff" };
const IDLE = "#2a2a30";

/** The dash's slots (replaces the item slot). */
export function KitDash({ kit, side }: { kit: KitSlot[]; side: HeistSide }) {
  const { lang } = useLang();
  const color = SIDE_COLOR[side];
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {kit.map((s) => {
        const Icon = KIT_ICON[s.item];
        const ready = s.charging === 0;
        return (
          <div
            key={s.key}
            title={KIT_NAMES[s.item][lang === "pt" ? 1 : 0]}
            className="relative flex h-11 w-11 items-center justify-center border-[3px]"
            style={{ borderColor: ready ? color : IDLE, background: ready ? `${color}26` : undefined }}
          >
            {ready ? (
              <Icon size={20} strokeWidth={2.5} color={color} aria-hidden />
            ) : (
              <>
                <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.round((1 - s.charging) * 100)}%`, background: `${color}33` }} aria-hidden />
                <span className="relative text-[11px] tabular-nums text-cream">{s.secs}s</span>
              </>
            )}
            <span className="absolute -bottom-2 -right-2 border-2 bg-bg px-1 text-[9px] leading-tight text-cream" style={{ borderColor: ready ? color : IDLE }}>
              {s.key}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The phone's column of three, over Boost. */
export function KitTouch({ kit, side, onUse }: { kit: KitSlot[]; side: HeistSide; onUse?: (key: KitSlot["key"]) => void }) {
  const { lang } = useLang();
  const color = SIDE_COLOR[side];
  return (
    <div className="flex flex-col items-center gap-1.5">
      {kit.map((s) => {
        const Icon = KIT_ICON[s.item];
        const ready = s.charging === 0;
        return (
          <button
            key={s.key}
            type="button"
            disabled={!ready}
            onClick={() => onUse?.(s.key)}
            aria-label={KIT_NAMES[s.item][lang === "pt" ? 1 : 0]}
            className="pointer-events-auto relative flex h-11 w-11 touch-none select-none items-center justify-center border-[3px] bg-bg/80 backdrop-blur-sm"
            style={{ borderColor: ready ? color : "#3a3a44", color }}
          >
            {!ready && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.round((1 - s.charging) * 100)}%`, background: `${color}33` }} aria-hidden />}
            {ready ? <Icon size={18} strokeWidth={2.5} aria-hidden /> : <span className="relative text-[11px] tabular-nums text-cream">{s.secs}s</span>}
          </button>
        );
      })}
    </div>
  );
}
