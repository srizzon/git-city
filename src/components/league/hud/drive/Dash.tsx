"use client";

import { useEffect, useRef, useState } from "react";
import { Bomb, Rocket, Zap, type LucideIcon } from "lucide-react";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { ITEM_NAMES, ITEM_NAMES_PT, isItem, type BattleItem } from "@/lib/league-city/drive/battle";
import { useLang } from "@/lib/i18n/LangProvider";
import { BOOST } from "@/lib/league-city/drive/tuning";
import { HUD_BOX } from "../shared";
import { KitDash } from "@/components/towns/brasil/heist/kit";
import type { HeistSide, KitSlot } from "@/lib/towns/heist";

// The dash, bottom center: what you hold, how fast you go, the boost.
//   item    a slot like Mario Kart's item box: empty it asks for a ? box;
//           full it shows the attack and its key, and flashes when you get it
//   speed   big digits and a block bar that fills toward boost top speed,
//           turning cyan while you boost
//   boost   the key itself, lit while held
// Playing the Brasil map's city of the day, your side's kit (`kit`) takes the
// item slot's place. Updated from telemetry every animation frame; only the
// item re-renders.

const BLOCKS = 14;
const ITEM_ICON: Record<BattleItem, LucideIcon> = { shock: Zap, bomb: Bomb, missile: Rocket };
/** A new item flashes this long (ms). */
const NEW_MS = 900;
const ATTACK = "#ff9a3c";

export default function Dash({ telemetry, style, kit = null }: { telemetry: DriveTelemetry; style?: React.CSSProperties; kit?: { slots: KitSlot[]; side: HeistSide } | null }) {
  const { lang, t } = useLang();
  const speed = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const boost = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [item, setItem] = useState<BattleItem | null>(null);

  useEffect(() => {
    let raf = 0;
    let shown: BattleItem | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const kmh = Math.round(Math.abs(telemetry.speed) * 3.6);
      if (speed.current) speed.current.textContent = String(kmh);
      const lit = Math.round(Math.min(1, Math.abs(telemetry.speed) / BOOST.topSpeed) * BLOCKS);
      const on = String(telemetry.boosting);
      if (bar.current) {
        bar.current.dataset.boost = on;
        const blocks = bar.current.children;
        for (let i = 0; i < blocks.length; i++) (blocks[i] as HTMLElement).dataset.on = String(i < lit);
      }
      if (boost.current) boost.current.dataset.on = on;
      const held = isItem(telemetry.held) ? telemetry.held : null;
      if (held !== shown) {
        shown = held;
        setItem(held);
      }
      if (slot.current) slot.current.dataset.new = String(!!held && performance.now() - telemetry.gotAt < NEW_MS);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  const Icon = item ? ITEM_ICON[item] : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center" style={style}>
      <div className={`${HUD_BOX} flex items-stretch divide-x-[3px] divide-border`}>
        {kit && <KitDash kit={kit.slots} side={kit.side} />}
        {/* Item slot */}
        <div className={`flex items-center gap-2.5 px-3 py-2 ${kit ? "hidden" : ""}`}>
          <div
            ref={slot}
            data-new="false"
            className={`relative flex h-11 w-11 items-center justify-center border-[3px] transition-transform duration-150 data-[new=true]:scale-110 data-[new=true]:bg-[#ff9a3c]/40 ${item ? "border-[#ff9a3c] bg-[#ff9a3c]/15" : "border-border"}`}
          >
            {Icon ? <Icon size={20} strokeWidth={2.5} color={ATTACK} aria-hidden /> : <span className="text-lg text-muted">?</span>}
            {item && (
              <span className="absolute -bottom-2 -right-2 border-2 bg-bg px-1 text-[9px] leading-tight text-cream" style={{ borderColor: ATTACK }}>
                F
              </span>
            )}
          </div>
          <div className="flex w-[8.5rem] flex-col gap-1 whitespace-nowrap text-[9px] leading-tight">
            {item ? (
              <>
                <span className="text-[11px]" style={{ color: "#ff9a3c" }}>
                  {(lang === "pt" ? ITEM_NAMES_PT : ITEM_NAMES)[item]}
                </span>
                <span className="text-muted">{t("Ready", "Pronto")}</span>
              </>
            ) : (
              <>
                <span className="text-muted">{t("No attack", "Sem ataque")}</span>
                <span className="text-dim normal-case">{t("Drive through a ? box", "Passe por uma caixa ?")}</span>
              </>
            )}
          </div>
        </div>

        {/* Speed */}
        <div className="flex flex-col justify-center gap-1.5 px-4 py-2">
          <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
            <span ref={speed} className="w-[3ch] text-right text-2xl leading-none text-cream">
              0
            </span>
            <span className="text-[9px] text-muted">km/h</span>
          </div>
          <div ref={bar} data-boost="false" className="group flex gap-[3px]" aria-hidden>
            {Array.from({ length: BLOCKS }, (_, i) => (
              <span
                key={i}
                data-on="false"
                className="h-2 w-2 bg-border transition-colors duration-75 data-[on=true]:bg-lime group-data-[boost=true]:data-[on=true]:bg-[#7ee8ff]"
              />
            ))}
          </div>
        </div>

        {/* Boost */}
        <div
          ref={boost}
          data-on="false"
          className="group flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors data-[on=true]:bg-[#7ee8ff]/10"
        >
          <span
            className="border-2 border-border px-2 py-0.5 text-[10px] text-cream transition-colors group-data-[on=true]:border-[#7ee8ff] group-data-[on=true]:text-[#7ee8ff] group-data-[on=true]:shadow-[0_0_12px_rgba(126,232,255,0.6)]"
          >
            Shift
          </span>
          <span className="text-[9px] text-muted group-data-[on=true]:text-[#7ee8ff]">{t("Boost", "Turbo")}</span>
        </div>
      </div>
    </div>
  );
}
